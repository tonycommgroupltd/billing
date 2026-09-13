// ============================================
// Dashboard Sync Service
// ============================================
// Forwards mobile app tickets, replies, and
// status changes to the admin dashboard via
// a dedicated PHP webhook at:
//   /api/mobile-api.php/ticket
//   /api/mobile-api.php/reply
//   /api/mobile-api.php/status
//
// Secured with a shared API key (X-API-Key).
// All calls are fire-and-forget — they run in the
// background and never block the mobile response.
// ============================================

const axios = require('axios');

const ADMIN_API  = process.env.ADMIN_API_URL    || 'https://tickets.tonycommgroupltd.com/api';
const BRIDGE_KEY = process.env.ADMIN_BRIDGE_KEY || 'tcom_mobile_bridge_2026_secure';

const client = axios.create({
  baseURL: ADMIN_API,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': BRIDGE_KEY,
  },
});

// Category label map for the admin dashboard "type" field
const CAT_TO_TYPE = {
  no_internet:     'No Internet',
  slow_speeds:     'Slow Speeds',
  wifi_help:       'WiFi Help',
  password_change: 'Password Change',
  router_issue:    'Router Issue',
  billing:         'Billing',
  installation:    'New Setup',
  account:         'Account',
  general:         'Support',
  connectivity:    'No Internet',
  technical:       'Router Issue',
};

/**
 * Forward a newly created ticket to the admin dashboard.
 * Returns { adminId, adminNumber } or null on failure.
 */
async function forwardTicket(ticket, customer = {}) {
  try {
    const type = CAT_TO_TYPE[ticket.category] || 'Support';

    const desc = [
      `📱 Submitted via TCOM Mobile App`,
      `Reference: ${ticket.reference}`,
      `Customer: ${customer.name || ticket.customer_name || 'N/A'}`,
      `Phone: ${customer.phone || 'N/A'}`,
      `Email: ${customer.email || 'N/A'}`,
      `Category: ${type}`,
      `Priority: ${ticket.priority || 'medium'}`,
      `──────────────────────────`,
      ticket.message,
    ].join('\n');

    const body = {
      subject:        `[Mobile] ${ticket.subject}`,
      description:    desc,
      customer_name:  customer.name  || ticket.customer_name || 'Mobile Customer',
      customer_email: customer.email || null,
      customer_phone: customer.phone || null,
      address:        customer.address || null,
      type,
      priority:       ticket.priority || 'medium',
      group:          'Any',
      created_by:     'TCOM Mobile App',
    };

    const res = await client.post('/mobile-api.php/ticket', body);

    if (res.data?.success && res.data?.ticket?.id) {
      console.log(`  ↗ Ticket synced → dashboard ${res.data.ticket.number} (ID ${res.data.ticket.id})`);
      return {
        adminId:     res.data.ticket.id,
        adminNumber: res.data.ticket.number,
      };
    }
    console.warn('  ⚠ Dashboard sync: unexpected response', res.data);
    return null;
  } catch (err) {
    console.error('  ✗ Dashboard sync (ticket) failed:', err.response?.data?.error || err.message);
    return null;
  }
}

/**
 * Forward a customer reply to the admin dashboard.
 */
async function forwardReply(adminTicketId, message, senderName) {
  if (!adminTicketId) return;
  try {
    await client.post('/mobile-api.php/reply', {
      ticket_id: adminTicketId,
      message:   `💬 ${senderName || 'Customer'} (via Mobile App):\n\n${message}`,
      user_id:   0,
    });
    console.log(`  ↗ Reply synced → dashboard ticket ${adminTicketId}`);
  } catch (err) {
    console.error('  ✗ Dashboard sync (reply) failed:', err.response?.data?.error || err.message);
  }
}

/**
 * Forward a status change to the admin dashboard.
 */
async function forwardStatusChange(adminTicketId, status) {
  if (!adminTicketId) return;
  try {
    await client.post('/mobile-api.php/status', {
      ticket_id: adminTicketId,
      status,
    });
    console.log(`  ↗ Status "${status}" synced → dashboard ticket ${adminTicketId}`);
  } catch (err) {
    console.error('  ✗ Dashboard sync (status) failed:', err.response?.data?.error || err.message);
  }
}

module.exports = { forwardTicket, forwardReply, forwardStatusChange };
