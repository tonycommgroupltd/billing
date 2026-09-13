import { http } from '../helpers';
import CustomersAPI from './CustomersAPI';
import TicketsAPI from './TicketsAPI';
import { normalizeKenyanPhone, kenyanPhonesMatch } from '../utils/phone';
import {
  getTicketCustomerAddress,
  getTicketCustomerName,
  getTicketCustomerPhone,
  getTicketPackage,
  getTicketPinLocation,
  isEligibleUnconfiguredTicket,
  isTicketConfigured,
  isUnconfiguredRevoked,
  isUnconfiguredTicketType,
  normalizePlanKey,
  upsertConfiguredLine,
} from '../utils/ticketInstallationDetails';

const UNCONFIGURED_LIST_TYPES = ['Installation', 'Installation 2', 'Relocation'];

/** Normalize tickets API list payloads (array or { data: [] }). */
export const extractTicketsFromApiPayload = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.tickets)) return payload.tickets;
  return [];
};

const DEFAULT_BILLING_TYPE = { value: 1, label: 'Recurring' };
const DEFAULT_CATEGORY = { value: 1, label: 'Individual' };
const DEFAULT_BILLING_PERIOD = { value: 3, label: 'Monthly' };
const ACTIVE_STATUS = { value: 2, label: 'Active' };

const randomPassword = (length = 8) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
};

/**
 * PPPoE username from customer name: "John Maina" → "johnmaina".
 *
 * No separator: of the 5,048 existing services only one contains a dash, and
 * SmartOLT ONUs are matched to billing by this exact string, so a dashed name
 * would drift away from both RADIUS and the OLT.
 */
export const buildMikrotikNameFromCustomer = (name) => {
  const parts =
    String(name || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .match(/[a-z0-9]+/g) || [];
  const base = parts.join('') || 'user';
  return base.slice(0, 32);
};

/** PPPoE password = account phone (Kenyan local 07… / 01…). */
export const buildMikrotikPasswordFromPhone = (phone) => {
  const normalized = normalizeKenyanPhone(phone);
  if (/^0[17]\d{8}$/.test(normalized)) return normalized;
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length >= 9) {
    const last9 = digits.slice(-9);
    if (last9.startsWith('7') || last9.startsWith('1')) return `0${last9}`;
  }
  return (digits || '0000').slice(0, 30);
};

const nairobiNow = () =>
  new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' });

const extractCustomerId = (payload) =>
  payload?.customer?.id ||
  payload?.data?.id ||
  payload?.data?.customer?.id ||
  payload?.id ||
  null;

const extractServiceId = (payload) =>
  payload?.service?.id ||
  payload?.data?.id ||
  payload?.data?.service?.id ||
  payload?.id ||
  null;

/** First speed number in a package/plan label (5, 5mb, 5 mbps → 5). */
const extractPrimarySpeed = (value) => {
  const raw = String(value || '').toLowerCase();
  const withUnit = raw.match(/(\d+(?:\.\d+)?)\s*(mbps|mb\/s|mbit\/s|mbits|mb|m)\b/);
  if (withUnit) return Number(withUnit[1]);
  const bare = raw.match(/(\d+(?:\.\d+)?)/);
  return bare ? Number(bare[1]) : null;
};

/** Treat 5mb / 5m / 5 mbps as the same key family. */
const canonicalizePlanKey = (value) =>
  normalizePlanKey(value)
    .replace(/(\d+)mbit(?:s)?$/, '$1mbps')
    .replace(/(\d+)mb$/, '$1mbps')
    .replace(/(\d+)m$/, '$1mbps');

/**
 * Score how well a tariff plan title matches a ticket package.
 * Must NOT let "5mbps" match "15mbps" via substring includes.
 */
const scorePlanMatch = (planTitle, packageName) => {
  const planKey = canonicalizePlanKey(planTitle);
  const packageKey = canonicalizePlanKey(packageName);
  if (!planKey || !packageKey) return 0;

  if (planKey === packageKey) return 100;

  const planSpeed = extractPrimarySpeed(planTitle);
  const packageSpeed = extractPrimarySpeed(packageName);

  // Hard reject different Mbps numbers (5 vs 15, 10 vs 100, …)
  if (planSpeed != null && packageSpeed != null && planSpeed !== packageSpeed) {
    return 0;
  }

  if (planSpeed != null && packageSpeed != null && planSpeed === packageSpeed) {
    // Same speed — prefer titles that look like that speed plan
    if (planKey.includes(`${packageSpeed}mbps`) || packageKey.includes(`${planSpeed}mbps`)) {
      return 95;
    }
    return 85;
  }

  // No reliable speeds: allow includes only when it is not a digit-suffix trap
  if (planKey.includes(packageKey) || packageKey.includes(planKey)) {
    return 40;
  }

  return 0;
};

