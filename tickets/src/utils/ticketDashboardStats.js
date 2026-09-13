/**
 * Parse ticket stats from tickets.php/stats — same fields as Tickets Dashboard cards.
 */
export function parseTicketStatsResponse(statsResp) {
  const payload = statsResp?.data || statsResp || {};
  const byStatus = payload.byStatus || payload.by_status || payload.status_counts || {};

  return {
    newTickets: Number(payload.newTickets ?? byStatus.new) || 0,
    workInProgress: Number(payload.workInProgress) || 0,
    resolved: Number(payload.resolved) || 0,
    waitingOnAgent: Number(payload.waitingOnAgent) || 0,
    installations: Number(payload.installations) || 0,
    total: Number(payload.total) || 0,
  };
}

/** Same unassigned rules as Tickets List filters. */
export function isTicketUnassigned(ticketOrAssignedTo) {
  const raw =
    ticketOrAssignedTo && typeof ticketOrAssignedTo === 'object'
      ? ticketOrAssignedTo.assignedTo ?? ticketOrAssignedTo.assigned_to
      : ticketOrAssignedTo;
  const assigned = (raw ?? '').toString().trim();
  if (!assigned) return true;
  const lower = assigned.toLowerCase();
  return lower === '0' || lower === '-' || lower === 'unassigned';
}

/**
 * Client-side card tallies (used for field-user filtered pools).
 * Installations still come from apiStats when provided.
 */
export function calculateTicketStats(tickets = [], apiStats = {}) {
  const stats = {
    newTickets: 0,
    workInProgress: 0,
    resolved: 0,
    waitingOnAgent: 0,
    installations: Number(apiStats.installations) || 0,
    unassigned: 0,
  };

  tickets.forEach((ticket) => {
    const status = String(ticket?.status || '').toLowerCase();

    if (status === 'new') {
      stats.newTickets += 1;
    } else if (['open', 'in_progress', 'work in progress', 'work_in_progress'].includes(status)) {
      stats.workInProgress += 1;
    } else if (['resolved', 'closed'].includes(status)) {
      stats.resolved += 1;
    } else if (['waiting on agent', 'waiting_agent'].includes(status)) {
      stats.waitingOnAgent += 1;
    }

    if (isTicketUnassigned(ticket)) {
      stats.unassigned += 1;
    }
  });

  return stats;
}

export const TICKET_DASHBOARD_ROLES = [
  'super-administrator',
  'ict',
  'administrator',
  'manager',
  'technician',
  'engineer',
  'customer-creator',
];

export function userHasTicketDashboardAccess(allRoles = []) {
  return TICKET_DASHBOARD_ROLES.some((role) => allRoles.includes(role));
}
