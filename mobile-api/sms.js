// ============================================
// TCOM API — SMS Service (AdvantaSMS primary)
// ============================================

const axios = require('axios');

/**
 * Generate a random OTP code
 */
function generateOTP(length = 6) {
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += Math.floor(Math.random() * 10);
  }
  return otp;
}

/**
 * Normalize Kenyan phone number to +254 format
 */
function normalizePhone(phone) {
  let cleaned = phone.replace(/[^\d+]/g, '');

  if (cleaned.startsWith('+')) {
    // already international
  } else if (cleaned.startsWith('254')) {
    cleaned = '+' + cleaned;
  } else if (cleaned.startsWith('0')) {
    cleaned = '+254' + cleaned.slice(1);
  } else {
    cleaned = '+254' + cleaned;
  }

  if (!/^\+254\d{9}$/.test(cleaned)) {
    return { valid: false, formatted: cleaned, error: 'Invalid phone number format. Use 0712345678 or +254712345678' };
  }

  return { valid: true, formatted: cleaned, error: null };
}

/**
 * Build all phone format variations for DB lookup
 */
function phoneFormats(phone) {
  const n = normalizePhone(phone);
  if (!n.valid) return [phone];
  const intl = n.formatted;            // +254712345678
  const noPlus = intl.slice(1);        // 254712345678
  const local = '0' + intl.slice(4);   // 0712345678
  return [intl, noPlus, local, phone]; // include original too
}

/**
 * Format phone to 254XXXXXXXXX (no + prefix) for AdvantaSMS
 */
function formatForAdvanta(phone) {
  const n = normalizePhone(phone);
  if (!n.valid) return phone;
  return n.formatted.replace('+', ''); // 254712345678
}

/**
 * Send SMS via AdvantaSMS API
 */
async function sendSMS(phone, message) {
  const apiKey = process.env.ADVANTA_API_KEY || 'YOUR_ADVANTA_API_KEY';
  const partnerID = process.env.ADVANTA_PARTNER_ID || '3319';
  const shortcode = process.env.ADVANTA_SHORTCODE || 'TONYCOM_NET';
  const apiUrl = process.env.ADVANTA_API_URL || 'https://quicksms.advantasms.com/api/services/sendsms/';

  const mobile = formatForAdvanta(phone);

  try {
    const res = await axios.post(apiUrl, {
      apikey: apiKey,
      partnerID: partnerID,
      message: message,
      shortcode: shortcode,
      mobile: mobile,
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 15000,
    });

    console.log(`[SMS] AdvantaSMS sent to ${mobile}: ${res.status}`, res.data);
    return { success: true, data: res.data };
  } catch (err) {
    console.error(`[SMS] AdvantaSMS failed to ${mobile}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send OTP via SMS
 */
async function sendOTP(phone, otp) {
  const message = `Your TCOM verification code is: ${otp}\n\nThis code will expire in 10 minutes. Do not share this code with anyone.\n\n- TCOM Security`;
  return sendSMS(phone, message);
}

module.exports = { generateOTP, normalizePhone, phoneFormats, sendSMS, sendOTP };
