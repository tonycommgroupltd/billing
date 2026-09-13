// ============================================
// TCOM API — KRA Sync & Reconciliation Worker
// ============================================
// Phase 4: Async sync between KRA sidecar and main DB.
// Two responsibilities:
//   1. Outbox Replay (KRA → Main): Consume kra_sync_outbox, retry failed events, move
//      failures to kra_sync_dead_letter after max retries.
//   2. Nightly Reconciliation (Main → KRA): Snapshot source DB state and compare against
//      KRA to detect drift, emit remediation events.
// 
// Runs in background; worker-safe with lease/lock pattern to prevent concurrent runs.
// ============================================

const { remotePool, localPool, kraPool } = require('../db');

// Configuration
const MAX_OUTBOX_RETRIES = 5;
const OUTBOX_RETRY_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes between retries
const NIGHTLY_RECONCILIATION_WINDOW = 24 * 60 * 60 * 1000; // 24 hours
const WORKER_LOCK_TTL_SECONDS = 5 * 60; // 5 minutes (prevent concurrent runs)

let isOutboxReplayRunning = false;
let isNightlyReconciliationRunning = false;

/**
 * Acquire distributed lock for worker task (lease pattern).
 * Prevents concurrent runs of same worker across multiple processes.
 */
async function acquireWorkerLock(lockKey, ttlSeconds = WORKER_LOCK_TTL_SECONDS) {
  try {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const [result] = await kraPool.query(
      `INSERT INTO kra_sync_outbox (sync_type, target_system, lock_key, status, created_at)
       SELECT ?, ?, ?, 'LOCK', NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM kra_sync_outbox
         WHERE lock_key = ? AND status = 'LOCK' AND created_at > DATE_SUB(NOW(), INTERVAL ? SECOND)
       )`,
      [lockKey, 'lock', lockKey, lockKey, ttlSeconds]
    );
    return result.affectedRows > 0;
  } catch (err) {
    console.error(`[KRA SYNC LOCK ERROR] Failed to acquire lock ${lockKey}:`, err.message);
    return false;
  }
}

/**
 * Release distributed lock.
 */
async function releaseWorkerLock(lockKey) {
  try {
    await kraPool.query(
      `DELETE FROM kra_sync_outbox WHERE lock_key = ? AND status = 'LOCK'`,
      [lockKey]
    );
  } catch (err) {
    console.error(`[KRA SYNC LOCK RELEASE ERROR] Failed to release lock ${lockKey}:`, err.message);
  }
}

/**
 * OUTBOX REPLAY: Consume pending events from kra_sync_outbox.
 * Retry failed events up to MAX_OUTBOX_RETRIES; after that, move to dead_letter.
 */
