// ============================================
// TCOM API — Push Notification Service
// ============================================
// Uses Expo Push Notifications (free, no Firebase needed)
// Sends push notifications to registered devices
// ============================================

const { localPool } = require('../db');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Send push notification to a specific customer
 * Also saves the notification to the DB for in-app history
 */
async function sendNotification(customerId, { title, message, type = 'ticket', data = {} }) {
  try {
    // 1. Save to notifications table (always, even if no push token)
    await localPool.query(
      `INSERT INTO notifications (customer_id, title, message, type, data)
       VALUES (?, ?, ?, ?, ?)`,
      [customerId, title, message, type, JSON.stringify(data)]
    );

    // 2. Get push tokens for this customer
    const [tokens] = await localPool.query(
      'SELECT token FROM push_tokens WHERE customer_id = ?',
      [customerId]
    );

    if (tokens.length === 0) {
      console.log(`  📩 Notification saved (no push token): [${type}] ${title} → customer ${customerId}`);
      return { saved: true, pushed: false };
    }

    // 3. Send push via Expo Push API
    const messages = tokens.map(t => ({
      to: t.token,
      sound: 'default',
      title,
      body: message,
      data: { type, ...data },
    }));

    // Expo accepts batches of up to 100
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });

    const result = await response.json();

    // Clean up invalid tokens
    if (result.data) {
      for (let i = 0; i < result.data.length; i++) {
        const ticket = result.data[i];
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          await localPool.query('DELETE FROM push_tokens WHERE token = ?', [tokens[i].token]);
          console.log(`  🗑 Removed invalid push token for customer ${customerId}`);
        }
      }
    }

    console.log(`  📲 Push sent: [${type}] ${title} → customer ${customerId} (${tokens.length} device(s))`);
    return { saved: true, pushed: true, devices: tokens.length };
  } catch (err) {
    console.error(`  ✗ Notification error for customer ${customerId}:`, err.message);
    return { saved: false, pushed: false, error: err.message };
  }
}

/**
 * Send notification to multiple customers
 */
async function sendBulkNotification(customerIds, { title, message, type = 'announcement', data = {} }) {
  const results = [];
  for (const customerId of customerIds) {
    const result = await sendNotification(customerId, { title, message, type, data });
    results.push({ customerId, ...result });
  }
  return results;
}

/**
 * Register or update a push token for a user
 */
async function registerPushToken(userId, customerId, token, platform = 'android') {
  try {
    await localPool.query(
      `INSERT INTO push_tokens (user_id, customer_id, token, platform)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         user_id = VALUES(user_id),
         customer_id = VALUES(customer_id),
         platform = VALUES(platform),
         updated_at = NOW()`,
      [userId, customerId, token, platform]
    );
    console.log(`  📱 Push token registered for customer ${customerId} (${platform})`);
    return true;
  } catch (err) {
    console.error('Push token registration error:', err.message);
    return false;
  }
}

module.exports = { sendNotification, sendBulkNotification, registerPushToken };
