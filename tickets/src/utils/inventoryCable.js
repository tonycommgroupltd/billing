/**
 * Drop cable: disburse in pieces (1k / 2k rolls), use on tickets in meters.
 * 1 piece of 1k = 1000 m available · 1 piece of 2k = 2000 m available
 */

export const DROP_CABLE_PRESETS = [
  {
    name: 'Drop Cable 1k',
    category: 'Drop Cable',
    unit: 'pcs',
    rollMeters: 1000,
    description: 'One roll = 1 km (1000 m). Disburse in pieces; technicians log usage in meters on tickets.',
  },
  {
    name: 'Drop Cable 2k',
    category: 'Drop Cable',
    unit: 'pcs',
    rollMeters: 2000,
    description: 'One roll = 2 km (2000 m). Disburse in pieces; technicians log usage in meters on tickets.',
  },
];

export const DROP_CABLE_CATEGORY = 'Drop Cable';

/** Normalize handheld scan: "401" → "T401", strip whitespace. */
export function normalizeCableRollInput(raw) {
  const t = String(raw || '').replace(/[\r\n\t]/g, '').trim().toUpperCase();
  if (!t) return '';
  if (/^T\d+$/i.test(t)) return t;
  if (/^\d+$/.test(t)) return `T${t}`;
  return t;
}

/** Find one roll by number (exact, or suffix e.g. 401 → T401). */
export function findCableRollMatch(rolls, query) {
  const q = normalizeCableRollInput(query);
  if (!q || !Array.isArray(rolls)) {
    return { roll: null, matches: [] };
  }
  const list = rolls.filter(isCableRollNumber);
  const exact = list.find((i) => (i.name || '').trim().toUpperCase() === q);
  if (exact) {
    return { roll: exact, matches: [exact] };
  }
  const partial = list.filter((i) => {
    const n = (i.name || '').trim().toUpperCase();
    if (n === q) return true;
    if (n.endsWith(q)) return true;
    if (q.length >= 2 && n.includes(q)) return true;
    return false;
  });
  if (partial.length === 1) {
    return { roll: partial[0], matches: partial };
  }
  return { roll: null, matches: partial.slice(0, 8) };
}

export const getRollMetersFromItem = (item) => {
  if (!item) return null;
  if (item.roll_meters) return Number(item.roll_meters);
  const sources = [item.name, item.description, item.comment].filter(Boolean);
  for (const src of sources) {
    const n = String(src).toLowerCase().replace(/\s+/g, '');
    if (n.includes('2k') || n.includes('2km')) return 2000;
    if (n.includes('1k') || n.includes('1km')) return 1000;
  }
  return null;
};

/** Roll label like T400 (not the generic "Drop Cable 1k" stock name). */
export const isCableRollNumber = (item) => {
  if (!item?.name) return false;
  const cat = (item.category || '').toLowerCase();
  if (!cat.includes('drop') || !cat.includes('cable')) return false;
  return !/^drop\s*cable\s*(1|2)k/i.test(String(item.name).trim());
};

export const getCableTypeLabel = (rollMeters) =>
  rollMeters >= 2000 ? 'Drop Cable 2k' : 'Drop Cable 1k';

/** Group key for aggregating technician balance (1k vs 2k). */
export const dropCableBalanceGroupKey = (row) => {
  const m = getRollMetersFromItem({
    name: row.item_name,
    category: row.item_category,
    description: row.item_description,
  });
  if (m) return `cable_${m}`;
  return null;
};

export const isDropCable = (item) => {
  if (!item) return false;
  const cat = (item.category || '').toLowerCase();
  if (cat.includes('drop cable') || cat.includes('dropcable')) return true;
  return getRollMetersFromItem(item) != null;
};

/** @deprecated use isDropCable — kept for older references */
export const isMeterUnit = (item) => isDropCable(item);

/** Balance shown on ticket is always in meters for drop cable */
export const formatDropCableBalance = (meters, rollMeters) => {
  const m = parseInt(meters, 10) || 0;
  if (rollMeters && m >= rollMeters) {
    const rolls = Math.floor(m / rollMeters);
    const rem = m % rollMeters;
    if (rem === 0) return `${m} m (${rolls}× ${rollMeters / 1000}k roll)`;
    return `${m} m (${rolls} roll + ${rem} m)`;
  }
  return `${m} m`;
};

