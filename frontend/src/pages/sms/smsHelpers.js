import React from "react";
import { count } from "sms-length";

/** Appended to many gateway messages for STOP instructions (matches View.js). */
export const SMS_STOP_SUFFIX = " STOP *456*9*5#";

export function smsCounter(message) {
  try {
    return count((message || "") + SMS_STOP_SUFFIX);
  } catch {
    const len = (message || "").length;
    return { length: len, messages: Math.max(1, Math.ceil(len / 160)), characterPerMessage: 160, remaining: 160 - (len % 160 || 160) };
  }
}

export function SmsCharMeter({ message }) {
  const c = smsCounter(message);
  return (
    <div className="text-soft mt-1" style={{ fontSize: 12 }}>
      {c.length} chars · {c.messages} SMS page{c.messages === 1 ? "" : "s"} · {c.remaining} remaining in this page
      <span className="ms-1">(incl. STOP suffix)</span>
    </div>
  );
}
