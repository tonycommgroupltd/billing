import { isWhatsAppBoldLine, stripWhatsAppBold } from './dailyRosterWhatsApp';

const PHONE_RE = /\b(0\d{9})\b/;

/** Parse *TUESDAY/09/06/26* → yyyy-MM-dd */
export function parseRosterDateFromBoldLine(inner) {
  const m = (inner || '').trim().match(/^([A-Z]+)\/(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/i);
  if (!m) return null;
  const dd = m[2].padStart(2, '0');
  const mm = m[3].padStart(2, '0');
  let yy = m[4];
  if (yy.length === 2) yy = `20${yy}`;
  return `${yy}-${mm}-${dd}`;
}

export function parseTeamHeaderLine(inner) {
  const text = (inner || '').trim();
  const phoneMatch = text.match(PHONE_RE);
  if (!phoneMatch) {
    return { team_title: text, phone: '', extra_info: '' };
  }
  const phone = phoneMatch[1];
  const idx = text.indexOf(phone);
  const team_title = text.slice(0, idx).trim();
  const extra_info = text.slice(idx + phone.length).trim();
  return { team_title, phone, extra_info };
}

export function matchStaffByPastedName(pastedName, staffOptions = []) {
  const want = String(pastedName || '').trim().toUpperCase();
  if (!want) return null;

  return (
    staffOptions.find((s) => {
      const full = (s.name || '').trim().toUpperCase();
      const first = (s.name || '').trim().split(/\s+/)[0].toUpperCase();
      return first === want || full === want;
    }) || null
  );
}

/**
 * Parse a WhatsApp daily bulletin into roster teams + date.
 * Matches member names to system staff when possible.
 */
export function parseDailyRosterWhatsApp(pasteText, staffOptions = []) {
  const rawText = String(pasteText || '').trim();
  const lines = rawText.replace(/\r\n/g, '\n').split('\n');

  let rosterDate = null;
  const teams = [];
  let currentTeam = null;
  let matchedCount = 0;
  let unmatchedCount = 0;

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (isWhatsAppBoldLine(trimmed)) {
      const inner = stripWhatsAppBold(trimmed);

      if (!rosterDate) {
        const parsedDate = parseRosterDateFromBoldLine(inner);
        if (parsedDate) {
          rosterDate = parsedDate;
          return;
        }
      }

      if (currentTeam && (currentTeam.team_title || currentTeam.members.length > 0)) {
        teams.push(currentTeam);
      }

      const header = parseTeamHeaderLine(inner);
      currentTeam = {
        ...header,
        members: [],
        sort_order: teams.length,
      };
      return;
    }

    if (!currentTeam) return;

    const pasted = trimmed.toUpperCase();
    const staff = matchStaffByPastedName(pasted, staffOptions);
    if (staff) matchedCount += 1;
    else unmatchedCount += 1;

    currentTeam.members.push({
      pasted_label: trimmed,
      member_name: staff?.name || trimmed,
      user_id: staff?.id || null,
      sort_order: currentTeam.members.length,
    });
  });

  if (currentTeam && (currentTeam.team_title || currentTeam.members.length > 0)) {
    teams.push(currentTeam);
  }

  return {
    rosterDate,
    teams: teams.filter((t) => t.team_title || t.members.length > 0),
    notes: '',
    rawText,
    matchedCount,
    unmatchedCount,
  };
}

/** Stable key for manager override map (team title + WhatsApp line). */
export function memberOverrideKey(team, member) {
  const teamPart = (team?.team_title || '').trim().toUpperCase();
  const namePart = (member?.pasted_label || member?.member_name || '').trim().toUpperCase();
  return `${teamPart}::${namePart}`;
}

/** Apply manager dropdown selections onto parsed teams. */
export function applyMemberOverrides(teams, staffOptions = [], memberOverrides = {}) {
  return (teams || []).map((team, tIdx) => ({
    ...team,
    sort_order: tIdx,
    members: (team.members || []).map((member, mIdx) => {
      const key = memberOverrideKey(team, member);
      const overrideId = memberOverrides[key];
      if (overrideId) {
        const staff = staffOptions.find((s) => Number(s.id) === Number(overrideId));
        return {
          ...member,
          user_id: Number(overrideId),
          member_name: staff?.name || member.member_name,
          sort_order: mIdx,
        };
      }
      if (member.user_id) {
        const staff = staffOptions.find((s) => Number(s.id) === Number(member.user_id));
        return {
          ...member,
          member_name: staff?.name || member.member_name,
          sort_order: mIdx,
        };
      }
      return { ...member, sort_order: mIdx };
    }),
  }));
}

/** Members still without a linked system user. */
export function getUnmatchedMembers(teams, memberOverrides = {}) {
  const list = [];
  (teams || []).forEach((team) => {
    (team.members || []).forEach((member) => {
      const key = memberOverrideKey(team, member);
      const hasUser = member.user_id || memberOverrides[key];
      if (!hasUser) {
        list.push({ team, member, key });
      }
    });
  });
  return list;
}

/**
 * Find the roster team containing userId and shape it like daily-schedule/today.
 */
export function findRosterTeamForUser(roster, userId) {
  if (!roster?.teams?.length || !userId) return null;
  const uid = Number(userId);

  for (const team of roster.teams) {
    const linked = (team.members || []).filter((m) => {
      const id = Number(m.user_id || m.member_id || 0);
      return id > 0;
    });
    const onTeam = linked.some(
      (m) => Number(m.user_id || m.member_id) === uid
    );
    if (!onTeam) continue;

    return {
      schedule_date: roster.roster_date,
      source: 'roster',
      team_title: team.team_title,
      team_phone: team.phone || null,
      team_extra_info: team.extra_info || null,
      members: linked.map((m) => ({
        member_id: Number(m.user_id || m.member_id),
        member_name: m.member_name,
        member_role: m.member_role || null,
        pasted_label: m.pasted_label || m.member_name,
      })),
    };
  }
  return null;
}

/** Build override map from saved roster teams (reload). */
export function overridesFromSavedTeams(teams = []) {
  const map = {};
  teams.forEach((team) => {
    (team.members || []).forEach((member) => {
      if (member.user_id) {
        const withLabel = {
          ...member,
          pasted_label: member.pasted_label || member.member_name,
        };
        map[memberOverrideKey(team, withLabel)] = Number(member.user_id);
      }
    });
  });
  return map;
}