export const formatInventoryQty = (qty, unit, item) => {
  const n = parseInt(qty, 10) || 0;
  const mpp = getRollMetersFromItem(item);
  if (mpp && item?.is_drop_cable) {
    return `${n} m`;
  }
  if (mpp && (unit === 'pcs' || unit === 'piece' || unit === 'pieces')) {
    return `${n} pc (${n * mpp} m)`;
  }
  return `${n} ${unit || 'pcs'}`;
};

export const quantityLabelForItem = (item) =>
  isDropCable(item) ? 'Meters used' : 'Quantity';

const isUsageOnTicket = (row) => {
  const tid = row?.ticket_id;
  if (tid != null && tid !== '' && tid !== 0 && tid !== '0') return true;
  return Boolean(row?.ticket_number);
};

/** Meters left on one numbered roll (serial_number on disbursement rows). */
export const computeDropCableRollBalanceMeters = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  let assignedMeters = 0;
  let usedMeters = 0;
  rows.forEach((h) => {
    const mpp = getRollMetersFromItem({ name: h.item_name, category: h.item_category });
    if (!mpp) return;
    const qty = parseInt(h.quantity, 10) || 0;
    if (isUsageOnTicket(h)) usedMeters += qty;
    else assignedMeters += qty * mpp;
  });
  return Math.max(0, assignedMeters - usedMeters);
};

/** Sum balance in meters from disbursement rows (bulk 1k/2k only — excludes numbered rolls). */
export const computeDropCableBalanceMeters = (rows, itemName) => {
  const mpp = getRollMetersFromItem({ name: itemName });
  if (!mpp || !Array.isArray(rows)) return null;
  let assignedPcs = 0;
  let usedMeters = 0;
  rows.forEach((h) => {
    if (getCableRollNumberFromRow(h)) return;
    const qty = parseInt(h.quantity, 10) || 0;
    if (isUsageOnTicket(h)) usedMeters += qty;
    else assignedPcs += qty;
  });
  return Math.max(0, assignedPcs * mpp - usedMeters);
};

/** Label for pending / summary lists — roll number first when present. */
export const getPendingCableItemLabel = (item) => {
  if (item?.roll_number) return item.roll_number;
  return item?.name || 'Drop cable';
};

export const formatDisbursementQty = (row) => {
  if (!row) return '—';
  const qty = parseInt(row.quantity, 10) || 0;
  const onTicket = isUsageOnTicket(row);
  const mpp = getRollMetersFromItem({ name: row.item_name, category: row.item_category, unit: row.unit });
  if (mpp) {
    if (onTicket) return `${qty} m`;
    if (row.serial_number) {
      return `${row.serial_number} · 1 roll (${qty * mpp} m)`;
    }
    return `${qty} pc (${qty * mpp} m)`;
  }
  return `×${qty}${row.unit ? ` ${row.unit}` : ''}`;
};

/** Roll number from a disbursement / usage row (T400). */
export const getCableRollNumberFromRow = (row) => {
  const sn = String(row?.serial_number || '').trim();
  if (sn) return sn.toUpperCase();
  const name = String(row?.item_name || row?.name || '').trim();
  const rollMatch = name.match(/\b(T\d+)\b/i);
  if (rollMatch) return rollMatch[1].toUpperCase();
  if (/^T\d+$/i.test(name)) return name.toUpperCase();
  return null;
};

/** Primary label for ticket inventory tables — roll number when tracked individually. */
export const getDropCableUsageLabel = (row) => {
  const roll = getCableRollNumberFromRow(row);
  if (roll) return roll;
  return row?.item_name || 'Drop cable';
};

/** One-line summary for ticket view, e.g. "T400 · 300 m (Drop Cable 1k)". */
export const formatTicketCableUsageLine = (row) => {
  const meters = parseInt(row?.quantity, 10) || 0;
  const roll = getCableRollNumberFromRow(row);
  const type = row?.item_name || '';
  if (roll) {
    return type && !/^drop\s*cable/i.test(roll)
      ? `${roll} · ${meters} m (${type})`
      : `${roll} · ${meters} m`;
  }
  return `${type || 'Drop cable'} ${meters} m`;
};