async function replayOutboxEvents() {
  if (isOutboxReplayRunning) {
    console.log(`  ⏭️  KRA outbox replay already running; skipping this cycle`);
    return;
  }

  isOutboxReplayRunning = true;
  const lockKey = 'kra_sync_outbox_replay';

  try {
    // Acquire distributed lock to prevent concurrent runs
    const lockAcquired = await acquireWorkerLock(lockKey);
    if (!lockAcquired) {
      console.log(`  ⏭️  KRA outbox replay lock held by another process; skipping`);
      return;
    }

    console.log(`  ⏭️  KRA outbox replay starting at ${new Date().toISOString()}`);

    const [pendingEvents] = await kraPool.query(
      `SELECT id, sync_type, payload, retry_count
       FROM kra_sync_outbox
       WHERE status = 'PENDING' AND retry_count < ?
       ORDER BY created_at ASC
       LIMIT 100`,
      [MAX_OUTBOX_RETRIES]
    );

    if (pendingEvents.length === 0) {
      console.log(`  ⏭️  KRA outbox replay — no pending events`);
      await releaseWorkerLock(lockKey);
      return;
    }

    let successCount = 0;
    let failureCount = 0;
    let deadLetterCount = 0;

    for (const event of pendingEvents) {
      try {
        const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;

        // Simulate delivery to main DB (in production, this would call a webhook or API)
        // For now, mark as delivered after payload validation
        let deliverySuccess = false;

        if (event.sync_type === 'PAYMENT_RECEIPT_SYNC') {
          // Simulate syncing payment receipt to main DB payment table
          deliverySuccess = validatePaymentReceiptSync(payload);
        } else if (event.sync_type === 'INVOICE_SYNC') {
          // Simulate syncing invoice to main DB
          deliverySuccess = validateInvoiceSync(payload);
        } else {
          deliverySuccess = true; // Unknown sync types optimistically succeed
        }

        if (deliverySuccess) {
          await kraPool.query(
            `UPDATE kra_sync_outbox SET status = 'DELIVERED', updated_at = NOW() WHERE id = ?`,
            [event.id]
          );
          successCount++;
          console.log(`  ✓ Outbox event ${event.id} (${event.sync_type}) delivered`);
        } else {
          // Increment retry count
          const newRetryCount = event.retry_count + 1;
          if (newRetryCount >= MAX_OUTBOX_RETRIES) {
            // Move to dead_letter
            await kraPool.query(
              `INSERT INTO kra_sync_dead_letter (original_event_id, sync_type, payload, error_reason, created_at)
               VALUES (?, ?, ?, ?, NOW())`,
              [event.id, event.sync_type, JSON.stringify(payload), `Max retries (${MAX_OUTBOX_RETRIES}) exceeded`]
            );
            await kraPool.query(
              `UPDATE kra_sync_outbox SET status = 'FAILED', updated_at = NOW() WHERE id = ?`,
              [event.id]
            );
            deadLetterCount++;
            console.log(`  ✗ Outbox event ${event.id} moved to dead_letter after ${newRetryCount} retries`);
          } else {
            // Retry
            await kraPool.query(
              `UPDATE kra_sync_outbox SET retry_count = retry_count + 1, last_retry_at = NOW(), updated_at = NOW() WHERE id = ?`,
              [event.id]
            );
            failureCount++;
            console.log(`  ⟳ Outbox event ${event.id} retry ${newRetryCount}/${MAX_OUTBOX_RETRIES}`);
          }
        }
      } catch (err) {
        console.error(`  ✗ Outbox event ${event.id} processing failed:`, err.message);
        failureCount++;
      }
    }

    console.log(
      `  ⏭️  KRA outbox replay complete: ${successCount} delivered, ${failureCount} retrying, ${deadLetterCount} moved to dead_letter`
    );
    await releaseWorkerLock(lockKey);
  } catch (err) {
    console.error('[KRA OUTBOX REPLAY ERROR]', err);
  } finally {
    isOutboxReplayRunning = false;
  }
}

/**
 * NIGHTLY RECONCILIATION: Compare main DB state against KRA sidecar.
 * Detects missing customers, services, payments; emits remediation events.
 * Runs once per day (typically midnight).
 */
async function performNightlyReconciliation() {
  if (isNightlyReconciliationRunning) {
    console.log(`  🌙 KRA nightly reconciliation already running; skipping this cycle`);
    return;
  }

  isNightlyReconciliationRunning = true;
  const lockKey = 'kra_sync_nightly_reconciliation';

  try {
    // Acquire distributed lock
    const lockAcquired = await acquireWorkerLock(lockKey);
    if (!lockAcquired) {
      console.log(`  🌙 KRA nightly reconciliation lock held by another process; skipping`);
      return;
    }

    console.log(`  🌙 KRA nightly reconciliation starting at ${new Date().toISOString()}`);

    // Create reconciliation run record
    const [runResult] = await kraPool.query(
      `INSERT INTO kra_reconciliation_runs (run_type, status, started_at, created_at)
       VALUES (?, ?, NOW(), NOW())`,
      ['nightly_main_to_kra', 'IN_PROGRESS']
    );
    const reconciliationRunId = runResult.insertId;

    let discrepanciesFound = 0;

    // Phase 1: Check for customers in main DB not synced to KRA
    const [mainCustomers] = await remotePool.query(
      `SELECT id, name FROM customers WHERE deleted_at IS NULL`
    );

    const [kraCustomers] = await kraPool.query(
      `SELECT main_customer_id FROM kra_customers`
    );

    const kraCustSet = new Set(kraCustomers.map(c => c.main_customer_id));

    for (const mainCust of mainCustomers) {
      if (!kraCustSet.has(mainCust.id)) {
        await recordReconciliationDiscrepancy(
          reconciliationRunId,
          'CUSTOMER_MISSING_IN_KRA',
          { main_customer_id: mainCust.id, customer_name: mainCust.name }
        );
        discrepanciesFound++;
        console.log(`  🔸 Discrepancy: Customer ${mainCust.id} missing in KRA sidecar`);
      }
    }

    // Phase 2: Check for active services not synced to KRA
    const [mainServices] = await remotePool.query(
      `SELECT id, customer_id FROM services WHERE deleted_at IS NULL AND JSON_EXTRACT(status, '$.value') = 2`
    );

    const [kraServices] = await kraPool.query(
      `SELECT main_service_id FROM kra_service_accounts`
    );

    const kraServSet = new Set(kraServices.map(s => s.main_service_id));

    for (const mainServ of mainServices) {
      if (!kraServSet.has(mainServ.id)) {
        await recordReconciliationDiscrepancy(
          reconciliationRunId,
          'SERVICE_MISSING_IN_KRA',
          { main_service_id: mainServ.id, main_customer_id: mainServ.customer_id }
        );
        discrepanciesFound++;
        console.log(`  🔸 Discrepancy: Service ${mainServ.id} missing in KRA sidecar`);
      }
    }

    // Phase 3: Check for recent payments not yet ingested into KRA
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [recentPayments] = await remotePool.query(
      `SELECT id, customer_id, amount FROM payments WHERE date >= ?`,
      [oneDayAgo]
    );

    const [kraPayments] = await kraPool.query(
      `SELECT main_payment_id FROM kra_payment_receipts`
    );

    const kraPaySet = new Set(kraPayments.map(p => p.main_payment_id));

    for (const mainPay of recentPayments) {
      if (!kraPaySet.has(mainPay.id)) {
        await recordReconciliationDiscrepancy(
          reconciliationRunId,
          'PAYMENT_NOT_INGESTED',
          { main_payment_id: mainPay.id, customer_id: mainPay.customer_id, amount: mainPay.amount }
        );
        discrepanciesFound++;
        console.log(`  🔸 Discrepancy: Payment ${mainPay.id} (${mainPay.amount}) not yet ingested to KRA`);
      }
    }

    // Finalize reconciliation run
    await kraPool.query(
      `UPDATE kra_reconciliation_runs SET status = 'COMPLETED', discrepancies_found = ?, completed_at = NOW()
       WHERE id = ?`,
      [discrepanciesFound, reconciliationRunId]
    );

    console.log(
      `  🌙 KRA nightly reconciliation complete: ${discrepanciesFound} discrepancies found and recorded`
    );
    await releaseWorkerLock(lockKey);
  } catch (err) {
    console.error('[KRA NIGHTLY RECONCILIATION ERROR]', err);
  } finally {
    isNightlyReconciliationRunning = false;
  }
}