const buildPackageSearchTerms = (query) => {
  const terms = new Set([String(query || '').trim()].filter(Boolean));
  const speed = extractPrimarySpeed(query);
  if (speed != null && Number.isFinite(speed)) {
    const n = String(speed);
    terms.add(n);
    terms.add(`${n}mbps`);
    terms.add(`${n} mbps`);
    terms.add(`${n}mb`);
    terms.add(`${n} mb`);
  }
  return Array.from(terms);
};

export const findPlanForPackage = async (packageName) => {
  const query = String(packageName || '').trim();
  if (!query) throw new Error('Package is required to match a plan.');

  const searches = buildPackageSearchTerms(query);
  const packageSpeed = extractPrimarySpeed(query);

  let best = null;
  let bestScore = 0;

  for (const search of searches) {
    const response = await http.get('/get-plans', {
      params: { q: search, page: 1 },
    });
    const rawOptions = response?.data?.options;
    const options = Array.isArray(rawOptions)
      ? rawOptions
      : Array.isArray(rawOptions?.data)
        ? rawOptions.data
        : [];
    options.forEach((plan) => {
      const title = plan.title || plan.label || '';
      // Skip plans whose speed differs from the ticket package (API may return 15 for q=5)
      const planSpeed = extractPrimarySpeed(title);
      if (
        packageSpeed != null &&
        planSpeed != null &&
        packageSpeed !== planSpeed
      ) {
        return;
      }
      const score = scorePlanMatch(title, query);
      if (score > bestScore) {
        bestScore = score;
        best = plan;
      }
    });
    // Exact / same-speed match — stop searching further terms
    if (bestScore >= 95) break;
  }

  if (!best || bestScore < 60) {
    throw new Error(
      `No matching tariff plan found for package "${query}". Update the ticket package to match an existing plan title.`
    );
  }

  return best;
};

/**
 * Resolve a billing (Laravel tonycomm) customer by phone.
 *
 * IMPORTANT: must NOT use the tickets API — ticket customer IDs are a different
 * database. Navigating to /admin/customers/view/{ticketsId} then 404s every
 * Laravel session/stats call (Customer not found).
 */
export const resolveCustomerByPhone = async (phone) => {
  const normalized = normalizeKenyanPhone(phone);
  if (!/^0[17]\d{8}$/.test(normalized)) {
    throw new Error('Enter a valid Kenyan phone number on the ticket first.');
  }

  // One LIKE query on the 9-digit national number matches 07… / 254… / +254…
  // (Unconfigured used to fire 3 digests × N rows and trip Laravel's 60/min throttle).
  const national = normalized.slice(1);
  const digests = [national, normalized];

  for (const q of digests) {
    try {
      const response = await http.get('/list-customers', {
        params: {
          q,
          page: 1,
          per_page: 20,
          sort_col: 'id',
          sort: 'desc',
          light: 1, // skip RADIUS online enrichment — phone match only
        },
        timeout: 15000,
      });
      const payload = response?.data;
      let rows = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.data?.data)
          ? payload.data.data
          : Array.isArray(payload)
            ? payload
            : [];
      // Paginated ResourceCollection sometimes nests one more level.
      if (!Array.isArray(rows) && Array.isArray(rows?.data)) {
        rows = rows.data;
      }

      const match = rows.find((row) =>
        kenyanPhonesMatch(row?.phone_number || row?.phone || '', normalized)
      );

      if (match?.id) {
        return {
          exists: true,
          phone: normalized,
          customer: match,
        };
      }
      // National search already covers format variants — no need for 07… pass if empty.
      if (q === national) {
        return { exists: false, phone: normalized, customer: null };
      }
    } catch (error) {
      console.warn('Laravel customer phone lookup failed:', error?.message || error);
      const status = error?.response?.status;
      // Network / timeout / rate-limit — stop; don't cascade more lookups.
      if (!error?.response || status === 429 || status === 503) {
        break;
      }
    }
  }

  return { exists: false, phone: normalized, customer: null };
};

/**
 * Create or resolve customer + match plan for an installation ticket.
 * Service is added via the Create service wizard (step-by-step), not here.
 */
