import TicketsAPI from '../../helpers/TicketsAPI';

/**
 * Run a parsed assistant intent using existing APIs (same auth as the logged-in user).
 */
export async function executeAssistantAction(intent, { user, navigate }) {
  switch (intent.type) {
    case 'reply':
      return { success: true, message: intent.reply };

    case 'navigate_ticket': {
      if (!intent.ticketId) {
        return { success: false, message: 'Which ticket number?' };
      }
      navigate(`/admin/tickets/view/${intent.ticketId}`);
      return { success: true, message: `Opening ticket #${intent.ticketId}…` };
    }

    case 'update_status': {
      if (!intent.ticketId) {
        return { success: false, message: 'Tell me the ticket number, e.g. "change ticket 45 to resolved".' };
      }
      try {
        const res = await TicketsAPI.update(intent.ticketId, { status: intent.status });
        if (res?.success === false) {
          return { success: false, message: res.error || 'Update failed' };
        }
        return {
          success: true,
          message: `Ticket #${intent.ticketId} status set to **${intent.status}**.`,
          ticketId: intent.ticketId,
        };
      } catch (err) {
        return {
          success: false,
          message: err?.response?.data?.error || err?.message || 'Could not update ticket',
        };
      }
    }

    case 'add_note': {
      if (!intent.ticketId || !intent.note) {
        return { success: false, message: 'Use: add note to 45: your message here' };
      }
      try {
        const res = await TicketsAPI.update(intent.ticketId, { note: intent.note });
        if (res?.success === false) {
          return { success: false, message: res.error || 'Failed to add note' };
        }
        return {
          success: true,
          message: `Note added on ticket #${intent.ticketId}.`,
          ticketId: intent.ticketId,
        };
      } catch (err) {
        return {
          success: false,
          message: err?.response?.data?.error || err?.message || 'Could not add note',
        };
      }
    }

    case 'list_my_tickets': {
      const email = user?.email;
      if (!email) {
        return { success: false, message: 'Could not determine your account email for filtering.' };
      }
      try {
        const res = await TicketsAPI.getAll({ assigned_to: email, per_page: 50 });
        const list = Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res?.tickets)
            ? res.tickets
            : Array.isArray(res)
              ? res
              : [];
        const open = list.filter((t) => {
          const s = (t.status || '').toLowerCase();
          return s !== 'closed' && s !== 'resolved';
        });
        if (open.length === 0) {
          return { success: true, message: 'You have no open assigned tickets right now.' };
        }
        const lines = open.slice(0, 12).map((t) => {
          const num = t.number || t.id;
          const subj = (t.subject || '').slice(0, 40);
          return `• #${num} — ${t.status || 'unknown'}${subj ? ` — ${subj}` : ''}`;
        });
        const more = open.length > 12 ? `\n…and ${open.length - 12} more.` : '';
        return {
          success: true,
          message: `Your open tickets (${open.length}):\n${lines.join('\n')}${more}`,
        };
      } catch (err) {
        return {
          success: false,
          message: err?.response?.data?.error || 'Could not load your tickets',
        };
      }
    }

    default:
      return { success: false, message: 'Unknown action.' };
  }
}