/**
 * Record a discrepancy found during nightly reconciliation.
 */
async function recordReconciliationDiscrepancy(reconciliationRunId, discrepancyType, details) {
  try {
    await kraPool.query(
      `INSERT INTO kra_reconciliation_items (run_id, discrepancy_type, details, resolution_status, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [reconciliationRunId, discrepancyType, JSON.stringify(details), 'PENDING']
    );
  } catch (err) {
    console.error('[RECONCILIATION ITEM INSERT ERROR]', err.message);
  }
}

/**
 * Validate payment receipt sync payload before marking delivered.
 * (In production, this would call an API endpoint on main DB.)
 */
function validatePaymentReceiptSync(payload) {
  return (
    payload.payment_receipt_id &&
    payload.main_payment_id &&
    payload.amount > 0 &&
    payload.confirmation_status === 'CONFIRMED'
  );
}

/**
 * Validate invoice sync payload before marking delivered.
 */
function validateInvoiceSync(payload) {
  return (
    payload.invoice_id &&
    payload.invoice_number &&
    payload.main_customer_id &&
    payload.total_amount > 0
  );
}

/**
 * Start background workers: outbox replay + nightly reconciliation.
 * Call this once from server.js on startup.
 */
function startKraSyncWorkers() {
  console.log('🔄 Starting KRA sync & reconciliation workers...');

  // Outbox replay: run every 2 minutes
  setInterval(() => {
    replayOutboxEvents().catch((err) => console.error('[OUTBOX REPLAY INTERVAL ERROR]', err));
  }, OUTBOX_RETRY_INTERVAL_MS);

  // Nightly reconciliation: run daily at midnight (or on interval for testing)
  // For now, run once every 24 hours starting in 1 minute
  const NIGHTLY_INITIAL_DELAY_MS = 60 * 1000; // 1 minute after startup
  setTimeout(() => {
    performNightlyReconciliation().catch((err) =>
      console.error('[NIGHTLY RECONCILIATION INTERVAL ERROR]', err)
    );
    setInterval(() => {
      performNightlyReconciliation().catch((err) =>
        console.error('[NIGHTLY RECONCILIATION INTERVAL ERROR]', err)
      );
    }, NIGHTLY_RECONCILIATION_WINDOW);
  }, NIGHTLY_INITIAL_DELAY_MS);

  console.log('✓ KRA sync workers scheduled (outbox: 2min, nightly: 24h)');
}

module.exports = {
  startKraSyncWorkers,
  replayOutboxEvents,
  performNightlyReconciliation,
};
