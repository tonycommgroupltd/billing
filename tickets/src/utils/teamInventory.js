import { format } from 'date-fns';
import { findRosterTeamForUser } from './parseDailyRosterWhatsApp';

export function todayDateString() {
  return format(new Date(), 'yyyy-MM-dd');
}

function memberUserId(member) {
  return Number(member?.user_id || member?.member_id || 0);
}

/**
 * Today's team member user IDs — Team Roster first (source of truth).
 */
export async function resolveTodayTeamMemberIds(http, userId) {
  const ids = new Set();
  const add = (id) => {
    const n = Number(id);
    if (n > 0) ids.add(n);
  };

  const today = todayDateString();

  // 1. Manager roster bulletin
  try {
    const rosterRes = await http.get(`/daily-roster/by-date?date=${today}`);
    const team = findRosterTeamForUser(rosterRes?.data?.data, userId);
    if (team?.members?.length) {
      team.members.forEach((m) => add(memberUserId(m)));
      if (ids.size > 0) return [...ids];
    }
  } catch {
    /* continue */
  }

  // 2. Server daily-schedule / members (roster-aware when PHP deployed)
  try {
    const membersRes = await http.get('/daily-schedule/members');
    const members = membersRes?.data?.data;
    if (Array.isArray(members) && members.length > 0) {
      members.forEach((m) => add(m.member_id || m.user_id));
      if (ids.size > 0) return [...ids];
    }
  } catch {
    /* continue */
  }

  // 3. At least the logged-in user
  if (userId) add(userId);
  return [...ids];
}

function disbursementOnTicket(row) {
  const tid = row?.ticket_id ?? row?.linked_ticket_id;
  return tid != null && tid !== '' && tid !== 0 && tid !== '0';
}

function routerIsAvailable(row) {
  if (row?.type !== 'router') return false;
  return !disbursementOnTicket(row);
}

/** Map disbursement rows to inventory-item shape for the router picker. */
export function routersFromTeamDisbursements(rows) {
  const seen = new Set();
  const list = [];
  (rows || []).forEach((r) => {
    if (!routerIsAvailable(r) || !r.item_id) return;
    const key = String(r.item_id);
    if (seen.has(key)) return;
    seen.add(key);
    list.push({
      id: r.item_id,
      name: r.item_name || r.name || r.serial_number || `Router #${r.item_id}`,
      serial_number: r.serial_number || null,
      category: r.item_category || 'GPON Router',
      assigned_to_id: r.assigned_to_id,
      assigned_to_name: r.assigned_to_name,
      status: 'active',
    });
  });
  return list;
}

async function fetchDisbursementsForMemberIds(InventoryAPI, memberIds) {
  if (!memberIds.length) return [];

  try {
    const bulkRes = await InventoryAPI.listDisbursements({
      assigned_to_ids: memberIds.join(','),
    });
    if (Array.isArray(bulkRes?.data)) return bulkRes.data;
  } catch {
    /* per-member */
  }

  const chunks = await Promise.all(
    memberIds.map((id) =>
      InventoryAPI.listDisbursements({ assigned_to_id: id })
        .then((r) => (Array.isArray(r?.data) ? r.data : []))
        .catch(() => [])
    )
  );
  return chunks.flat();
}

/**
 * All disbursement rows for the field user's team (roster-first).
 */
export async function fetchTeamDisbursementRows({
  http,
  InventoryAPI,
  userId,
  isFieldRole,
}) {
  if (!userId) return [];

  if (!isFieldRole) {
    const myRes = await InventoryAPI.listDisbursements({ assigned_to_id: userId });
    return Array.isArray(myRes?.data) ? myRes.data : [];
  }

  // Single bundle endpoint when server has latest PHP
  try {
    const bundle = await http.get('/daily-schedule/team-inventory');
    const data = bundle?.data?.data;
    if (bundle?.data?.success && Array.isArray(data?.disbursements)) {
      return data.disbursements;
    }
  } catch {
    /* fallback */
  }

  const memberIds = await resolveTodayTeamMemberIds(http, userId);

  if (memberIds.length > 0) {
    const rows = await fetchDisbursementsForMemberIds(InventoryAPI, memberIds);
    if (rows.length > 0) return rows;
  }

  // Legacy server endpoint (old daily-schedule only)
  try {
    const res = await http.get('/daily-schedule/group-disbursements');
    if (res?.data?.success && Array.isArray(res.data.data)) {
      return res.data.data;
    }
  } catch {
    /* empty */
  }

  return [];
}

/**
 * Team routers available for ticket linking (from team disbursements).
 */
export async function fetchTeamAvailableRouters({
  http,
  InventoryAPI,
  userId,
  teamRows,
}) {
  try {
    const bundle = await http.get('/daily-schedule/team-inventory');
    const data = bundle?.data?.data;
    if (bundle?.data?.success && Array.isArray(data?.routers) && data.routers.length > 0) {
      return data.routers;
    }
  } catch {
    /* fallback */
  }

  const categories = ['GPON Router', 'XPON Router', 'Router', 'GPON', 'ONT'];
  for (const category of categories) {
    try {
      const res = await http.get(
        `/daily-schedule/available-inventory?category=${encodeURIComponent(category)}`
      );
      if (res?.data?.success && Array.isArray(res.data.data) && res.data.data.length > 0) {
        return res.data.data;
      }
    } catch {
      /* next */
    }
  }

  const rows =
    teamRows ||
    (await fetchTeamDisbursementRows({
      http,
      InventoryAPI,
      userId,
      isFieldRole: true,
    }));
  return routersFromTeamDisbursements(rows);
}

/**
 * Load disbursement rows + routers together (for ticket view).
 */
export async function fetchTeamInventoryBundle({
  http,
  InventoryAPI,
  userId,
  isFieldRole,
}) {
  if (!userId) {
    return { rows: [], routers: [], memberIds: [], source: 'none' };
  }

  if (!isFieldRole) {
    const myRes = await InventoryAPI.listDisbursements({ assigned_to_id: userId });
    const rows = Array.isArray(myRes?.data) ? myRes.data : [];
    return { rows, routers: [], memberIds: [Number(userId)], source: 'self' };
  }

  try {
    const bundle = await http.get('/daily-schedule/team-inventory');
    const data = bundle?.data?.data;
    if (bundle?.data?.success && data) {
      return {
        rows: Array.isArray(data.disbursements) ? data.disbursements : [],
        routers: Array.isArray(data.routers) ? data.routers : [],
        memberIds: Array.isArray(data.member_ids) ? data.member_ids : [],
        source: data.source || 'roster',
        teamTitle: data.team_title || null,
      };
    }
  } catch {
    /* client fallback */
  }

  const memberIds = await resolveTodayTeamMemberIds(http, userId);
  const rows = await fetchDisbursementsForMemberIds(InventoryAPI, memberIds);
  const routers = routersFromTeamDisbursements(rows);

  return {
    rows,
    routers,
    memberIds,
    source: memberIds.length > 1 ? 'roster' : 'self',
    teamTitle: null,
  };
}
