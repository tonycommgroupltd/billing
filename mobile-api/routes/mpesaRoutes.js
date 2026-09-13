// ============================================
// TCOM API — M-Pesa Routes
// ============================================
// POST /api/mpesa/pay          — Initiate STK push for invoice
// GET  /api/mpesa/status/:id   — Query STK status
// POST /api/mpesa/callback     — Daraja callback (no auth)
// ============================================

const express = require('express');
const router = express.Router();
const { localPool, remotePool } = require('../db');
const { authMiddleware } = require('../auth');
const { initiateSTKPush, querySTKStatus } = require('../services/mpesaService');
const { applyPlanChange } = require('./planRoutes');

// --------------------------------------------------
// POST /api/mpesa/pay — Initiate STK Push for an invoice
// Body: { invoiceId, amount, phone }
// --------------------------------------------------
router.post('/pay', authMiddleware, async (req, res) => {
  try {
    const customerId = req.user.customerId;
    const { invoiceId, amount, phone, serviceId } = req.body;

    if (!amount || !phone) {
      return res.status(400).json({ error: 'amount and phone are required' });
    }

    // Look up the customer's registered phone number from the database
    // This is used for AccountReference so the billing system can identify the customer
    let customerDbPhone = '';
    try {
      const [custRows] = await remotePool.query(
        'SELECT phone_number FROM customers WHERE id = ? LIMIT 1',
        [customerId]
      );
      if (custRows.length > 0) {
        customerDbPhone = String(custRows[0].phone_number).replace(/\D/g, '');
      }
    } catch (e) {
      console.warn('[MPESA] Could not look up customer phone from DB:', e.message);
    }
    // Fallback to the M-Pesa phone if DB lookup fails
    if (!customerDbPhone) {
      customerDbPhone = String(phone).replace(/\D/g, '');
    }

    // Format: customerDbPhone#serviceId — so the billing system knows which service was paid
    // If serviceId not provided, look it up from the invoice
    let svcId = serviceId;
    if (!svcId && invoiceId) {
      try {
        const { remotePool: rp } = require('../db');
        const [rows] = await rp.query(
          'SELECT services_id FROM invoices WHERE id = ? LIMIT 1',
          [invoiceId]
        );
        if (rows.length > 0) svcId = rows[0].services_id;
      } catch (e) {
        console.warn('[MPESA] Could not look up serviceId from invoice:', e.message);
      }
    }

    // Build AccountReference: customerDbPhone#serviceId (e.g. 0712848481#4521)
    // Uses the customer's registered phone from the DB, not the M-Pesa phone
    const accountRef = svcId
      ? `${customerDbPhone}#${svcId}`
      : (invoiceId ? `TCOM-INV-${invoiceId}` : `TCOM-PAY-${customerId}`);

    console.log(`[MPESA STK] Customer ${customerId}, phone ${phone}, amount ${amount}, serviceId ${svcId || 'N/A'}, ref: ${accountRef}`);

    const result = await initiateSTKPush(phone, amount, accountRef, 'TCOM Internet Payment');

    if (!result.success) {
      return res.status(502).json({ success: false, error: result.error });
    }

    res.json({
      success: true,
      checkoutRequestId: result.checkoutRequestId,
      accountRef,
      message: 'Payment initiated. Check your phone for M-Pesa prompt.',
    });
  } catch (err) {
    console.error('M-Pesa pay error:', err);
    res.status(500).json({ error: 'Failed to initiate payment' });
  }
});

// --------------------------------------------------
// GET /api/mpesa/status/:checkoutRequestId — Query payment status
// --------------------------------------------------
router.get('/status/:checkoutRequestId', authMiddleware, async (req, res) => {
  try {
    const result = await querySTKStatus(req.params.checkoutRequestId);
    res.json(result);
  } catch (err) {
    // If query fails (e.g. too early), return pending
    console.error('M-Pesa status query error:', err?.response?.data || err.message);
    res.json({ status: 'pending', resultDesc: 'Waiting for payment confirmation' });
  }
});

// --------------------------------------------------
// POST /api/mpesa/callback — Daraja STK callback (NO auth)
// Safaricom sends the result here after customer enters PIN
// --------------------------------------------------
router.post('/callback', async (req, res) => {
  try {
    const body = req.body?.Body?.stkCallback;
    if (!body) {
      console.error('M-Pesa callback: invalid body', JSON.stringify(req.body).substring(0, 500));
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    const {
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      CallbackMetadata,
    } = body;

    console.log(`  ← M-Pesa callback: ${CheckoutRequestID} ResultCode=${ResultCode}`);

    // Parse metadata items
    const meta = {};
    if (CallbackMetadata?.Item) {
      CallbackMetadata.Item.forEach(item => {
        meta[item.Name] = item.Value;
      });
    }

    // ResultCode 0 = success
    if (ResultCode === 0) {
      const receipt = meta.MpesaReceiptNumber || '';
      const amount = meta.Amount || 0;
      const phone = meta.PhoneNumber || '';

      // Check if this is a plan change payment
      const [[changeReq]] = await localPool.query(
        `SELECT * FROM plan_change_requests 
         WHERE checkout_request_id = ? AND status = 'pending_payment'`,
        [CheckoutRequestID]
      );

      if (changeReq) {
        // Update the plan change request
        await localPool.query(
          `UPDATE plan_change_requests 
           SET status = 'paid', mpesa_receipt = ?, mpesa_phone = ?, updated_at = NOW()
           WHERE id = ?`,
          [receipt, String(phone), changeReq.id]
        );

        console.log(`  ✓ Plan change #${changeReq.id} paid: ${receipt} KES ${amount}`);

        // Apply the plan change automatically
        await applyPlanChange(
          changeReq.id,
          changeReq.service_id,
          changeReq.new_plan_id,
          parseFloat(changeReq.new_price),
          changeReq.customer_id,
          0, // No credit for upgrade
          changeReq.change_type
        );
      } else {
        // Regular invoice payment — log it
        console.log(`  ✓ M-Pesa payment received: ${receipt} KES ${amount} from ${phone}`);
        // The main billing system handles invoice payments via its own callback
      }
    } else {
      // Payment failed/cancelled
      const [[changeReq]] = await localPool.query(
        `SELECT id FROM plan_change_requests 
         WHERE checkout_request_id = ? AND status = 'pending_payment'`,
        [CheckoutRequestID]
      );

      if (changeReq) {
        const failStatus = ResultCode === 1032 ? 'cancelled' : 'failed';
        await localPool.query(
          `UPDATE plan_change_requests SET status = ?, notes = CONCAT(IFNULL(notes,''), ?) WHERE id = ?`,
          [failStatus, ` | M-Pesa: ${ResultDesc}`, changeReq.id]
        );
        console.log(`  ✗ Plan change #${changeReq.id} ${failStatus}: ${ResultDesc}`);
      }
    }

    // Always respond 200 to Safaricom
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (err) {
    console.error('M-Pesa callback error:', err);
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' }); // Never fail Safaricom
  }
});

module.exports = router;
