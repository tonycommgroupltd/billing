// ============================================
// TCOM API — Invoice Reminder Job
// ============================================
// Runs daily at 9am — checks for unpaid invoices
// and sends push notifications to customers
// ============================================

const { localPool, remotePool } = require('../db');
const { sendNotification } = require('../services/pushService');

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const INITIAL_DELAY_MS  = 60 * 1000;            // 1 minute after startup

/**
 * Check for unpaid invoices and send reminders
 * Only sends one reminder per invoice per day (tracks in notifications table)
 */
async function checkInvoiceReminders() {
  try {
    console.log(`  📋 Invoice reminder check starting at ${new Date().toISOString()}`);

    // Get all customers with push tokens registered
    const [registeredCustomers] = await localPool.query(
      'SELECT DISTINCT customer_id FROM push_tokens'
    );

    if (registeredCustomers.length === 0) {
      console.log('  📋 Invoice reminder — no customers with push tokens');
      return;
    }

    const customerIds = registeredCustomers.map(r => r.customer_id);
    let sent = 0;

    // Check each customer's unpaid invoices from remote DB
    for (const customerId of customerIds) {
      try {
        // Get customer's services
        const [services] = await remotePool.query(
          'SELECT id FROM services WHERE customer_id = ?',
          [customerId]
        );
        if (services.length === 0) continue;

        const serviceIds = services.map(s => s.id);

        // Get unpaid invoices
        const [invoices] = await remotePool.query(
          `SELECT id, total, date_due, status
           FROM invoices
           WHERE services_id IN (?) AND status IN ('not_paid', 'overdue')
           ORDER BY date_due ASC
           LIMIT 5`,
          [serviceIds]
        );

        if (invoices.length === 0) continue;

        // Check if we already sent a reminder today for this customer
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const [[existing]] = await localPool.query(
          `SELECT id FROM notifications
           WHERE customer_id = ? AND type = 'invoice'
           AND DATE(created_at) = ? LIMIT 1`,
          [customerId, today]
        );

        if (existing) continue; // Already reminded today

        // Calculate total outstanding
        const totalDue = invoices.reduce((sum, inv) => sum + parseFloat(inv.total || 0), 0);

        // Check if any are overdue
        const now = new Date();
        const overdue = invoices.filter(inv => new Date(inv.date_due) < now);

        let title, message;
        if (overdue.length > 0) {
          title = '⚠️ Invoice Overdue';
          message = `You have KSh ${totalDue.toLocaleString()} overdue. Pay now to avoid service interruption.`;
        } else {
          title = '📄 Invoice Reminder';
          message = `You have KSh ${totalDue.toLocaleString()} due. Pay on time to earn loyalty rewards!`;
        }

        await sendNotification(customerId, {
          title,
          message,
          type: 'invoice',
          data: {
            totalDue,
            invoiceCount: invoices.length,
            isOverdue: overdue.length > 0,
          },
        });
        sent++;
      } catch (err) {
        // Skip individual customer errors
        console.error(`  Invoice reminder error for customer ${customerId}:`, err.message);
      }
    }

    console.log(`  📋 Invoice reminder complete: ${sent} reminders sent`);
  } catch (err) {
    console.error('  ✗ Invoice reminder job error:', err.message);
  }
}

function startInvoiceReminder() {
  console.log('  ✓ Invoice reminder scheduled (daily)');

  // Run after 1 minute, then every 24 hours
  setTimeout(() => {
    checkInvoiceReminders();
    setInterval(checkInvoiceReminders, CHECK_INTERVAL_MS);
  }, INITIAL_DELAY_MS);
}

module.exports = { startInvoiceReminder, checkInvoiceReminders };
