import {
  computeDropCableBalanceMeters,
  computeDropCableRollBalanceMeters,
  formatDropCableBalance,
  getCableRollNumberFromRow,
  getRollMetersFromItem,
  isDropCable,
} from './inventoryCable';
import {
  hasDisbursementTicketUsage,
  indexServerCableBalances,
  serverCableMetersForItem,
} from './inventoryBalances';

/** Row is ticket usage — disbursement ticket_id / ticket_number only (not inventory item join). */
export function hasTicketLink(row) {
  return hasDisbursementTicketUsage(row);
}

export function dropCableItemMeta(row) {
  return { name: row?.item_name, category: row?.item_category, unit: row?.unit };
}

export function isDropCableRow(row) {
  return isDropCable(dropCableItemMeta(row));
}

/** Stable key per item or per numbered cable roll. */
export function itemKeyForRow(h) {
  const roll = getCableRollNumberFromRow(h);
  if (roll && isDropCableRow(h)) return `roll_${roll}`;
  return h.item_id ? String(h.item_id) : h.item_name;
}

function userMatchesRow(h, userId, userName) {
  const uid = h.assigned_to_id ? Number(h.assigned_to_id) : null;
  if (userId) return uid === Number(userId);
  return (h.assigned_to_name || 'Unknown') === userName;
}

function rowsForUserItem(history, userId, userName, itemKey, rollNumber = null) {
  return history.filter((h) => {
    if (h.type !== 'item') return false;
    if (!userMatchesRow(h, userId, userName)) return false;
    const roll = getCableRollNumberFromRow(h);
    if (rollNumber) {
      return roll === rollNumber;
    }
    if (roll) return false;
    const ik = h.item_id ? String(h.item_id) : h.item_name;
    return ik === itemKey;
  });
}

function resolveItemRemaining(
  history,
  userId,
  userName,
  itemKey,
  meta,
  rollNumber,
  serverBalances
) {
  const cableIndex = serverBalances ? indexServerCableBalances(serverBalances) : null;
  if (cableIndex && userId && getRollMetersFromItem(meta)) {
    const server = serverCableMetersForItem(cableIndex, userId, {
      roll_number: rollNumber,
      rollMeters: getRollMetersFromItem(meta),
      cable_type: meta.name,
    });
    if (server != null) {
      return server.meters_pending;
    }
  }

  const rows = rowsForUserItem(history, userId, userName, itemKey, rollNumber);
  const mpp = getRollMetersFromItem(meta);
  if (mpp) {
    if (rollNumber) {
      return computeDropCableRollBalanceMeters(rows);
    }
    return computeDropCableBalanceMeters(rows, meta.name);
  }
  let assigned = 0;
  let used = 0;
  rows.forEach((h) => {
    const q = parseInt(h.quantity, 10) || 0;
    if (hasTicketLink(h)) used += q;
    else assigned += q;
  });
  return Math.max(0, assigned - used);
}

export function itemRemainingQty(
  history,
  userKey,
  itemKey,
  meta,
  rollNumber = null,
  serverBalances = null,
  userId = null
) {
  const userName = userId ? null : userKey;
  return resolveItemRemaining(
    history,
    userId,
    userName,
    itemKey,
    meta,
    rollNumber,
    serverBalances
  );
}

/** Meters already logged on tickets for this numbered roll + user. */
export function rollTicketUsageMeters(row, history, serverBalances = null) {
  const roll = getCableRollNumberFromRow(row);
  if (!roll) return 0;
  const userId = row.assigned_to_id ? Number(row.assigned_to_id) : null;
  const userName = row.assigned_to_name || 'Unknown';

  const cableIndex = serverBalances ? indexServerCableBalances(serverBalances) : null;
  if (cableIndex && userId) {
    const server = serverCableMetersForItem(cableIndex, userId, {
      roll_number: roll,
      rollMeters: getRollMetersFromItem(dropCableItemMeta(row)),
      cable_type: row.item_name,
    });
    if (server != null) {
      return server.meters_used ?? 0;
    }
  }

  return history
    .filter(
      (h) =>
        h.type === 'item' &&
        hasTicketLink(h) &&
        getCableRollNumberFromRow(h) === roll &&
        userMatchesRow(h, userId, userName)
    )
    .reduce((sum, h) => sum + (parseInt(h.quantity, 10) || 0), 0);
}