const syncTicketsPinLocation = async (phone, pin) => {
  if (!pin?.latitude || !pin?.longitude || !phone) return;
  try {
    const search = await CustomersAPI.searchByPhone(phone);
    const ticketsCustomerId = search?.data?.id;
    if (!ticketsCustomerId) return;
    await CustomersAPI.updateCustomerLocation(ticketsCustomerId, {
      latitude: pin.latitude,
      longitude: pin.longitude,
    });
  } catch (error) {
    console.warn('Could not sync installation pin to tickets customer:', error?.message || error);
  }
};

export const prepareTicketCustomer = async (ticket) => {
  const name = getTicketCustomerName(ticket);
  const phoneRaw = getTicketCustomerPhone(ticket);
  const address = getTicketCustomerAddress(ticket);
  const packageName = getTicketPackage(ticket);
  const pin = getTicketPinLocation(ticket);

  if (!name || !phoneRaw || !address || !packageName) {
    throw new Error('Ticket is missing name, phone, address, or package.');
  }
  if (!pin) {
    throw new Error('Ticket is missing pin location. Capture and save it on Installation customer details first.');
  }

  const phoneLookup = await resolveCustomerByPhone(phoneRaw);
  const phone = phoneLookup.phone;
  let customer = phoneLookup.customer;
  let customerCreated = false;

  if (!customer) {
    try {
      // Same Laravel endpoint as Customers → Add (not tickets-api).
      const createResponse = await CustomersAPI.create({
        billing_type: DEFAULT_BILLING_TYPE,
        category: DEFAULT_CATEGORY,
        name,
        address,
        phone_number: phone,
        password: randomPassword(10),
        city: '',
      });

      const customerId = extractCustomerId(createResponse);
      if (!customerId) {
        throw new Error(createResponse?.message || 'Customer was created but no ID was returned.');
      }

      customer = createResponse.customer || createResponse.data || { id: customerId, name, phone_number: phone };
      customer.id = customerId;
      customerCreated = true;
    } catch (createError) {
      // Phone may have been created concurrently — reuse existing customer.
      const retry = await resolveCustomerByPhone(phone);
      if (!retry.exists || !retry.customer?.id) {
        const data = createError?.response?.data;
        const apiMessage =
          (data && typeof data === 'object' && !Array.isArray(data)
            ? data.phone_number?.[0] ||
              data.name?.[0] ||
              data.error ||
              data.message ||
              Object.values(data).flat?.()?.[0]
            : null) ||
          createError?.message;
        throw new Error(
          typeof apiMessage === 'string' ? apiMessage : 'Failed to create customer on production API.'
        );
      }
      customer = retry.customer;
      customerCreated = false;
    }
  }

  const plan = await findPlanForPackage(packageName);
  const mikrotikName = buildMikrotikNameFromCustomer(name);
  const mikrotikPassword = buildMikrotikPasswordFromPhone(phone);

  await syncTicketsPinLocation(phone, pin);

  return {
    customerCreated,
    customer,
    plan,
    packageName,
    phone,
    address,
    name,
    pin,
    mikrotikName,
    mikrotikPassword,
    ticketId: ticket.id,
  };
};

/**
 * Find Unconfigured-eligible installation/relocation tickets for a billing phone.
 * Used to clear the Unconfigured list after a service is added or put online.
 */
export const findEligibleUnconfiguredTicketsByPhone = async (phone) => {
  const normalized = normalizeKenyanPhone(phone);
  if (!normalized) return [];

  const responses = await Promise.all(
    UNCONFIGURED_LIST_TYPES.map((type) =>
      TicketsAPI.getAll({ type, per_page: 10000 }).catch(() => ({ data: [] }))
    )
  );

  const byId = new Map();
  responses.forEach((response) => {
    extractTicketsFromApiPayload(response).forEach((ticket) => {
      if (ticket?.id != null) byId.set(Number(ticket.id), ticket);
    });
  });

  return Array.from(byId.values()).filter(
    (ticket) =>
      isEligibleUnconfiguredTicket(ticket) &&
      kenyanPhonesMatch(getTicketCustomerPhone(ticket), normalized)
  );
};

/**
 * Mark Unconfigured tickets as Configured so they leave /admin/customers/unconfigured.
 *
 * - With ticketId: only that ticket is cleared (so a second install ticket for the same
 *   phone can still appear for another service).
 * - Without ticketId: clear all eligible tickets for the phone (plain Add service path).
 */
