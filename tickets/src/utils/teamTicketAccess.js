import TicketsAPI from '../helpers/TicketsAPI';
import { resolveTodayTeamMemberIds } from './teamInventory';

const ELEVATED_ROLES = ['administrator', 'super-administrator', 'super-admin', 'manager'];

/**
 * Technicians / engineers without admin or manager roles — use daily-schedule team pool.
 */
export function isFieldUserWithTeamPool(user) {
  const roles = [...(user?.all_roles || []), user?.role]
    .map((r) => (r || '').toString().toLowerCase())
    .filter(Boolean);
  if (roles.some((r) => ELEVATED_ROLES.includes(r))) return false;
  return roles.some((r) => r === 'technician' || r === 'engineer');
}

function normalizeToken(value) {
  const s = (value || '').toString().trim().toLowerCase();
  if (!s || s === '0' || s === '-' || s === 'unassigned') return '';
  return s;
}

export function assigneeMatchTokensFromProfile(profile) {
  const tokens = new Set();
  const add = (v) => {
    const t = normalizeToken(v);
    if (t) tokens.add(t);
  };

  add(profile?.name);
  add(profile?.email);
  add(profile?.username);
  if (profile?.name && profile?.email) {
    add(`${profile.name} (${profile.email})`);
  }
  if (profile?.email && profile.email.includes('@')) {
    add(profile.email.split('@')[0]);
  }
  return [...tokens];
}

function assignedToValues(ticket) {
  const raw = ticket?.assignedTo ?? ticket?.assigned_to;
  if (raw == null || raw === '') return [];

  if (Array.isArray(raw)) {
    return raw.map((v) => String(v).trim()).filter(Boolean);
  }

  if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v).trim()).filter(Boolean);
      }
    } catch {
      /* fall through */
    }
  }

  const str = String(raw).trim();
  if (!str) return [];
  if (str.includes(',')) {
    return str.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [str];
}

export function ticketAssignedToProfile(ticket, profile) {
  const values = assignedToValues({
    assignedTo: ticket?.assignedToRaw ?? ticket?.assignedTo ?? ticket?.assigned_to,
  });
  if (!values.length) return false;

  const tokens = assigneeMatchTokensFromProfile(profile);
  if (!tokens.length) return false;

  return values.some((val) => {
    const lower = val.toLowerCase();
    return tokens.some((t) => tokenMatchesAssignee(t, lower));
  });
}

function tokenMatchesAssignee(token, assigneeLower) {
  if (!token || !assigneeLower) return false;
  if (assigneeLower === token) return true;
  if (assigneeLower.includes(`(${token})`)) return true;
  if (assigneeLower.startsWith(`${token} (`)) return true;
  if (token.includes('@') && assigneeLower.includes(token)) return true;
  if (token.length >= 4 && assigneeLower.includes(token)) return true;
  return false;
}

export function ticketVisibleToFieldUser(ticket, user, teamProfiles = []) {
  const self = {
    id: user?.id,
    name: user?.name || user?.username,
    email: user?.email,
    username: user?.username,
  };

  if (ticketAssignedToProfile(ticket, self)) return true;

  return teamProfiles.some(
    (p) => Number(p.id) !== Number(user?.id) && ticketAssignedToProfile(ticket, p)
  );
}

/**
 * Load today's schedule team with names + emails for assignee matching.
 * Only includes members from today's roster / daily schedule — not all technicians.
 */
export async function fetchTodayTeamProfiles(http, user) {
  if (!user?.id) return [];

  let teamIds = [];
  try {
    teamIds = await resolveTodayTeamMemberIds(http, user.id);
  } catch {
    teamIds = [user.id];
  }

  const teamIdSet = new Set(
    teamIds.map((id) => Number(id)).filter((id) => id > 0)
  );
  if (!teamIdSet.size) {
    teamIdSet.add(Number(user.id));
  }

  const byId = new Map();

  const addMember = (row) => {
    const id = Number(row?.id ?? row?.member_id ?? row?.user_id ?? 0);
    if (!id || !teamIdSet.has(id)) return;

    const prev = byId.get(id) || { id, name: '', email: '', username: '' };
    byId.set(id, {
      id,
      name: row?.name || row?.member_name || prev.name || '',
      email: row?.email || prev.email || '',
      username: row?.username || prev.username || '',
    });
  };

  try {
    const membersRes = await http.get('/daily-schedule/members');
    const members = membersRes?.data?.data;
    if (Array.isArray(members)) {
      members.forEach((m) => addMember(m));
    }
  } catch {
    /* roster may be missing on server */
  }

  try {
    const options = await TicketsAPI.getAssignmentOptions();
    (options || []).forEach((o) => addMember(o));
  } catch {
    /* optional enrichment for team IDs only */
  }

  teamIdSet.forEach((id) => {
    if (!byId.has(id)) {
      byId.set(id, { id, name: '', email: '', username: '' });
    }
  });

  addMember({
    id: user.id,
    name: user.name || user.username,
    email: user.email,
    username: user.username,
  });

  return [...byId.values()];
}

/**
 * Server-side team ticket list (daily-schedule group).
 */
export async function fetchTeamGroupTickets(http, { excludeResolved = true } = {}) {
  const res = await http.get('/daily-schedule/group-tickets', {
    params: { exclude_resolved: excludeResolved ? '1' : '0' },
  });
  if (!res?.data?.success) {
    throw new Error(res?.data?.error || 'Failed to load team tickets');
  }
  const tickets = Array.isArray(res.data.data) ? res.data.data : [];
  const memberIds = Array.isArray(res.data.member_ids) ? res.data.member_ids : [];
  return {
    tickets,
    memberIds,
    shouldFallback: memberIds.length === 0 && tickets.length === 0,
  };
}
