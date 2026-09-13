// ============================================
// TCOM API — M-Pesa Daraja STK Push Service
// ============================================
// Handles: OAuth token, STK push initiation, query
// Uses LIVE Safaricom Daraja API
// ============================================

const axios = require('axios');

const BASE_URL = process.env.MPESA_ENV === 'live'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

const CONSUMER_KEY    = process.env.MPESA_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET;
const SHORTCODE       = process.env.MPESA_SHORTCODE;
const PASSKEY         = process.env.MPESA_PASSKEY;
const CALLBACK_URL    = process.env.MPESA_CALLBACK_URL;

// Cache token for reuse (expires ~1hr)
let tokenCache = { token: null, expiresAt: 0 };

/**
 * Get OAuth access token from Daraja
 */
async function getAccessToken() {
  // Return cached token if still valid (with 60s buffer)
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60000) {
    return tokenCache.token;
  }

  const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');

  const { data } = await axios.get(
    `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` } }
  );

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (parseInt(data.expires_in) * 1000),
  };

  return data.access_token;
}

/**
 * Generate STK Push password (Base64 of shortcode + passkey + timestamp)
 */
function generatePassword(timestamp) {
  return Buffer.from(`${SHORTCODE}${PASSKEY}${timestamp}`).toString('base64');
}

/**
 * Get formatted timestamp (YYYYMMDDHHmmss)
 */
function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/**
 * Initiate STK Push to customer's phone
 * @param {string} phone — 2547XXXXXXXX format
 * @param {number} amount — Integer amount in KES
 * @param {string} accountRef — Account reference (e.g. "TCOM-UPG-123")
 * @param {string} description — Transaction description
 * @returns {Object} { success, CheckoutRequestID, MerchantRequestID, ... }
 */
async function initiateSTKPush(phone, amount, accountRef, description) {
  const token = await getAccessToken();
  const timestamp = getTimestamp();
  const password = generatePassword(timestamp);

  // Normalize phone: 07xxx → 2547xxx, +254 → 254
  let formattedPhone = String(phone).replace(/\s+/g, '');
  if (formattedPhone.startsWith('+')) formattedPhone = formattedPhone.substring(1);
  if (formattedPhone.startsWith('0')) formattedPhone = '254' + formattedPhone.substring(1);

  const payload = {
    BusinessShortCode: SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Math.ceil(amount), // Must be integer
    PartyA: formattedPhone,
    PartyB: SHORTCODE,
    PhoneNumber: formattedPhone,
    CallBackURL: CALLBACK_URL,
    AccountReference: accountRef || 'TCOM',
    TransactionDesc: description || 'Plan Upgrade Payment',
  };

  const { data } = await axios.post(
    `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (data.ResponseCode === '0') {
    return {
      success: true,
      checkoutRequestId: data.CheckoutRequestID,
      merchantRequestId: data.MerchantRequestID,
      responseDescription: data.ResponseDescription,
    };
  } else {
    return {
      success: false,
      error: data.ResponseDescription || data.errorMessage || 'STK Push failed',
    };
  }
}

/**
 * Query STK Push status (poll for result)
 * @param {string} checkoutRequestId
 */
async function querySTKStatus(checkoutRequestId) {
  const token = await getAccessToken();
  const timestamp = getTimestamp();
  const password = generatePassword(timestamp);

  const { data } = await axios.post(
    `${BASE_URL}/mpesa/stkpushquery/v1/query`,
    {
      BusinessShortCode: SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  // ResultCode: 0 = success, 1032 = cancelled, 1037 = timeout
  const resultCode = parseInt(data.ResultCode);

  if (resultCode === 0) {
    return { status: 'completed', resultDesc: data.ResultDesc };
  } else if (resultCode === 1032) {
    return { status: 'cancelled', resultDesc: 'Transaction cancelled by user' };
  } else if (resultCode === 1037) {
    return { status: 'timeout', resultDesc: 'Transaction timed out' };
  } else if (data.errorCode === '500.001.1001' || data.errorCode === '500.001.1002') {
    // Transaction still in progress / being processed
    return { status: 'pending', resultDesc: 'Transaction is being processed' };
  } else if (!data.ResultCode && data.ResultCode !== 0) {
    // No ResultCode yet — still processing
    return { status: 'pending', resultDesc: 'Waiting for payment confirmation' };
  } else {
    return { status: 'failed', resultDesc: data.ResultDesc || data.errorMessage || 'Unknown error' };
  }
}

module.exports = { initiateSTKPush, querySTKStatus, getAccessToken };
