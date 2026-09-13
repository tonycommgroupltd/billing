/**
 * Till Payments — relocation / router_change / extension helpers.
 */

export const RELOCATION_MIN_AMOUNT = 500;

export const TILL_FEE_CONFIG = {
  relocation: {
    feeType: 'relocation',
    ticketType: 'Relocation',
    title: 'Relocation',
    minAmount: RELOCATION_MIN_AMOUNT,
    defaultAmount: RELOCATION_MIN_AMOUNT,
    path: '/admin/finance/till-payments/relocation',
  },
  router_change: {
    feeType: 'router_change',
    ticketType: 'Faulty Router change',
    title: 'Router change',
    minAmount: 1,
    defaultAmount: '',
    path: '/admin/finance/till-payments/router-change',
  },
  extension: {
    feeType: 'extension',
    ticketType: 'Extension',
    title: 'Extension',
    minAmount: 1,
    defaultAmount: '',
    path: '/admin/finance/till-payments/extension',
  },
};

export const FEE_TYPE_LABELS = {
  relocation: 'Relocation',
  router_change: 'Router change',
  extension: 'Extension',
  installation: 'Installation',
  other: 'Other',
};

export function paymentStatusForTicket(ticket, transactions = []) {
  const keys = ticketMatchKeys(ticket);
  const matches = (transactions || []).filter((txn) => {
    const tid = String(txn.ticket_id || '');
    const tnum = String(txn.ticket_number || '');
    return keys.includes(tid) || keys.includes(tnum);
  });

  const paid = matches.find((t) => String(t.status).toLowerCase() === 'paid');
  if (paid) {
    return { status: 'paid', label: 'Paid', transaction: paid };
  }
  const pending = matches.find((t) => String(t.status).toLowerCase() === 'pending');
  if (pending) {
    return { status: 'pending', label: 'Pending STK', transaction: pending };
  }
  return { status: 'unpaid', label: 'Unpaid', transaction: null };
}

export function ticketMatchKeys(ticket) {
  const keys = [];
  if (ticket?.id != null) keys.push(String(ticket.id));
  if (ticket?.number != null && ticket.number !== '') keys.push(String(ticket.number));
  return keys;
}

export function ticketCreator(ticket) {
  return (
    ticket?.created_by ||
    ticket?.createdBy ||
    ticket?.created_by_name ||
    ticket?.creator ||
    '—'
  );
}

export function ticketPhone(ticket) {
  return ticket?.customer_phone || ticket?.customerPhone || ticket?.phone || '';
}

export function ticketCustomerName(ticket) {
  return ticket?.customer_name || ticket?.customerName || '';
}

export function ticketAssignee(ticket) {
  const raw =
    ticket?.assigned_to ||
    ticket?.assignedTo ||
    ticket?.assignee ||
    ticket?.assigned_user ||
    '';
  if (Array.isArray(raw)) {
    return raw.filter(Boolean).join(', ') || '—';
  }
  if (raw && typeof raw === 'object') {
    return raw.name || raw.display_name || raw.email || '—';
  }
  const s = String(raw || '').trim();
  return s || '—';
}

const TICKET_STATUS_LABELS = {
  new: 'New',
  open: 'Work in progress',
  pending: 'Pending',
  solved: 'Solved',
  closed: 'Closed',
  resolved: 'Resolved',
  in_progress: 'Work in progress',
  'work in progress': 'Work in progress',
  'installation complete': 'Installation complete',
  waiting_customer: 'Waiting on customer',
  waiting_agent: 'Waiting on agent',
  waiting_power: 'Waiting on power',
  power_available: 'Power available',
  customer_unreachable: 'Customer unreachable',
  booked_later: 'Booked to a further date',
  out_of_range: 'Customer out of range',
  installed_elsewhere: 'Already installed by another provider',
  long_distance: 'Long distance',
  pole_needed: 'Pole needed',
};

export function ticketStatus(ticket) {
  const raw =
    ticket?.statusLabel ??
    ticket?.status_label ??
    ticket?.status ??
    ticket?.Status ??
    '';

  if (raw && typeof raw === 'object') {
    const label = raw.label || raw.name || raw.value;
    if (label != null && String(label).trim() !== '') {
      return String(label).trim();
    }
  }

  const text = String(raw ?? '').trim();
  if (!text) return '—';

  const key = text.toLowerCase().replace(/[\s-]+/g, '_');
  const spaced = text.toLowerCase();
  return TICKET_STATUS_LABELS[key] || TICKET_STATUS_LABELS[spaced] || text;
}

export function mergeTillRows(tickets = [], transactions = [], defaultAmount = 0) {
  return (tickets || []).map((ticket) => {
    const pay = paymentStatusForTicket(ticket, transactions);
    return {
      ticket,
      ...pay,
      amount: pay.transaction?.amount || defaultAmount || null,
    };
  });
}

/** @deprecated use mergeTillRows */
export function mergeRelocationRows(tickets = [], transactions = []) {
  return mergeTillRows(tickets, transactions, RELOCATION_MIN_AMOUNT);
}

export function formatKes(amount) {
  const n = Number(amount) || 0;
  return `KSh ${n.toLocaleString()}`;
}
