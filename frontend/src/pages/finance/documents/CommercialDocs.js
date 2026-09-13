import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Col,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Row,
  Spinner,
} from "reactstrap";
import Content from "../../../layout/content/Content";
import Head from "../../../layout/head/Head";
import {
  Block,
  BlockBetween,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Button,
  Icon,
  PreviewCard,
} from "../../../components/Component";
import {
  deleteDocument,
  emptyCommercialDoc,
  emptyLineItem,
  listDocuments,
  saveDocument,
} from "../../../helpers/financeDocumentsApi";
import { exportElementToPdf, exportHtmlToWord } from "../../../helpers/financeDocumentsExport";
import { formatDisplayDate, getCompanyBrand, money } from "../../../helpers/companyBrand";
import "./Documents.css";

const brandAddressText = (html) =>
  String(html || "")
    .replace(/<br\s*\/?>/gi, ", ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

const DocPreview = React.forwardRef(function DocPreview({ doc, brand, title }, ref) {
  const items = doc.items || [];
  const total = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);

  return (
    <article className="fd-sheet" ref={ref}>
      <header className="header">
        <div className="brand">
          <img
            src={brand.logoUrl}
            alt={brand.shortName}
            onError={(e) => {
              e.currentTarget.style.display = "none";
              const fb = e.currentTarget.nextElementSibling;
              if (fb) fb.style.display = "block";
            }}
          />
          <div className="fallback-name" style={{ display: "none" }}>
            {brand.shortName}
          </div>
          <p className="tag">{brand.tagline}</p>
        </div>
        <div className="doc-meta">
          <h1>{title}</h1>
          <p>
            <strong>{doc.type === "invoice" ? "Invoice No:" : "Quote No:"}</strong> {doc.docNo || "—"}
          </p>
          <p>
            <strong>Date:</strong> {formatDisplayDate(doc.date)}
            {doc.type === "quotation" && doc.validDays ? ` · Valid ${doc.validDays} days` : null}
            {doc.type === "invoice" && doc.dueDate ? ` · Due ${formatDisplayDate(doc.dueDate)}` : null}
          </p>
        </div>
      </header>

      <section className="parties">
        <div className="card">
          <h2>From</h2>
          <p className="strong">{brand.shortName}</p>
          <p>Call / WhatsApp: {brand.phone}</p>
          <p>
            Email: {brand.email} · Paybill <strong>{brand.paybill}</strong>
          </p>
          <p>Web: {brand.website}</p>
        </div>
        <div className="card">
          <h2>{doc.type === "invoice" ? "Bill to" : "Quotation for"}</h2>
          <p className="strong">{doc.clientName || "______________________________"}</p>
          <p>
            Phone: {doc.clientPhone || "______________"}
            {doc.clientLocation ? ` · Location: ${doc.clientLocation}` : ""}
          </p>
          {doc.clientEmail ? <p>Email: {doc.clientEmail}</p> : null}
          <p>Subject: {doc.subject || "—"}</p>
        </div>
      </section>

      <table className="lines">
        <thead>
          <tr>
            <th style={{ width: "48%" }}>Item</th>
            <th className="center" style={{ width: "16%" }}>
              Quantity
            </th>
            <th className="num" style={{ width: "18%" }}>
              Unit (KES)
            </th>
            <th className="num" style={{ width: "18%" }}>
              Amount (KES)
            </th>
          </tr>
        </thead>
        <tbody>
          {(items.length ? items : [{ description: "—", qty: "", unitPrice: "" }]).map((it) => {
            const amount = (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
            return (
              <tr key={it.id || `${it.description}-${it.qty}`}>
                <td>{it.description || "—"}</td>
                <td className="center">{it.qty === "" || it.qty == null ? "—" : it.qty}</td>
                <td className="num">{it.unitPrice === "" || it.unitPrice == null ? "—" : money(it.unitPrice)}</td>
                <td className="num">{amount ? money(amount) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="totals">
        <div className="row grand">
          <span>Total</span>
          <span>KES {money(total)}</span>
        </div>
      </div>

      {doc.notes ? (
        <div className="note">
          <strong style={{ color: "#00a651", textTransform: "uppercase", fontSize: "0.7rem", marginRight: 6 }}>
            Note
          </strong>
          {doc.notes}
        </div>
      ) : null}

      {doc.terms ? (
        <div className="terms">
          <h3>Terms</h3>
          <div>{doc.terms}</div>
        </div>
      ) : null}

      <div className="sign">
        <div>
          <div className="line">Prepared by — {brand.shortName}</div>
        </div>
        <div>
          <div className="line">Customer acceptance — Name / Signature / Date</div>
        </div>
      </div>

      <footer className="footer">
        <div>
          <span className="strong">{brand.shortName}</span> · {brand.phone} · {brand.email}
        </div>
        <div style={{ textAlign: "right" }}>Reg. {brand.registration}</div>
      </footer>
    </article>
  );
});

function buildWordHtml(doc, brand, title) {
  const items = doc.items || [];
  const total = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);
  const rows = items
    .map((it) => {
      const amount = (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
      return `<tr>
        <td style="border:1px solid #dadce0;padding:6px">${it.description || ""}</td>
        <td style="border:1px solid #dadce0;padding:6px;text-align:center">${it.qty ?? ""}</td>
        <td style="border:1px solid #dadce0;padding:6px;text-align:right">${money(it.unitPrice)}</td>
        <td style="border:1px solid #dadce0;padding:6px;text-align:right">${money(amount)}</td>
      </tr>`;
    })
    .join("");

  return `
  <div style="font-family:Calibri,Arial,sans-serif;color:#1a1a1a">
    <table width="100%" style="border-bottom:2px solid #1A73E8;margin-bottom:12px">
      <tr>
        <td>
          <div style="font-size:18pt;font-weight:800;color:#1A73E8">${brand.shortName}</div>
          <div style="color:#5f6368;font-size:10pt">${brand.tagline}</div>
        </td>
        <td align="right">
          <div style="font-size:14pt;font-weight:700;color:#1A73E8;text-transform:uppercase">${title}</div>
          <div style="font-size:10pt;color:#5f6368"><b>${doc.type === "invoice" ? "Invoice" : "Quote"} No:</b> ${doc.docNo || ""}</div>
          <div style="font-size:10pt;color:#5f6368"><b>Date:</b> ${formatDisplayDate(doc.date)}</div>
        </td>
      </tr>
    </table>
    <table width="100%" cellspacing="0" cellpadding="8" style="margin-bottom:12px">
      <tr>
        <td width="50%" valign="top" style="background:#f8f9fa;border:1px solid #dadce0">
          <div style="color:#1A73E8;font-size:9pt;text-transform:uppercase;font-weight:700">From</div>
          <div><b>${brand.shortName}</b></div>
          <div>${brand.phone}</div>
          <div>${brand.email} · Paybill ${brand.paybill}</div>
          <div>${brand.website}</div>
          <div>${brandAddressText(brand.addressHtml)}</div>
        </td>
        <td width="50%" valign="top" style="background:#f8f9fa;border:1px solid #dadce0">
          <div style="color:#1A73E8;font-size:9pt;text-transform:uppercase;font-weight:700">${doc.type === "invoice" ? "Bill to" : "Quotation for"}</div>
          <div><b>${doc.clientName || ""}</b></div>
          <div>Phone: ${doc.clientPhone || ""}</div>
          <div>Location: ${doc.clientLocation || ""}</div>
          <div>Subject: ${doc.subject || ""}</div>
        </td>
      </tr>
    </table>
    <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:10px">
      <thead>
        <tr style="background:#1A73E8;color:#fff">
          <th align="left" style="padding:6px">Item</th>
          <th align="center" style="padding:6px">Qty</th>
          <th align="right" style="padding:6px">Unit (KES)</th>
          <th align="right" style="padding:6px">Amount (KES)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="text-align:right;font-weight:800;color:#1A73E8;font-size:12pt">Total: KES ${money(total)}</div>
    ${doc.notes ? `<p><b>Note:</b> ${String(doc.notes).replace(/\n/g, "<br/>")}</p>` : ""}
    ${doc.terms ? `<p><b>Terms</b><br/>${String(doc.terms).replace(/\n/g, "<br/>")}</p>` : ""}
    <p style="margin-top:28px;color:#5f6368;font-size:9pt">${brand.shortName} · ${brand.phone} · ${brand.email}</p>
  </div>`;
}

const CommercialDocs = ({ docType = "quotation" }) => {
  const isInvoice = docType === "invoice";
  const title = isInvoice ? "Invoice" : "Quotation";
  const brand = useMemo(() => getCompanyBrand(), []);
  const sheetRef = useRef(null);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState(() => emptyCommercialDoc(docType));
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listDocuments(docType);
      setRows(res.data || []);
    } catch (e) {
      window.alert(e?.message || "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, [docType]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      [r.docNo, r.clientName, r.clientPhone, r.subject, r.status]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [rows, q]);

  const openNew = () => {
    setDraft(emptyCommercialDoc(docType));
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setDraft({
      ...emptyCommercialDoc(docType),
      ...row,
      items: (row.items || []).map((it) => ({ ...emptyLineItem(), ...it })),
    });
    setModalOpen(true);
  };

  const setField = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));

  const setItem = (idx, key, value) => {
    setDraft((prev) => {
      const items = [...(prev.items || [])];
      items[idx] = { ...items[idx], [key]: value };
      return { ...prev, items };
    });
  };

  const addItem = () => setDraft((prev) => ({ ...prev, items: [...(prev.items || []), emptyLineItem()] }));

  const removeItem = (idx) =>
    setDraft((prev) => ({
      ...prev,
      items: (prev.items || []).filter((_, i) => i !== idx),
    }));

  const handleSave = async () => {
    if (!draft.clientName?.trim()) {
      window.alert("Client name is required.");
      return;
    }
    setSaving(true);
    try {
      await saveDocument(docType, draft);
      setModalOpen(false);
      await load();
    } catch (e) {
      window.alert(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete ${row.docNo}?`)) return;
    await deleteDocument(docType, row.id);
    await load();
  };

  const withPreview = async (row, fn) => {
    setDraft({ ...emptyCommercialDoc(docType), ...row });
    setExporting(true);
    // Allow React to paint the offscreen/preview sheet with latest draft
    await new Promise((r) => setTimeout(r, 80));
    try {
      await fn();
    } finally {
      setExporting(false);
    }
  };

  const downloadPdf = async (row) => {
    await withPreview(row, async () => {
      if (!sheetRef.current) throw new Error("Preview not ready");
      await exportElementToPdf(sheetRef.current, `${row.docNo || title}.pdf`);
    });
  };

  const downloadWord = async (row) => {
    const html = buildWordHtml(row, brand, title);
    exportHtmlToWord(html, `${row.docNo || title}.doc`, `${brand.shortName} ${title}`);
  };

  return (
    <React.Fragment>
      <Head title={isInvoice ? "Document Invoices" : "Quotations"} />
      <Content>
        <div className="fd-page">
          <BlockHead size="sm">
            <BlockBetween className="g-3">
              <BlockHeadContent>
                <div className="text-soft text-uppercase" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em" }}>
                  Finance · Documents
                </div>
                <BlockTitle page tag="h3" className="mb-0 mt-1">
                  {isInvoice ? "Invoices" : "Quotations"}
                </BlockTitle>
                <p className="text-soft mb-0" style={{ fontSize: 13 }}>
                  Create, save, reprint, and export Tonycomm-branded {title.toLowerCase()}s.
                </p>
              </BlockHeadContent>
              <BlockHeadContent>
                <div className="fd-actions">
                  <Button color="primary" onClick={openNew}>
                    <Icon name="plus" />
                    <span>Add {title.toLowerCase()}</span>
                  </Button>
                </div>
              </BlockHeadContent>
            </BlockBetween>
          </BlockHead>

          <Block>
            <div className="fd-hint">
              <Icon name="info" />
              <span>
                Records are stored on this device for now (API stub). PDF uses the Tonycomm quotation layout; Word
                download is also available for editing offline.
              </span>
            </div>

            <PreviewCard>
              <div className="d-flex justify-content-between align-items-center flex-wrap g-2 mb-3">
                <Input
                  type="search"
                  placeholder="Search by number, client, phone…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  style={{ maxWidth: 320 }}
                />
                <Button color="light" outline size="sm" onClick={load} disabled={loading}>
                  <Icon name="reload" />
                  <span>Refresh</span>
                </Button>
              </div>

              <div className="fd-table-wrap">
                {loading ? (
                  <div className="fd-empty">
                    <Spinner size="sm" className="me-2" /> Loading…
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="fd-empty">No {title.toLowerCase()}s yet. Click Add to create one.</div>
                ) : (
                  <table className="fd-table">
                    <thead>
                      <tr>
                        <th>Number</th>
                        <th>Date</th>
                        <th>Client</th>
                        <th>Total (KES)</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <strong>{row.docNo}</strong>
                          </td>
                          <td>{formatDisplayDate(row.date)}</td>
                          <td>
                            <div>{row.clientName}</div>
                            <div className="text-soft" style={{ fontSize: 12 }}>
                              {row.clientPhone}
                            </div>
                          </td>
                          <td>{money(row.total)}</td>
                          <td>
                            <div className="fd-row-actions">
                              <Button size="sm" color="light" outline onClick={() => openEdit(row)}>
                                Edit
                              </Button>
                              <Button size="sm" color="primary" outline disabled={exporting} onClick={() => downloadPdf(row)}>
                                PDF
                              </Button>
                              <Button size="sm" color="secondary" outline onClick={() => downloadWord(row)}>
                                Word
                              </Button>
                              <Button size="sm" color="danger" outline onClick={() => handleDelete(row)}>
                                Delete
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </PreviewCard>
          </Block>

          {/* Hidden render target for PDF capture of last selected draft */}
          <div style={{ position: "fixed", left: -10000, top: 0, width: "210mm" }} aria-hidden>
            <DocPreview ref={sheetRef} doc={draft} brand={brand} title={title} />
          </div>
        </div>
      </Content>

      <Modal isOpen={modalOpen} toggle={() => setModalOpen(false)} size="xl" scrollable className="fd-doc-modal">
        <ModalHeader toggle={() => setModalOpen(false)}>
          {draft.id ? `Edit ${title}` : `New ${title}`}
        </ModalHeader>
        <ModalBody>
          <Row className="g-3">
            <Col md="4">
              <FormGroup>
                <Label>Date</Label>
                <Input type="date" value={draft.date || ""} onChange={(e) => setField("date", e.target.value)} />
              </FormGroup>
            </Col>
            {isInvoice ? (
              <Col md="4">
                <FormGroup>
                  <Label>Due date</Label>
                  <Input
                    type="date"
                    value={draft.dueDate || ""}
                    onChange={(e) => setField("dueDate", e.target.value)}
                  />
                </FormGroup>
              </Col>
            ) : (
              <Col md="4">
                <FormGroup>
                  <Label>Valid (days)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={draft.validDays ?? 14}
                    onChange={(e) => setField("validDays", Number(e.target.value) || 14)}
                  />
                </FormGroup>
              </Col>
            )}
            <Col md="4">
              <FormGroup>
                <Label>Doc number</Label>
                <Input
                  value={draft.docNo || ""}
                  placeholder="Auto on save"
                  onChange={(e) => setField("docNo", e.target.value)}
                />
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Client name *</Label>
                <Input value={draft.clientName || ""} onChange={(e) => setField("clientName", e.target.value)} />
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Client phone</Label>
                <Input value={draft.clientPhone || ""} onChange={(e) => setField("clientPhone", e.target.value)} />
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Location</Label>
                <Input
                  value={draft.clientLocation || ""}
                  onChange={(e) => setField("clientLocation", e.target.value)}
                />
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Client email</Label>
                <Input value={draft.clientEmail || ""} onChange={(e) => setField("clientEmail", e.target.value)} />
              </FormGroup>
            </Col>
            <Col md="12">
              <FormGroup>
                <Label>Subject</Label>
                <Input value={draft.subject || ""} onChange={(e) => setField("subject", e.target.value)} />
              </FormGroup>
            </Col>
          </Row>

          <div className="d-flex justify-content-between align-items-center mt-2 mb-2">
            <strong>Line items</strong>
            <Button size="sm" color="light" outline onClick={addItem}>
              <Icon name="plus" /> Add line
            </Button>
          </div>
          {(draft.items || []).map((it, idx) => (
            <Row className="g-2 mb-2" key={it.id || idx}>
              <Col md="5">
                <Input
                  placeholder="Description"
                  value={it.description || ""}
                  onChange={(e) => setItem(idx, "description", e.target.value)}
                />
              </Col>
              <Col md="2">
                <Input
                  type="number"
                  placeholder="Qty"
                  value={it.qty}
                  onChange={(e) => setItem(idx, "qty", e.target.value)}
                />
              </Col>
              <Col md="3">
                <Input
                  type="number"
                  placeholder="Unit KES"
                  value={it.unitPrice}
                  onChange={(e) => setItem(idx, "unitPrice", e.target.value)}
                />
              </Col>
              <Col md="2" className="fd-line-actions">
                <span className="text-soft" style={{ fontSize: 12 }}>
                  {money((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))}
                </span>
                <Button size="sm" color="light" outline onClick={() => removeItem(idx)}>
                  ×
                </Button>
              </Col>
            </Row>
          ))}

          <FormGroup className="mt-3">
            <Label>Notes</Label>
            <Input
              type="textarea"
              rows={2}
              value={draft.notes || ""}
              onChange={(e) => setField("notes", e.target.value)}
            />
          </FormGroup>
          <FormGroup>
            <Label>Terms</Label>
            <Input
              type="textarea"
              rows={3}
              value={draft.terms || ""}
              onChange={(e) => setField("terms", e.target.value)}
            />
          </FormGroup>

          <div className="fd-exact-preview-label">Document preview (exact A4 layout)</div>
          <div className="fd-exact-preview">
            <DocPreview doc={draft} brand={brand} title={title} />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button color="light" outline onClick={() => setModalOpen(false)}>
            Cancel
          </Button>
          <Button color="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </ModalFooter>
      </Modal>
    </React.Fragment>
  );
};

export const QuotationsPage = () => <CommercialDocs docType="quotation" />;
export const DocInvoicesPage = () => <CommercialDocs docType="invoice" />;
export default CommercialDocs;
