import { ticketsHttp as http } from '../helpers/ticketsHttp';
import InventoryAPI from '../helpers/InventoryAPI';
import { buildByUserSummary } from './disbursementHistory';
import { todayDateString } from './teamInventory';
import { findRosterTeamForUser } from './parseDailyRosterWhatsApp';

async function fetchTeamMetaForUser(userId) {
  try {
    const res = await http.get(`/daily-schedule/team-for-user?user_id=${encodeURIComponent(userId)}`);
    if (res?.data?.success && res.data.data) {
      return res.data.data;
    }
  } catch {
    /* roster client fallback */
  }

  try {
    const rosterRes = await http.get(`/daily-roster/by-date?date=${todayDateString()}`);
    const team = findRosterTeamForUser(rosterRes?.data?.data, userId);
    if (team?.members?.length) {
      const members = team.members
        .map((m) => ({
          id: Number(m.user_id || m.member_id || 0),
          name: m.member_name || m.pasted_label || '',
        }))
        .filter((m) => m.id > 0);
      if (members.length) {
        return {
          lookup_date: todayDateString(),
          source: 'roster',
          team_title: team.team_title || null,
          selected_user_id: Number(userId),
          member_ids: members.map((m) => m.id),
          members,
        };
      }
    }
  } catch {
    /* single-user fallback below */
  }

  return {
    lookup_date: todayDateString(),
    source: 'none',
    team_title: null,
    selected_user_id: Number(userId),
    member_ids: [Number(userId)],
    members: [{ id: Number(userId), name: '' }],
  };
}

/**
 * Pending routers + items for each member of the selected user's daily team.
 */
export async function fetchDisbursementTeamContext(userId) {
  if (!userId) return null;

  const teamMeta = await fetchTeamMetaForUser(userId);
  const memberIds =
    teamMeta.member_ids?.length > 0 ? teamMeta.member_ids : [Number(userId)];

  let serverBalances = null;
  try {
    const balRes = await InventoryAPI.listPendingBalances({
      assigned_to_ids: memberIds.join(','),
    });
    serverBalances = Array.isArray(balRes?.data) ? balRes.data : null;
  } catch {
    /* client-side remaining only */
  }

  let disbursements = [];
  try {
    const disRes = await InventoryAPI.listDisbursements({
      assigned_to_ids: memberIds.join(','),
    });
    disbursements = Array.isArray(disRes?.data) ? disRes.data : [];
  } catch {
    disbursements = [];
  }

  const summaries = buildByUserSummary(disbursements, serverBalances);
  const byId = Object.fromEntries(summaries.map((s) => [s.id, s]));

  const seen = new Set();
  const memberRows = [];

  (teamMeta.members || []).forEach((m) => {
    const id = Number(m.id);
    if (!id || seen.has(id)) return;
    seen.add(id);
    const summary = byId[id] || { pendingRouters: [], pendingItems: [], name: m.name };
    const pendingRouters = summary.pendingRouters || [];
    const pendingItems = summary.pendingItems || [];
    memberRows.push({
      id,
      name: m.name || summary.name || `User #${id}`,
      isSelected: id === Number(userId),
      pendingRouters,
      pendingItems,
      hasPending: pendingRouters.length > 0 || pendingItems.length > 0,
    });
  });

  summaries.forEach((s) => {
    if (seen.has(s.id)) return;
    seen.add(s.id);
    memberRows.push({
      id: s.id,
      name: s.name,
      isSelected: s.id === Number(userId),
      pendingRouters: s.pendingRouters || [],
      pendingItems: s.pendingItems || [],
      hasPending: (s.pendingRouters?.length || 0) > 0 || (s.pendingItems?.length || 0) > 0,
    });
  });

  memberRows.sort((a, b) => {
    if (a.isSelected) return -1;
    if (b.isSelected) return 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  return {
    teamTitle: teamMeta.team_title || null,
    source: teamMeta.source || 'none',
    lookupDate: teamMeta.lookup_date || todayDateString(),
    selectedUserId: Number(userId),
    members: memberRows,
    withPending: memberRows.filter((m) => m.hasPending).length,
    withoutPending: memberRows.filter((m) => !m.hasPending).length,
  };
}
