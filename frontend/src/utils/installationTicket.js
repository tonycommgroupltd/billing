/** Append KES price to subject for installation tickets (avoids duplicate suffix). */
export function subjectWithInstallationPrice(subject, price) {
  const base = String(subject || "").trim();
  const amount = Number(price);
  if (!base || !Number.isFinite(amount)) return base;
  const priceTag =
    amount % 1 === 0
      ? `KES ${amount.toLocaleString("en-KE")}`
      : `KES ${amount.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (base.includes(priceTag) || new RegExp(`KES\\s*${amount}`, "i").test(base)) {
    return base;
  }
  return `${base} - ${priceTag}`;
}
