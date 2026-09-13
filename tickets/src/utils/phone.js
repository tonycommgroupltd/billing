/**
 * Normalize Kenyan mobile to local format: 07XXXXXXXX or 01XXXXXXXX.
 * Accepts +254..., 254..., 07..., 7...
 */
export function normalizeKenyanPhone(phone) {
  if (phone == null || String(phone).trim() === "") {
    return "";
  }
  let digits = String(phone).replace(/\D/g, "");
  if (!digits) {
    return String(phone).trim();
  }
  if (digits.startsWith("254") && digits.length >= 12) {
    digits = "0" + digits.slice(3);
  } else if (digits.length === 9 && /^[17]\d{8}$/.test(digits)) {
    digits = "0" + digits;
  }
  if (/^0[17]\d{8}$/.test(digits)) {
    return digits;
  }
  return String(phone).trim();
}

/** Last 9 digits for cross-format comparison. */
export function getKenyanSubscriberDigits(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length > 9 ? digits.slice(-9) : digits;
}

/** True if two numbers refer to the same Kenyan subscriber. */
export function kenyanPhonesMatch(a, b) {
  const sa = getKenyanSubscriberDigits(a);
  const sb = getKenyanSubscriberDigits(b);
  return sa !== "" && sa === sb;
}
