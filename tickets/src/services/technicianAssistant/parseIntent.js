import { TICKET_STATUSES, HELP_TEXT } from './constants';

function extractTicketId(text) {
  const t = String(text || '');
  const patterns = [
    /(?:ticket|tkt|#)\s*(\d+)/i,
    /\b(?:id|no|number)\s*(\d+)/i,
    /\b(\d{2,})\b/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

export function normalizeStatusPhrase(phrase) {
  const p = String(phrase || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!p) return null;
  for (const s of TICKET_STATUSES) {
    if (s.value === p || s.aliases.includes(p)) return s.value;
    for (const alias of s.aliases) {
      if (p.includes(alias)) return s.value;
    }
  }
  return p.replace(/\s+/g, '_');
}

function parseStatusCommand(text, contextTicketId) {
  const lower = text.toLowerCase().trim();

  const setMatch = lower.match(
    /(?:set|change|update|mark|move)\s+(?:ticket\s+)?#?(\d+)?\s*(?:to\s+)?(?:status\s+)?(.+)/i
  );
  if (setMatch) {
    const id = setMatch[1] ? parseInt(setMatch[1], 10) : contextTicketId;
    const status = normalizeStatusPhrase(setMatch[2]);
    if (id && status) return { type: 'update_status', ticketId: id, status };
  }

  const closeMatch = lower.match(/(?:close|resolve|finish)\s+(?:ticket\s+)?#?(\d+)?/i);
  if (closeMatch) {
    const id = closeMatch[1] ? parseInt(closeMatch[1], 10) : contextTicketId;
    const status = lower.includes('resolve') ? 'resolved' : 'closed';
    if (id) return { type: 'update_status', ticketId: id, status };
  }

  const thisTicket = /(?:this\s+)?ticket/i.test(lower) || /\b(here|current)\b/i.test(lower);
  if (thisTicket && contextTicketId) {
    if (/(?:close|closed)/i.test(lower)) {
      return { type: 'update_status', ticketId: contextTicketId, status: 'closed' };
    }
    if (/(?:resolve|resolved|done|fixed)/i.test(lower)) {
      return { type: 'update_status', ticketId: contextTicketId, status: 'resolved' };
    }
    if (/(?:open|progress|wip)/i.test(lower)) {
      return { type: 'update_status', ticketId: contextTicketId, status: 'open' };
    }
    const statusPhrase = lower
      .replace(/.*(?:mark|set|change|update|status)\s+(?:to\s+)?/i, '')
      .replace(/(?:this\s+)?ticket/i, '')
      .trim();
    const status = normalizeStatusPhrase(statusPhrase);
    if (status && status.length > 2) {
      return { type: 'update_status', ticketId: contextTicketId, status };
    }
  }

  const bareStatus = normalizeStatusPhrase(lower);
  if (contextTicketId && bareStatus && TICKET_STATUSES.some((s) => s.value === bareStatus)) {
    return { type: 'update_status', ticketId: contextTicketId, status: bareStatus };
  }

  return null;
}

/**
 * @param {string} message
 * @param {{ ticketId?: number|null, pathname?: string }} context
 */
export function parseAssistantMessage(message, context = {}) {
  const text = String(message || '').trim();
  if (!text) {
    return { type: 'reply', reply: 'Type a command or say "help".' };
  }

  const lower = text.toLowerCase();
  const contextTicketId = context.ticketId ? parseInt(context.ticketId, 10) : null;

  if (/^help$|^what can you/i.test(lower)) {
    return { type: 'reply', reply: HELP_TEXT };
  }

  if (/my\s+tickets|list\s+(?:my\s+)?tickets|show\s+(?:my\s+)?(?:open\s+)?tickets/i.test(lower)) {
    return { type: 'list_my_tickets' };
  }

  const openMatch = lower.match(/(?:open|go to|view|show)\s+(?:ticket\s+)?#?(\d+)/i);
  if (openMatch) {
    return { type: 'navigate_ticket', ticketId: parseInt(openMatch[1], 10) };
  }

  const noteMatch = text.match(
    /(?:add\s+)?note\s+(?:on|to)\s+(?:ticket\s+)?#?(\d+)\s*[:\-]\s*(.+)/i
  );
  if (noteMatch) {
    return {
      type: 'add_note',
      ticketId: parseInt(noteMatch[1], 10),
      note: noteMatch[2].trim(),
    };
  }

  const statusCmd = parseStatusCommand(text, contextTicketId);
  if (statusCmd) return statusCmd;

  const id = extractTicketId(text);
  if (id && contextTicketId && id === contextTicketId) {
    return { type: 'reply', reply: `You are on ticket #${id}. Say "mark resolved", "close ticket", or "add note: your text".` };
  }

  return {
    type: 'reply',
    reply: `I didn't understand that. Say "help" for examples, or try "change ticket 45 to resolved".`,
  };
}