export function isPendingHistoryRow(h, allHistory, serverBalances = null) {
  if (h.type === 'router') return !hasTicketLink(h);
  if (hasTicketLink(h)) return false;
  const qty = parseInt(h.quantity, 10) || 0;
  if (qty <= 0) return false;

  const userId = h.assigned_to_id ? Number(h.assigned_to_id) : null;
  const userKey = h.assigned_to_name || 'Unknown';
  const roll = getCableRollNumberFromRow(h);
  const ikey = itemKeyForRow(h);
  const remaining = itemRemainingQty(
    allHistory,
    userKey,
    ikey,
    dropCableItemMeta(h),
    roll,
    serverBalances,
    userId
  );
  return (remaining ?? 0) > 0;
}

/** Max quantity that can be returned / discarded from this issuance row. */
export function getReturnableQuantity(row, history, serverBalances = null) {
  if (!row || row.type !== 'item' || hasTicketLink(row)) return 0;
  if (!isPendingHistoryRow(row, history, serverBalances)) return 0;

  const userId = row.assigned_to_id ? Number(row.assigned_to_id) : null;
  const userKey = row.assigned_to_name || 'Unknown';
  const roll = getCableRollNumberFromRow(row);
  const ikey = itemKeyForRow(row);
  const meta = dropCableItemMeta(row);
  const remaining = itemRemainingQty(
    history,
    userKey,
    ikey,
    meta,
    roll,
    serverBalances,
    userId
  );
  const issued = parseInt(row.quantity, 10) || 0;

  if (isDropCableRow(row)) {
    const mpp = getRollMetersFromItem(meta);
    if (!mpp || remaining <= 0) return 0;
    if (roll) {
      return 1;
    }
    return Math.min(issued, Math.max(1, Math.ceil(remaining / mpp)));
  }

  return Math.min(issued, remaining);
}

export function canReturnToWarehouse(row, history, serverBalances = null) {
  if (!row || row.type !== 'item' || !isPendingHistoryRow(row, history, serverBalances)) {
    return false;
  }
  // Numbered drop-cable rolls can return with ticket usage — leftover meters stay on the roll.
  return true;
}

export function getHistoryRowStatus(row, history, serverBalances = null) {
  if (row.type === 'router') {
    return hasTicketLink(row) ? 'used' : 'pending';
  }
  if (hasTicketLink(row)) return 'used';
  if (isPendingHistoryRow(row, history, serverBalances)) {
    const roll = getCableRollNumberFromRow(row);
    if (roll && rollTicketUsageMeters(row, history, serverBalances) > 0) return 'partial';
    return 'pending';
  }
  return 'closed';
}

export function pendingDropCableBalanceLabel(h, allHistory, serverBalances = null) {
  if (hasTicketLink(h) || !isDropCableRow(h)) return null;
  const userId = h.assigned_to_id ? Number(h.assigned_to_id) : null;
  const userKey = h.assigned_to_name || 'Unknown';
  const roll = getCableRollNumberFromRow(h);
  const ikey = itemKeyForRow(h);
  const left = itemRemainingQty(
    allHistory,
    userKey,
    ikey,
    dropCableItemMeta(h),
    roll,
    serverBalances,
    userId
  );
  const mpp = getRollMetersFromItem(dropCableItemMeta(h));
  if (left == null || !mpp || left <= 0) return null;
  const prefix = roll ? `${roll}: ` : '';
  return `${prefix}${formatDropCableBalance(left, mpp)} left`;
}

export function pendingItemBalanceLabel(h, allHistory, serverBalances = null) {
  if (hasTicketLink(h) || h.type !== 'item') return null;
  const userId = h.assigned_to_id ? Number(h.assigned_to_id) : null;
  const userKey = h.assigned_to_name || 'Unknown';
  const roll = getCableRollNumberFromRow(h);
  const ikey = itemKeyForRow(h);
  const meta = dropCableItemMeta(h);
  const left = itemRemainingQty(
    allHistory,
    userKey,
    ikey,
    meta,
    roll,
    serverBalances,
    userId
  );
  if (left == null || left <= 0) return null;

  if (isDropCableRow(h)) {
    const mpp = getRollMetersFromItem(meta);
    if (!mpp) return null;
    const prefix = roll ? `${roll}: ` : '';
    return `${prefix}${formatDropCableBalance(left, mpp)} left`;
  }

  const unit = h.unit || 'pcs';
  return `${left} ${unit} left`;
}

