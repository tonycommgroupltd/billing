/**
 * Pending balances — same rules as ticket View + server getTechnicianItemBalance:
 * only disbursement ticket_id / ticket_number count as usage (not inventory item join).
 */
import {
  getCableRollNumberFromRow,
  getCableTypeLabel,
  getRollMetersFromItem,
} from './inventoryCable';

export function hasDisbursementTicketUsage(row) {
  const tid = row?.ticket_id;
  if (tid != null && tid !== '' && tid !== 0 && tid !== '0') return true;
  return Boolean(row?.ticket_number);
}

/** Same aggregation as ticket View buildUserItems — meters for drop cable. */
export function buildPendingBalancesFromDisbursements(rows, forGroup = false) {
  const map = {};
  (rows || []).forEach((r) => {
    if (r.type === 'router') return;
    const onTicket = hasDisbursementTicketUsage(r);
    const ownerId = r.assigned_to_id ? Number(r.assigned_to_id) : null;
    const ownerName = r.assigned_to_name || '';
    const rollMeters = getRollMetersFromItem({
      name: r.item_name,
      category: r.item_category,
    });
    const isCable = rollMeters != null;
    const rollNo = getCableRollNumberFromRow(r);

    if (isCable && rollNo) {
      const key =
        forGroup && ownerId
          ? `roll_${rollNo}_${ownerId}`
          : `roll_${rollNo}`;
      if (!map[key]) {
        map[key] = {
          id: r.item_id || null,
          assigned_to_id: ownerId,
          assigned_to_name: ownerName,
          name: rollNo,
          roll_number: rollNo,
          cable_type: r.item_name,
          category: r.item_category || 'Drop Cable',
          roll_meters: rollMeters,
          is_drop_cable: true,
          quantity_available: 0,
          meters_used: 0,
        };
      }
      const qty = parseInt(r.quantity, 10) || 0;
      if (onTicket) {
        map[key].quantity_available -= qty;
        map[key].meters_used += qty;
      } else {
        map[key].quantity_available += qty * rollMeters;
      }
      return;
    }

    const cableKey = isCable ? `cable_${rollMeters}` : null;
    let key = cableKey || (r.item_id ? String(r.item_id) : r.item_name);
    if (forGroup && ownerId) key = `${key}_${ownerId}`;

    if (!map[key]) {
      map[key] = {
        id: isCable ? null : r.item_id || null,
        assigned_to_id: ownerId,
        assigned_to_name: ownerName,
        name: isCable ? getCableTypeLabel(rollMeters) : r.item_name,
        roll_number: null,
        cable_type: isCable ? r.item_name : null,
        category: r.item_category || '',
        roll_meters: rollMeters,
        is_drop_cable: isCable,
        quantity_available: 0,
        meters_used: 0,
      };
    }
    const qty = parseInt(r.quantity, 10) || 0;
    if (isCable) {
      if (onTicket) {
        map[key].quantity_available -= qty;
        map[key].meters_used += qty;
      } else {
        map[key].quantity_available += qty * rollMeters;
      }
    } else if (onTicket) {
      map[key].quantity_available -= qty;
    } else {
      map[key].quantity_available += qty;
    }
  });

  return Object.values(map).filter((i) => i.quantity_available > 0);
}

/** Map server pending-balances cables by user+roll for quick lookup. */
export function indexServerCableBalances(balanceRows) {
  const map = new Map();
  (balanceRows || []).forEach((user) => {
    const uid = Number(user.assigned_to_id);
    (user.cables || []).forEach((c) => {
      const roll = (c.roll_number || '').toUpperCase();
      const bulkKey = roll || `bulk_${c.meters_per_roll || c.roll_meters}_${c.item_name}`;
      map.set(`${uid}::${bulkKey}`, c);
    });
  });
  return map;
}

export function serverCableMetersForItem(index, assignedToId, item) {
  if (!index || !assignedToId) return null;
  const uid = Number(assignedToId);
  const roll = (item.roll_number || '').toUpperCase();
  const bulkKey = roll || `bulk_${item.rollMeters || item.roll_meters}_${item.cable_type || item.name}`;
  const hit = index.get(`${uid}::${bulkKey}`);
  if (!hit) return null;
  return {
    meters_pending: hit.meters_pending,
    meters_used: hit.meters_used ?? 0,
    roll_meters: hit.meters_per_roll || hit.roll_meters,
  };
}
