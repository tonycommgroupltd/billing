import { http } from './http';

const ACTIVE = 2;
const EXPIRED = 3;

function statusValue(status) {
  if (status == null) return 0;
  if (typeof status === 'object') return Number(status.value || 0);
  if (typeof status === 'string') {
    try {
      const parsed = JSON.parse(status);
      return Number(parsed?.value || 0);
    } catch {
      return 0;
    }
  }
  return Number(status) || 0;
}

async function fetchAllBillingCustomers(billingType) {
  const perPage = 500;
  let page = 1;
  let totalPages = 1;
  const customers = [];

  while (page <= totalPages) {
    const response = await http.get('/list-customers-by-billing-type', {
      params: {
        billing_type: billingType,
        filter: 'all',
        page,
        per_page: perPage,
      },
    });
    const chunk = response.data?.data || [];
    customers.push(...chunk);
    totalPages = Number(response.data?.total_pages || 1);
    page += 1;
    if (page > 50) break;
  }

  return customers;
}

async function fetchAllPlans() {
  const perPage = 200;
  let page = 1;
  let totalPages = 1;
  const plans = [];

  while (page <= totalPages) {
    const response = await http.get('/list-plans', {
      params: { page, per_page: perPage, sort_col: 'title', sort: 'asc' },
    });
    const chunk = response.data?.data || [];
    const rows = Array.isArray(chunk) ? chunk : chunk?.data || [];
    plans.push(...rows);
    totalPages = Number(response.data?.total_pages || 1);
    page += 1;
    if (page > 20) break;
  }

  return plans;
}

/**
 * Prefer Contabo GET /package-usage (one SQL aggregation).
 * Fall back to paging list-customers-by-billing-type only if that route 404s.
 */
export async function loadPackageUsage({ includeEmpty = false } = {}) {
  try {
    const response = await http.get('/package-usage', {
      params: includeEmpty ? { all: 1 } : {},
      timeout: 60000,
    });
    if (response?.data?.data) {
      return {
        summary: response.data.summary || null,
        data: response.data.data || [],
        source: 'api',
      };
    }
  } catch (err) {
    const status = err?.response?.status;
    if (status && status !== 404) {
      throw err;
    }
  }

  return buildPackageUsageFallback({ includeEmpty });
}

/** Customers for one unique package (all plan rows with same title+price). */
export async function loadPackageUsageCustomers(plan, filter = 'all') {
  const planId = typeof plan === 'object' ? plan?.plan_id : plan;
  const planIds = typeof plan === 'object' && Array.isArray(plan?.plan_ids)
    ? plan.plan_ids
    : null;

  try {
    const response = await http.get(`/package-usage/${planId || 0}/customers`, {
      params: {
        ...(filter && filter !== 'all' ? { filter } : {}),
        ...(planIds?.length ? { plan_ids: planIds.join(',') } : {}),
      },
      timeout: 60000,
    });
    if (Array.isArray(response?.data?.data)) {
      return response.data.data;
    }
  } catch (err) {
    const status = err?.response?.status;
    if (status && status !== 404) {
      throw err;
    }
  }
  return null;
}

function packageGroupKey(title, price) {
  const identity = normalizePackageIdentity(title);
  const normalizedPrice = Number(price || 0).toFixed(2);
  return `${identity.key}|${normalizedPrice}`;
}

function normalizePackageIdentity(title) {
  const raw = String(title || '').trim().replace(/\s+/g, ' ');
  const lower = raw.toLowerCase();
  const match = lower.match(/(\d+(?:\.\d+)?)\s*(gbps|gbit\/s|gb|mbps|mbit\/s|mbit|mb\/s|mb|m)\b/);
  if (match) {
    const num = match[1];
    const isGiga = match[2].startsWith('g');
    return {
      key: `${num}${isGiga ? 'gbps' : 'mbps'}`,
      display: `${num}${isGiga ? ' Gbps' : ' Mbps'}`,
    };
  }
  return {
    key: lower || 'unknown',
    display: raw || 'Unknown',
  };
}

