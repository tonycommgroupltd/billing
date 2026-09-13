/** Ticket statuses technicians can set via the assistant (matches ticket view dropdown). */
export const TICKET_STATUSES = [
  { value: 'new', aliases: ['new'] },
  { value: 'open', aliases: ['open', 'work in progress', 'in progress', 'wip', 'ongoing', 'progress'] },
  { value: 'resolved', aliases: ['resolved', 'resolve', 'fixed', 'done'] },
  { value: 'installation complete', aliases: ['installation complete', 'install complete', 'installed'] },
  { value: 'waiting_customer', aliases: ['waiting customer', 'waiting on customer', 'wait customer'] },
  { value: 'waiting_agent', aliases: ['waiting agent', 'waiting on agent'] },
  { value: 'waiting_power', aliases: ['waiting power', 'no power'] },
  { value: 'power_available', aliases: ['power available', 'power back'] },
  { value: 'customer_unreachable', aliases: ['customer unreachable', 'unreachable', 'no answer', 'not reachable'] },
  { value: 'booked_later', aliases: ['booked later', 'reschedule', 'booked'] },
  { value: 'out_of_range', aliases: ['out of range', 'oor'] },
  { value: 'installed_elsewhere', aliases: ['installed elsewhere', 'another provider'] },
  { value: 'long_distance', aliases: ['long distance'] },
  { value: 'pole_needed', aliases: ['pole needed', 'need pole'] },
  { value: 'closed', aliases: ['closed', 'close', 'cancelled', 'canceled'] },
];

export const HELP_TEXT = `I can automate ticket work for you. Try:

• "Change ticket 45 to resolved"
• "Close ticket #123"
• "Mark 45 as customer unreachable"
• "Open ticket 78"
• "Add note to 45: pole needed at site"
• "My tickets"
• "Help"

On a ticket page you can also say "mark resolved" or "close this ticket" without the number.`;
