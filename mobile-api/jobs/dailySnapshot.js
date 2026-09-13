// ============================================
// TCOM API — Daily Snapshot Job
// ============================================
// Runs automatically at midnight (00:05)
// Captures all accounts expiring that day
// Snapshots are kept forever for historical tracking
// ============================================

const { localPool: trackerPool, remotePool: financePool } = require('../db');

/**
 * Take a snapshot of accounts expiring today
 * Records all services with bill_to = today
 */
async function takeSnapshotForDate(date) {
  try {
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    console.log(`  📸 Taking snapshot for ${targetDate}...`);

    // Check if snapshot already exists for this date
    const [existing] = await trackerPool.query(
      'SELECT COUNT(*) as count FROM expired_accounts_snapshot WHERE snapshot_date = ?',
      [targetDate]
    );

    if (existing[0].count > 0) {
      console.log(`  📸 Snapshot already exists for ${targetDate} (${existing[0].count} accounts)`);
      return { success: true, alreadyExists: true, count: existing[0].count };
    }

    // Get accounts expiring on the target date from remote database
    // Disabled accounts expiring on this date will be classified by their service status
    const [expiringAccounts] = await financePool.query(`
      SELECT 
        c.id as customer_id,
        c.name,
        c.phone_number as phone,
        s.id as service_id,
        s.bill_to,
        s.status as service_status,
        p.title as plan_name,
        p.price
      FROM services s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN plans p ON s.plan_id = p.id
      WHERE DATE(s.bill_to) = ?
    `, [targetDate]);

    if (expiringAccounts.length === 0) {
      console.log(`  📸 No accounts expiring or disabled on ${targetDate}`);
      return { success: true, count: 0 };
    }

    // Insert into local snapshot table
    let inserted = 0;
    for (const acc of expiringAccounts) {
      try {
        const isDisabled = acc.service_status && acc.service_status.toString().includes('Disabled');
        const accountStatus = isDisabled ? 'disabled' : 'expired';
        await trackerPool.query(`
          INSERT INTO expired_accounts_snapshot 
          (snapshot_date, customer_id, service_id, bill_to, days_overdue, price, plan_name, account_status)
          VALUES (?, ?, ?, ?, 0, ?, ?, ?)
        `, [targetDate, acc.customer_id, acc.service_id, acc.bill_to, acc.price, acc.plan_name, accountStatus]);
        inserted++;
      } catch (e) {
        // Duplicate entry or other error, skip
        if (!e.message.includes('Duplicate')) {
          console.error(`  Snapshot insert error: ${e.message}`);
        }
      }
    }

    console.log(`  📸 Snapshot complete for ${targetDate}: ${inserted} accounts captured`);
    return { success: true, count: inserted, date: targetDate };

  } catch (err) {
    console.error(`  ✗ Snapshot error:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Run the daily snapshot job
 * Called at midnight to capture accounts expiring today
 */
async function runDailySnapshot() {
  console.log(`  📸 Daily snapshot job running at ${new Date().toISOString()}`);
  const today = new Date().toISOString().split('T')[0];
  await takeSnapshotForDate(today);
}

/**
 * Calculate milliseconds until next midnight (00:05)
 * Adding 5 minutes buffer to ensure the day has changed
 */
function msUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 5, 0, 0); // 00:05:00
  return midnight.getTime() - now.getTime();
}

/**
 * Start the daily snapshot scheduler
 * Runs at 00:05 every day
 */
function startDailySnapshot() {
  const msUntilNext = msUntilMidnight();
  const hoursUntil = Math.round(msUntilNext / (1000 * 60 * 60) * 10) / 10;
  
  console.log(`  ✓ Daily snapshot scheduled (midnight, next in ${hoursUntil}h)`);

  // Ensure account_status ENUM includes 'disabled'
  trackerPool.query(`
    ALTER TABLE expired_accounts_snapshot 
    MODIFY COLUMN account_status ENUM('active', 'expired', 'expiring_soon', 'disabled') DEFAULT 'active'
  `).catch(() => { /* already correct or table doesn't exist yet */ });

  // Schedule first run at midnight
  setTimeout(() => {
    runDailySnapshot();
    
    // Then run every 24 hours
    setInterval(runDailySnapshot, 24 * 60 * 60 * 1000);
  }, msUntilNext);

  // Also run immediately if no snapshot exists for today
  (async () => {
    const today = new Date().toISOString().split('T')[0];
    const [existing] = await trackerPool.query(
      'SELECT COUNT(*) as count FROM expired_accounts_snapshot WHERE snapshot_date = ?',
      [today]
    );
    if (existing[0].count === 0) {
      console.log(`  📸 No snapshot for today, taking one now...`);
      await takeSnapshotForDate(today);
    }
  })().catch(err => console.error('  Initial snapshot check error:', err.message));
}

module.exports = { 
  startDailySnapshot, 
  runDailySnapshot, 
  takeSnapshotForDate 
};
