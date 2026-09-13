import { format, parseISO, isValid } from 'date-fns';

/** Map staff options by user id for name lookup. */
export function staffOptionsById(staffOptions = []) {
  const map = {};
  staffOptions.forEach((s) => {
    if (s?.id != null) map[s.id] = s;
  });
  return map;
}

/** WhatsApp bulletin name — first name from system user, uppercased. */
export function rosterWhatsAppMemberName(member, staffById = {}) {
  let raw = '';
  if (member?.user_id != null && staffById[member.user_id]) {
    raw = staffById[member.user_id].name || '';
  }
  if (!raw) raw = member?.member_name || member?.name || '';
  const token = raw.trim().split(/\s+/).filter(Boolean)[0] || raw.trim();
  return token.toUpperCase();
}

/** Build WhatsApp bulletin text matching field team format. */
export function buildDailyRosterWhatsAppText(
  rosterDate,
  teams = [],
  notes = '',
  staffOptions = []
) {
  const staffById = staffOptionsById(staffOptions);
  const dateObj =
    typeof rosterDate === 'string' ? parseISO(rosterDate) : rosterDate;
  const safeDate = isValid(dateObj) ? dateObj : new Date();

  const day = format(safeDate, 'EEEE').toUpperCase();
  const dateStr = format(safeDate, 'dd/MM/yy');
  const lines = [`*${day}/${dateStr}*`, ''];

  teams.forEach((team) => {
    const title = (team.team_title || '').trim();
    if (!title) return;

    const headerParts = [title];
    const phone = (team.phone || '').trim();
    const extra = (team.extra_info || '').trim();
    if (phone) headerParts.push(phone);
    if (extra) headerParts.push(extra);

    lines.push(`*${headerParts.join(' ').toUpperCase()}*`);
    lines.push('');

    (team.members || []).forEach((member) => {
      const name = rosterWhatsAppMemberName(member, staffById);
      if (name) lines.push(name);
    });
    lines.push('');
  });

  let text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  const trimmedNotes = (notes || '').trim();
  if (trimmedNotes) {
    text = `${text}\n\n${trimmedNotes}`;
  }
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

/** Split WhatsApp markup for preview (*bold* lines). */
export function whatsAppPreviewLines(text = '') {
  return String(text).split('\n');
}

export function isWhatsAppBoldLine(line) {
  const t = (line || '').trim();
  return t.startsWith('*') && t.endsWith('*') && t.length > 2;
}

export function stripWhatsAppBold(line) {
  const t = (line || '').trim();
  if (isWhatsAppBoldLine(t)) return t.slice(1, -1);
  return line;
}

export function whatsAppShareUrl(text) {
  if (!text?.trim()) return '';
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function emptyTeam(sortOrder = 0) {
  return {
    team_title: '',
    phone: '',
    extra_info: '',
    sort_order: sortOrder,
    members: [],
  };
}

export function emptyMember(sortOrder = 0) {
  return { member_name: '', user_id: null, sort_order: sortOrder };
}