/**
 * Build package usage from endpoints already on Contabo.
 * Used when GET /package-usage is not deployed yet (404).
 * Groups by title + price so each package appears once.
 */
export async function buildPackageUsageFallback({ includeEmpty = false } = {}) {
  const [plans, recurring, prepaid] = await Promise.all([
    fetchAllPlans(),
    fetchAllBillingCustomers(1),
    fetchAllBillingCustomers(2),
  ]);

  const byPlan = new Map();

  const touch = (planId) => {
    const id = Number(planId);
    if (!id) return null;
    if (!byPlan.has(id)) {
      byPlan.set(id, {
        plan_id: id,
        service_count: 0,
        customers: new Set(),
        active_count: 0,
        online_count: 0,
        offline_count: 0,
        expired_count: 0,
        customerRows: [],
      });
    }
    return byPlan.get(id);
  };

  const ingest = (customer) => {
    const services = Array.isArray(customer.services) ? customer.services : [];
    services.forEach((service) => {
      const bucket = touch(service.plan_id);
      if (!bucket) return;
      bucket.service_count += 1;
      if (customer.id) bucket.customers.add(customer.id);

      const value = statusValue(service.status);
      const online = Number(service.online) === 1;

      if (value === ACTIVE) {
        bucket.active_count += 1;
        if (online) bucket.online_count += 1;
        else bucket.offline_count += 1;
      } else if (value === EXPIRED) {
        bucket.expired_count += 1;
      }

      bucket.customerRows.push({
        service_id: service.id || `${customer.id}-${service.plan_id}-${service.mikrotik_name || ''}`,
        customer_id: customer.id,
        customer_name: customer.name || 'Unknown',
        phone_number: customer.phone_number,
        mikrotik_name: service.mikrotik_name,
        price: service.price,
        billing_type: service.billing_type,
        status: service.status || { value, label: 'Unknown' },
        online: online ? 1 : 0,
        connection: online ? 'online' : value === ACTIVE ? 'offline' : 'inactive',
        plan_id: Number(service.plan_id),
        plan_title: service.plan_title || service.title,
        router_name: service.router_name,
      });
    });
  };

  const seenCustomers = new Set();
  [...recurring, ...prepaid].forEach((customer) => {
    const key = customer?.id != null ? `id:${customer.id}` : `obj:${JSON.stringify(customer)}`;
    if (seenCustomers.has(key)) return;
    seenCustomers.add(key);
    ingest(customer);
  });

  byPlan.forEach((bucket) => {
    const seenRows = new Set();
    bucket.customerRows = bucket.customerRows.filter((row) => {
      const key = String(row.service_id);
      if (seenRows.has(key)) return false;
      seenRows.add(key);
      return true;
    });
  });

  const groups = new Map();

  const ensureGroup = (title, price, extras = {}) => {
    const identity = normalizePackageIdentity(title);
    const key = `${identity.key}|${Number(price || 0).toFixed(2)}`;
    if (!groups.has(key)) {
      groups.set(key, {
        group_key: key,
        title: identity.display,
        price,
        rate_limit: extras.rate_limit || null,
        plan_ids: new Set(),
        variants: new Map(),
        service_count: 0,
        customers: new Set(),
        active_count: 0,
        online_count: 0,
        offline_count: 0,
        expired_count: 0,
      });
    }
    return groups.get(key);
  };

  const touchVariant = (group, exactTitle) => {
    const name = String(exactTitle || group.title).trim() || group.title;
    if (!group.variants.has(name)) {
      group.variants.set(name, {
        title: name,
        plan_ids: new Set(),
        customers: new Set(),
        service_count: 0,
        online_count: 0,
        offline_count: 0,
        expired_count: 0,
      });
    }
    return group.variants.get(name);
  };

  plans.forEach((plan) => {
    const group = ensureGroup(plan.title, plan.price, { rate_limit: plan.rate_limit });
    const id = Number(plan.id);
    const exactTitle = String(plan.title || '').trim() || group.title;
    const variant = touchVariant(group, exactTitle);
    if (id) {
      group.plan_ids.add(id);
      variant.plan_ids.add(id);
    }
    if (plan.rate_limit && !group.rate_limit) group.rate_limit = plan.rate_limit;

    const stats = byPlan.get(id);
    if (!stats) return;
    group.service_count += stats.service_count;
    group.active_count += stats.active_count;
    group.online_count += stats.online_count;
    group.offline_count += stats.offline_count;
    group.expired_count += stats.expired_count;
    stats.customers.forEach((cid) => {
      group.customers.add(cid);
      variant.customers.add(cid);
    });
    variant.service_count += stats.service_count;
    variant.online_count += stats.online_count;
    variant.offline_count += stats.offline_count;
    variant.expired_count += stats.expired_count;
  });

  byPlan.forEach((stats, planId) => {
    const already = [...groups.values()].some((g) => g.plan_ids.has(planId));
    if (already) return;
    const sample = stats.customerRows[0];
    const group = ensureGroup(sample?.plan_title || `Plan #${planId}`, sample?.price);
    const exactTitle = sample?.plan_title || `Plan #${planId}`;
    const variant = touchVariant(group, exactTitle);
    group.plan_ids.add(planId);
    variant.plan_ids.add(planId);
    group.service_count += stats.service_count;
    group.active_count += stats.active_count;
    group.online_count += stats.online_count;
    group.offline_count += stats.offline_count;
    group.expired_count += stats.expired_count;
    stats.customers.forEach((cid) => {
      group.customers.add(cid);
      variant.customers.add(cid);
    });
    variant.service_count += stats.service_count;
    variant.online_count += stats.online_count;
    variant.offline_count += stats.offline_count;
    variant.expired_count += stats.expired_count;
  });

  let data = [...groups.values()].map((group) => {
    const planIds = [...group.plan_ids];
    const name_breakdown = [...group.variants.values()]
      .map((variant) => ({
        title: variant.title,
        plan_ids: [...variant.plan_ids],
        customer_count: variant.customers.size,
        service_count: variant.service_count,
        online_count: variant.online_count,
        offline_count: variant.offline_count,
        expired_count: variant.expired_count,
      }))
      .sort((a, b) => b.customer_count - a.customer_count);

    return {
      group_key: group.group_key,
      plan_id: planIds[0] || null,
      plan_ids: planIds,
      title: group.title,
      price: group.price,
      rate_limit: group.rate_limit,
      name_breakdown,
      service_count: group.service_count,
      customer_count: group.customers.size,
      active_count: group.active_count,
      online_count: group.online_count,
      offline_count: group.offline_count,
      expired_count: group.expired_count,
    };
  });

  if (!includeEmpty) {
    data = data.filter((row) => row.service_count > 0 || row.customer_count > 0);
  }

  data.sort((a, b) => {
    const aMatch = String(a.title).match(/^(\d+(?:\.\d+)?)\s*Mbps$/i);
    const bMatch = String(b.title).match(/^(\d+(?:\.\d+)?)\s*Mbps$/i);
    if (aMatch && bMatch) return Number(aMatch[1]) - Number(bMatch[1]);
    return String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
  });

  return {
    summary: {
      plans: data.length,
      services: data.reduce((n, r) => n + r.service_count, 0),
      customers: data.reduce((n, r) => n + r.customer_count, 0),
      active: data.reduce((n, r) => n + r.active_count, 0),
      online: data.reduce((n, r) => n + r.online_count, 0),
      offline: data.reduce((n, r) => n + r.offline_count, 0),
      expired: data.reduce((n, r) => n + r.expired_count, 0),
    },
    data,
    source: 'fallback',
  };
}

export function filterPlanCustomers(rows, filter = 'all') {
  if (filter === 'online') return rows.filter((r) => r.online === 1);
  if (filter === 'offline') return rows.filter((r) => r.connection === 'offline');
  if (filter === 'active') return rows.filter((r) => statusValue(r.status) === ACTIVE);
  return rows;
}
