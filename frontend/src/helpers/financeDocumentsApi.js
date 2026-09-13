/**
 * Finance documents API stub (localStorage).
 * Swap implementations later for Laravel Contabo endpoints.
 */

const KEYS = {
  quotation: "tonycomm.finance.documents.quotations.v1",
  invoice: "tonycomm.finance.documents.invoices.v1",
};

function readAll(type) {
  try {
    const raw = window.localStorage.getItem(KEYS[type]);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeAll(type, list) {
  window.localStorage.setItem(KEYS[type], JSON.stringify(list));
  return list;
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function nextDocNo(type, list) {
  const prefix = type === "invoice" ? "INV" : "QT";
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const sameDay = list.filter((x) => String(x.docNo || "").includes(stamp)).length + 1;
  return `${prefix}-${stamp}-${String(sameDay).padStart(3, "0")}`;
}

export function emptyLineItem() {
  return { id: uid(), description: "", qty: 1, unitPrice: 0 };
}

export function emptyCommercialDoc(type = "quotation") {
  return {
    id: null,
    type,
    docNo: "",
    date: new Date().toISOString().slice(0, 10),
    validDays: type === "quotation" ? 14 : null,
    dueDate: type === "invoice" ? "" : null,
    clientName: "",
    clientPhone: "",
    clientLocation: "",
    clientEmail: "",
    subject: type === "quotation" ? "Quotation" : "Tax Invoice",
    items: [
      emptyLineItem(),
      emptyLineItem(),
    ],
    notes: "",
    terms:
      type === "quotation"
        ? "Prices in KES. Quotation valid for the stated number of days.\nPayment via M-Pesa Paybill 4129711 or as advised by Tonycomm."
        : "Payment due on or before the due date.\nPayment via M-Pesa Paybill 4129711 or as advised by Tonycomm.",
    status: "issued",
    createdAt: null,
    updatedAt: null,
  };
}

function calcTotals(items = []) {
  const rows = (items || []).map((it) => {
    const qty = Number(it.qty) || 0;
    const unitPrice = Number(it.unitPrice) || 0;
    return { ...it, amount: qty * unitPrice };
  });
  const subtotal = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  return { items: rows, subtotal, total: subtotal };
}

export async function listDocuments(type) {
  const list = readAll(type).slice().sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return { data: list };
}

export async function getDocument(type, id) {
  const found = readAll(type).find((x) => String(x.id) === String(id));
  if (!found) throw new Error("Document not found");
  return { data: found };
}

export async function saveDocument(type, payload) {
  const list = readAll(type);
  const now = new Date().toISOString();
  const totals = calcTotals(payload.items);
  let row;

  if (payload.id) {
    const idx = list.findIndex((x) => String(x.id) === String(payload.id));
    if (idx < 0) throw new Error("Document not found");
    row = {
      ...list[idx],
      ...payload,
      type,
      items: totals.items,
      subtotal: totals.subtotal,
      total: totals.total,
      updatedAt: now,
    };
    list[idx] = row;
  } else {
    row = {
      ...emptyCommercialDoc(type),
      ...payload,
      id: uid(),
      type,
      docNo: payload.docNo || nextDocNo(type, list),
      items: totals.items,
      subtotal: totals.subtotal,
      total: totals.total,
      createdAt: now,
      updatedAt: now,
    };
    list.unshift(row);
  }

  writeAll(type, list);
  return { data: row };
}

export async function deleteDocument(type, id) {
  const list = readAll(type).filter((x) => String(x.id) !== String(id));
  writeAll(type, list);
  return { ok: true };
}

export default {
  listDocuments,
  getDocument,
  saveDocument,
  deleteDocument,
  emptyCommercialDoc,
  emptyLineItem,
};