export const clearUnconfiguredTicketsForCustomer = async ({
  phone,
  ticketId = null,
  actorName = 'System',
  customerId,
  serviceId,
  customerCreated = false,
  packageName,
  name,
  address,
  clearAllForPhone = null,
} = {}) => {
  const byId = new Map();
  const explicitId = ticketId != null && ticketId !== '' ? Number(ticketId) : null;
  const clearPhoneMatches =
    clearAllForPhone != null ? Boolean(clearAllForPhone) : !explicitId;

  if (clearPhoneMatches && phone) {
    const matched = await findEligibleUnconfiguredTicketsByPhone(phone);
    matched.forEach((ticket) => byId.set(Number(ticket.id), ticket));
  }

  if (explicitId && !Number.isNaN(explicitId) && !byId.has(explicitId)) {
    try {
      const fetched = await TicketsAPI.getById(explicitId);
      const ticket = fetched?.data || fetched;
      if (
        ticket?.id &&
        isUnconfiguredTicketType(ticket) &&
        !isTicketConfigured(ticket) &&
        !isUnconfiguredRevoked(ticket)
      ) {
        byId.set(Number(ticket.id), ticket);
      } else if (ticket?.id && isUnconfiguredTicketType(ticket) && !isTicketConfigured(ticket)) {
        byId.set(Number(ticket.id), ticket);
      }
    } catch {
      byId.set(explicitId, { id: explicitId });
    }
  }

  const cleared = [];
  for (const ticket of byId.values()) {
    try {
      await markTicketConfigured(ticket, {
        actorName,
        customerId,
        serviceId,
        customerCreated,
        packageName: packageName || getTicketPackage(ticket),
        name: name || getTicketCustomerName(ticket),
        phone: phone || getTicketCustomerPhone(ticket),
        address: address || getTicketCustomerAddress(ticket),
      });
      cleared.push(Number(ticket.id));
    } catch (error) {
      console.warn(
        `[unconfigured] Failed to mark ticket #${ticket?.id} configured:`,
        error?.message || error
      );
    }
  }

  return cleared;
};

/** After the service wizard finishes, mark the installation ticket as configured. */
export const markTicketConfigured = async (ticket, meta = {}) => {
  const {
    actorName = 'System',
    customerId,
    serviceId,
    customerCreated = false,
    packageName,
    name,
    phone,
    address,
  } = meta;

  const configuredDetails = [
    new Date().toISOString().slice(0, 19).replace('T', ' '),
    `by ${actorName}`,
    customerId ? `customer #${customerId}` : null,
    serviceId ? `service #${serviceId}` : null,
    customerCreated ? 'customer created' : 'existing customer',
    packageName ? `package ${packageName}` : null,
  ]
    .filter(Boolean)
    .join(' | ');

  const description = upsertConfiguredLine(ticket.description || meta.description || '', configuredDetails);

  await TicketsAPI.update(ticket.id, {
    customerName: name || getTicketCustomerName(ticket),
    customerPhone: phone || getTicketCustomerPhone(ticket),
    address: address || getTicketCustomerAddress(ticket),
    description,
    customer_id: customerId,
    customerId,
  });

  return { description };
};

/** @deprecated Prefer prepareTicketCustomer + Create service wizard. Kept for one-shot scripts. */
export const authorizeTicketCustomer = async (ticket, actorName = 'System') => {
  const prepared = await prepareTicketCustomer(ticket);
  const now = nairobiNow();

  const serviceResponse = await http.post('/add-services', {
    customer_id: prepared.customer.id,
    plan_id: prepared.plan.id,
    installation: true,
    generate_invoice: false,
    use_credit: false,
    due_date: now,
    mikrotik_name: prepared.mikrotikName,
    mikrotik_password: prepared.mikrotikPassword,
    installation_fee: 0,
    price: prepared.plan.price || 0,
    billing_type: DEFAULT_BILLING_TYPE,
    billing_period: DEFAULT_BILLING_PERIOD,
    start_date: now,
    end_date: '',
    bill_to: now,
    status: ACTIVE_STATUS,
  });

  if (serviceResponse?.data?.error) {
    throw new Error(serviceResponse.data.message || 'Failed to create service.');
  }

  const serviceId = extractServiceId(serviceResponse?.data) || extractServiceId(serviceResponse);
  await clearUnconfiguredTicketsForCustomer({
    phone: prepared.phone,
    ticketId: ticket.id,
    actorName,
    customerId: prepared.customer.id,
    serviceId,
    customerCreated: prepared.customerCreated,
    packageName: prepared.packageName,
    name: prepared.name,
    address: prepared.address,
  });

  return {
    customerCreated: prepared.customerCreated,
    customer: prepared.customer,
    service: serviceResponse?.data?.service || { id: serviceId },
    plan: prepared.plan,
    mikrotikName: prepared.mikrotikName,
    mikrotikPassword: prepared.mikrotikPassword,
  };
};