/** Human label for pending drop cable — always in meters. */
export function formatPendingCableMeters(remainingMeters, rollMeters, rollNumber = null) {
  const m = parseInt(remainingMeters, 10) || 0;
  if (m <= 0) return null;
  const meterText = formatDropCableBalance(m, rollMeters);
  if (rollNumber) {
    return `${rollNumber} · ${meterText} pending`;
  }
  return `${meterText} pending`;
}

export function getPendingCableInfo(row, history, serverBalances = null) {
  if (!row || !isDropCableRow(row) || hasTicketLink(row)) return null;
  if (!isPendingHistoryRow(row, history, serverBalances)) return null;

  const userId = row.assigned_to_id ? Number(row.assigned_to_id) : null;
  const userKey = row.assigned_to_name || 'Unknown';
  const roll = getCableRollNumberFromRow(row);
  const ikey = itemKeyForRow(row);
  const meta = dropCableItemMeta(row);
  const meters = itemRemainingQty(
    history,
    userKey,
    ikey,
    meta,
    roll,
    serverBalances,
    userId
  );
  const rollMeters = getRollMetersFromItem(meta);
  if (meters == null || meters <= 0 || !rollMeters) return null;

  return {
    meters,
    rollMeters,
    rollNumber: roll,
    label: formatPendingCableMeters(meters, rollMeters, roll),
    shortLabel: `${meters} m pending`,
  };
}

/** First issuance row (no ticket) for a grouped pending item — used for return/delete actions. */
export function findIssuanceRow(history, userName, itemKey, rollNumber = null, userId = null) {
  return (
    history.find((h) => {
      if (h.type !== 'item' || hasTicketLink(h)) return false;
      if (!userMatchesRow(h, userId, userName)) return false;
      if (itemKeyForRow(h) !== itemKey) return false;
      const roll = getCableRollNumberFromRow(h);
      if (rollNumber) return roll === rollNumber;
      return !roll;
    }) || null
  );
}

export function buildByUserSummary(history, serverBalances = null) {
  const byUser = {};
  history.forEach((h) => {
    const uid = h.assigned_to_id ? Number(h.assigned_to_id) : null;
    const key = uid ? String(uid) : (h.assigned_to_name || 'Unknown');
    const name = h.assigned_to_name || 'Unknown';
    if (!byUser[key]) byUser[key] = { id: uid, name, routers: [], itemMap: {} };

    if (h.type === 'router') {
      if (!hasTicketLink(h)) byUser[key].routers.push(h);
    } else {
      const rollNo = getCableRollNumberFromRow(h);
      const ikey = itemKeyForRow(h);
      if (!byUser[key].itemMap[ikey]) {
        byUser[key].itemMap[ikey] = {
          id: h.item_id,
          itemKey: ikey,
          name: rollNo || h.item_name,
          roll_number: rollNo,
          cable_type: rollNo ? h.item_name : null,
          category: h.item_category,
          unit: h.unit,
          meta: dropCableItemMeta(h),
        };
      }
    }
  });

  return Object.entries(byUser)
    .map(([key, data]) => {
      const pendingRouters = data.routers;
      const pendingItems = Object.entries(data.itemMap)
        .map(([ikey, i]) => {
          const remaining = itemRemainingQty(
            history,
            data.name,
            ikey,
            i.meta,
            i.roll_number,
            serverBalances,
            data.id
          );
          const rollMeters = getRollMetersFromItem(i.meta);
          const issuanceRow = findIssuanceRow(
            history,
            data.name,
            ikey,
            i.roll_number,
            data.id
          );
          return {
            ...i,
            remaining,
            rollMeters,
            issuanceRow,
            hasTicketUsage: issuanceRow
              ? rollTicketUsageMeters(issuanceRow, history, serverBalances) > 0
              : false,
          };
        })
        .filter((i) => (i.remaining ?? 0) > 0);
      return { id: data.id, name: data.name, pendingRouters, pendingItems };
    })
    .filter((u) => u.pendingRouters.length > 0 || u.pendingItems.length > 0);
}
