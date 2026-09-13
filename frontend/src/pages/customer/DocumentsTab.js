import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  Col,
  Input,
  InputGroup,
  InputGroupText,
  Row,
  Spinner,
  Table,
} from "reactstrap";
import { Button, Icon } from "../../components/Component";
import { http } from "../../helpers";
import "./documents.css";

const localDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const presetRange = (months) => {
  const to = new Date();
  const from = new Date(to);
  if (months === "all") {
    from.setFullYear(2000, 0, 1);
  } else {
    from.setMonth(from.getMonth() - Number(months));
  }
  return { from: localDate(from), to: localDate(to) };
};

const money = (value) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const displayDate = (value, withTime = false) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return withTime ? date.toLocaleString() : date.toLocaleDateString();
};

const triggerDownload = (data, filename) => {
  const blob = new Blob([data], { type: "application/pdf" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

const StatementMetric = ({ label, value, tone = "default" }) => (
  <div className={`customer-document-metric ${tone}`}>
    <span>{label}</span>
    <strong>{money(value)}</strong>
  </div>
);

const DocumentsTab = ({ customerId, active }) => {
  const initialRange = useMemo(() => presetRange(3), []);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [statement, setStatement] = useState(null);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statementError, setStatementError] = useState("");
  const [statementDownload, setStatementDownload] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [invoiceMeta, setInvoiceMeta] = useState({ page: 1, last_page: 1, total: 0 });
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [appliedInvoiceSearch, setAppliedInvoiceSearch] = useState("");
  const [invoiceFrom, setInvoiceFrom] = useState(initialRange.from);
  const [invoiceTo, setInvoiceTo] = useState(initialRange.to);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState("");
  const [receiptDownload, setReceiptDownload] = useState(null);
  const [mergedInvoiceDownload, setMergedInvoiceDownload] = useState(false);
  const [shareSending, setShareSending] = useState("");
  const [shareSuccess, setShareSuccess] = useState("");
  const mountedRef = useRef(false);
  const statementRequestRef = useRef(null);
  const invoiceRequestRef = useRef(null);
  const downloadRequestRef = useRef(null);
  const initializedRef = useRef(false);

  const loadStatement = useCallback(async (nextFrom = from, nextTo = to) => {
    if (!active || !customerId) return;
    if (!nextFrom || !nextTo || nextFrom > nextTo) {
      setStatementError("Choose a valid date range. The start date cannot be after the end date.");
      return;
    }

    statementRequestRef.current?.cancel("Statement request replaced");
    const request = axios.CancelToken.source();
    statementRequestRef.current = request;
    setStatementLoading(true);
    setStatementError("");

    try {
      const response = await http.get(`/customers/${customerId}/statement`, {
        params: { from: nextFrom, to: nextTo },
        cancelToken: request.token,
      });
      if (!mountedRef.current || statementRequestRef.current !== request) return;
      setStatement(response.data);
    } catch (error) {
      if (axios.isCancel(error) || !mountedRef.current || statementRequestRef.current !== request) return;
      setStatement(null);
      setStatementError(
        error.response?.data?.message ||
        error.response?.data?.error ||
        "The customer statement could not be loaded."
      );
    } finally {
      if (!mountedRef.current || statementRequestRef.current !== request) return;
      statementRequestRef.current = null;
      setStatementLoading(false);
    }
  }, [active, customerId, from, to]);

  const loadInvoices = useCallback(async (page = 1) => {
    if (!active || !customerId) return;
    invoiceRequestRef.current?.cancel("Invoice document request replaced");
    const request = axios.CancelToken.source();
    invoiceRequestRef.current = request;
    setInvoiceLoading(true);
    setInvoiceError("");

    try {
      const response = await http.get(`/customers/${customerId}/documents`, {
        params: {
          page,
          per_page: 15,
          q: appliedInvoiceSearch || undefined,
          from: invoiceFrom,
          to: invoiceTo,
        },
        cancelToken: request.token,
      });
      if (!mountedRef.current || invoiceRequestRef.current !== request) return;
      setInvoices(Array.isArray(response.data?.data) ? response.data.data : []);
      setInvoiceMeta(response.data?.meta || { page, last_page: 1, total: 0 });
    } catch (error) {
      if (axios.isCancel(error) || !mountedRef.current || invoiceRequestRef.current !== request) return;
      setInvoices([]);
      setInvoiceError(error.response?.data?.message || "Invoice receipts could not be loaded.");
    } finally {
      if (!mountedRef.current || invoiceRequestRef.current !== request) return;
      invoiceRequestRef.current = null;
      setInvoiceLoading(false);
    }
  }, [active, appliedInvoiceSearch, customerId, invoiceFrom, invoiceTo]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      statementRequestRef.current?.cancel("Documents tab unmounted");
      invoiceRequestRef.current?.cancel("Documents tab unmounted");
      downloadRequestRef.current?.cancel("Documents tab unmounted");
    };
  }, []);

  useEffect(() => {
    if (!active || initializedRef.current) return;
    initializedRef.current = true;
    loadStatement(initialRange.from, initialRange.to);
  }, [active, initialRange.from, initialRange.to, loadStatement]);

  useEffect(() => {
    if (!active || !initializedRef.current) return;
    loadInvoices(1);
  }, [active, appliedInvoiceSearch, loadInvoices]);

  const applyPreset = (months) => {
    const range = presetRange(months);
    setFrom(range.from);
    setTo(range.to);
    loadStatement(range.from, range.to);
  };

  const applyInvoicePreset = (months) => {
    const range = presetRange(months);
    setInvoiceFrom(range.from);
    setInvoiceTo(range.to);
  };

  const downloadStatement = async () => {
    if (!statement) return;
    downloadRequestRef.current?.cancel("Document download replaced");
    const request = axios.CancelToken.source();
    downloadRequestRef.current = request;
    setStatementDownload(true);
    setStatementError("");
    try {
      const response = await http.get(`/customers/${customerId}/statement/pdf`, {
        params: { from, to },
        responseType: "blob",
        cancelToken: request.token,
        timeout: 60000,
      });
      if (!mountedRef.current || downloadRequestRef.current !== request) return;
      triggerDownload(response.data, `Statement-${customerId}-${from}-${to}.pdf`);
    } catch (error) {
      if (!axios.isCancel(error) && mountedRef.current) {
        setStatementError("The statement PDF could not be generated.");
      }
    } finally {
      if (mountedRef.current && downloadRequestRef.current === request) {
        downloadRequestRef.current = null;
        setStatementDownload(false);
      }
    }
  };

  const downloadInvoiceDocument = async (invoice) => {
    downloadRequestRef.current?.cancel("Document download replaced");
    const request = axios.CancelToken.source();
    downloadRequestRef.current = request;
    setReceiptDownload(invoice.id);
    setInvoiceError("");
    try {
      const response = await http.get(
        invoice.is_paid
          ? `/customers/${customerId}/invoices/${invoice.id}/receipt`
          : `/customers/${customerId}/invoices/${invoice.id}/sales-invoice`,
        {
          responseType: "blob",
          cancelToken: request.token,
          timeout: 60000,
        }
      );
      if (!mountedRef.current || downloadRequestRef.current !== request) return;
      triggerDownload(
        response.data,
        invoice.is_paid ? `Receipt-Invoice-${invoice.id}.pdf` : `Sales-Invoice-${invoice.id}.pdf`
      );
    } catch (error) {
      if (!axios.isCancel(error) && mountedRef.current) {
        setInvoiceError(
          invoice.is_paid
            ? "The paid-invoice receipt could not be generated."
            : "The sales invoice could not be generated."
        );
      }
    } finally {
      if (mountedRef.current && downloadRequestRef.current === request) {
        downloadRequestRef.current = null;
        setReceiptDownload(null);
      }
    }
  };

  const downloadMergedSalesInvoice = async () => {
    downloadRequestRef.current?.cancel("Document download replaced");
    const request = axios.CancelToken.source();
    downloadRequestRef.current = request;
    setMergedInvoiceDownload(true);
    setInvoiceError("");
    try {
      const response = await http.get(`/customers/${customerId}/sales-invoice/pdf`, {
        params: { from: invoiceFrom, to: invoiceTo },
        responseType: "blob",
        cancelToken: request.token,
        timeout: 60000,
      });
      if (!mountedRef.current || downloadRequestRef.current !== request) return;
      triggerDownload(
        response.data,
        `Merged-Sales-Invoice-${customerId}-${invoiceFrom}-${invoiceTo}.pdf`
      );
    } catch (error) {
      if (!axios.isCancel(error) && mountedRef.current) {
        setInvoiceError(
          error.response?.status === 422
            ? "There are no unpaid invoices in the selected period."
            : "The merged sales invoice could not be generated."
        );
      }
    } finally {
      if (mountedRef.current && downloadRequestRef.current === request) {
        downloadRequestRef.current = null;
        setMergedInvoiceDownload(false);
      }
    }
  };

  const shareDocument = async (type, channel, invoiceId = null) => {
    const key = `${type}-${invoiceId || "statement"}-${channel}`;
    setShareSending(key);
    setShareSuccess("");
    if (type === "statement") setStatementError("");
    else setInvoiceError("");

    try {
      const response = await http.post(`/customers/${customerId}/documents/share`, {
        type,
        channel,
        ...(type === "statement" ? { from, to } : { invoice_id: invoiceId }),
      });
      if (!mountedRef.current) return;
      setShareSuccess(response.data?.message || `Document link sent by ${channel}.`);
    } catch (error) {
      if (!mountedRef.current) return;
      const message =
        error.response?.data?.errors?.channel?.[0] ||
        error.response?.data?.message ||
        `The document link could not be sent by ${channel}.`;
      if (type === "statement") setStatementError(message);
      else setInvoiceError(message);
    } finally {
      if (mountedRef.current) setShareSending("");
    }
  };

  const searchInvoices = (event) => {
    event.preventDefault();
    setAppliedInvoiceSearch(invoiceSearch.trim());
  };

  return (
    <div className="customer-documents">
      <div className="customer-documents-heading">
        <div>
          <h5>Customer documents</h5>
          <p>Generate live account statements and official receipts for fully paid invoices.</p>
        </div>
        <span className="customer-documents-live"><i /> Live billing data</span>
      </div>
      {shareSuccess && <Alert color="success">{shareSuccess}</Alert>}

      <Card className="customer-document-card mb-4">
        <CardBody>
          <div className="customer-document-card-head">
            <div className="customer-document-title">
              <span className="customer-document-icon statement"><Icon name="file-docs" /></span>
              <div>
                <h6>Account statement</h6>
                <p>Invoices, payments, and the running account balance.</p>
              </div>
            </div>
            <div className="customer-document-actions">
              <Button color="light" onClick={() => shareDocument("statement", "sms")} disabled={!statement || !!shareSending}>
                {shareSending === "statement-statement-sms" ? <Spinner size="sm" /> : <Icon name="msg" />}<span>Send SMS</span>
              </Button>
              <Button color="light" onClick={() => shareDocument("statement", "email")} disabled={!statement || !!shareSending}>
                {shareSending === "statement-statement-email" ? <Spinner size="sm" /> : <Icon name="mail" />}<span>Send email</span>
              </Button>
              <Button color="primary" onClick={downloadStatement} disabled={!statement || statementDownload}>
                {statementDownload ? <Spinner size="sm" className="me-1" /> : <Icon name="download" />}
                <span>Download PDF</span>
              </Button>
            </div>
          </div>

          <div className="customer-statement-controls">
            <div className="customer-statement-presets">
              <span>Quick period</span>
              <Button size="sm" color="light" onClick={() => applyPreset(3)}>3 months</Button>
              <Button size="sm" color="light" onClick={() => applyPreset(6)}>6 months</Button>
              <Button size="sm" color="light" onClick={() => applyPreset(12)}>12 months</Button>
              <Button size="sm" color="light" onClick={() => applyPreset("all")}>All time</Button>
            </div>
            <div className="customer-statement-dates">
              <div><label>From</label><Input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></div>
              <div><label>To</label><Input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} /></div>
              <Button color="dark" outline onClick={() => loadStatement()} disabled={statementLoading}>
                {statementLoading ? <Spinner size="sm" /> : "Apply"}
              </Button>
            </div>
          </div>

          {statementError && <Alert color="danger" className="mt-3 mb-0">{statementError}</Alert>}

          {statementLoading && !statement ? (
            <div className="customer-document-loading"><Spinner color="primary" /><span>Preparing statement...</span></div>
          ) : statement ? (
            <>
              <Row className="g-3 mt-1">
                <Col sm="6" xl="3"><StatementMetric label="Opening balance" value={statement.opening_balance} /></Col>
                <Col sm="6" xl="3"><StatementMetric label="Invoices" value={statement.totals?.debits} tone="debit" /></Col>
                <Col sm="6" xl="3"><StatementMetric label="Payments" value={statement.totals?.credits} tone="credit" /></Col>
                <Col sm="6" xl="3"><StatementMetric label="Closing balance" value={statement.closing_balance} tone="balance" /></Col>
              </Row>

              <div className="customer-statement-meta">
                <span><strong>{statement.statement_id}</strong></span>
                <span>{displayDate(statement.period?.from)} – {displayDate(statement.period?.to)}</span>
                <span>{statement.transactions?.length || 0} transactions</span>
              </div>

              <div className="table-responsive customer-document-table-wrap">
                <Table hover className="customer-document-table mb-0">
                  <thead>
                    <tr><th>Date</th><th>Description</th><th>Reference</th><th className="text-end">Debit</th><th className="text-end">Credit</th><th className="text-end">Balance</th></tr>
                  </thead>
                  <tbody>
                    {!statement.transactions?.length ? (
                      <tr><td colSpan="6" className="text-center text-soft py-4">No transactions in this statement period.</td></tr>
                    ) : statement.transactions.slice(-50).map((transaction, index) => (
                      <tr key={`${transaction.reference}-${index}`}>
                        <td>{displayDate(transaction.date)}</td>
                        <td>{transaction.description}</td>
                        <td><code>{transaction.reference}</code></td>
                        <td className="text-end">{transaction.debit ? money(transaction.debit) : "—"}</td>
                        <td className="text-end text-success">{transaction.credit ? money(transaction.credit) : "—"}</td>
                        <td className="text-end fw-bold">{money(transaction.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
              {(statement.transactions?.length || 0) > 50 && (
                <div className="text-soft small mt-2">Showing the latest 50 transactions. The PDF contains the full statement.</div>
              )}
            </>
          ) : null}
        </CardBody>
      </Card>

      <Card className="customer-document-card">
        <CardBody>
          <div className="customer-document-card-head">
            <div className="customer-document-title">
              <span className="customer-document-icon receipt"><Icon name="receipt" /></span>
              <div>
                <h6>Invoices and receipts</h6>
                <p>Download unpaid sales invoices, paid receipts, or merge outstanding invoices by period.</p>
              </div>
            </div>
            <div className="customer-document-actions">
              <Badge color="light" pill>{invoiceMeta.total || 0} invoices</Badge>
              <Button color="primary" onClick={downloadMergedSalesInvoice} disabled={mergedInvoiceDownload || invoiceLoading}>
                {mergedInvoiceDownload ? <Spinner size="sm" className="me-1" /> : <Icon name="files" />}
                <span>Download merged sales invoice</span>
              </Button>
            </div>
          </div>

          <div className="customer-statement-controls">
            <div className="customer-statement-presets">
              <span>Quick period</span>
              <Button size="sm" color="light" onClick={() => applyInvoicePreset(3)}>3 months</Button>
              <Button size="sm" color="light" onClick={() => applyInvoicePreset(6)}>6 months</Button>
              <Button size="sm" color="light" onClick={() => applyInvoicePreset(12)}>12 months</Button>
              <Button size="sm" color="light" onClick={() => applyInvoicePreset("all")}>All time</Button>
            </div>
            <div className="customer-statement-dates">
              <div><label>From</label><Input type="date" value={invoiceFrom} max={invoiceTo} onChange={(event) => setInvoiceFrom(event.target.value)} /></div>
              <div><label>To</label><Input type="date" value={invoiceTo} min={invoiceFrom} onChange={(event) => setInvoiceTo(event.target.value)} /></div>
              <Button color="dark" outline onClick={() => loadInvoices(1)} disabled={invoiceLoading}>
                {invoiceLoading ? <Spinner size="sm" /> : "Apply"}
              </Button>
            </div>
          </div>

          <form onSubmit={searchInvoices} className="customer-receipt-search">
            <InputGroup>
              <InputGroupText><Icon name="search" /></InputGroupText>
              <Input value={invoiceSearch} onChange={(event) => setInvoiceSearch(event.target.value)} placeholder="Search invoice ID, service, or plan" />
              <Button type="submit" color="primary">Search</Button>
            </InputGroup>
          </form>

          {invoiceError && <Alert color="danger" className="mt-3 mb-0">{invoiceError}</Alert>}

          <div className="table-responsive customer-document-table-wrap mt-3">
            <Table hover className="customer-document-table align-middle mb-0">
              <thead>
                <tr><th>Invoice</th><th>Service</th><th>Invoice date</th><th className="text-end">Total</th><th className="text-end">Paid</th><th>Status</th><th className="text-end">Document</th></tr>
              </thead>
              <tbody>
                {invoiceLoading && !invoices.length ? (
                  <tr><td colSpan="7" className="text-center py-5"><Spinner size="sm" color="primary" className="me-2" />Loading invoices...</td></tr>
                ) : !invoices.length ? (
                  <tr><td colSpan="7" className="text-center text-soft py-5">No invoices matched this search.</td></tr>
                ) : invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td><strong>#{invoice.id}</strong><small className="d-block text-soft">{invoice.plan || "Internet service"}</small></td>
                    <td>{invoice.service || "—"}</td>
                    <td>{displayDate(invoice.invoice_date)}</td>
                    <td className="text-end fw-semibold">{money(invoice.total)}</td>
                    <td className="text-end">{money(invoice.paid_amount)}</td>
                    <td>
                      <Badge color={invoice.is_paid ? "success" : Number(invoice.paid_amount) > 0 ? "warning" : "danger"} pill>
                        {invoice.is_paid ? "Paid" : Number(invoice.paid_amount) > 0 ? "Part paid" : "Unpaid"}
                      </Badge>
                    </td>
                    <td className="text-end">
                      <div className="customer-receipt-actions">
                      <Button
                        size="sm"
                        color="light"
                        disabled={!invoice.is_paid || !!shareSending}
                        onClick={() => shareDocument("receipt", "sms", invoice.id)}
                        title="Send secure receipt link by SMS"
                      >
                        {shareSending === `receipt-${invoice.id}-sms` ? <Spinner size="sm" /> : <><Icon name="msg" /><span>SMS</span></>}
                      </Button>
                      <Button
                        size="sm"
                        color="light"
                        disabled={!invoice.is_paid || !!shareSending}
                        onClick={() => shareDocument("receipt", "email", invoice.id)}
                        title="Send secure receipt link by email"
                      >
                        {shareSending === `receipt-${invoice.id}-email` ? <Spinner size="sm" /> : <><Icon name="mail" /><span>Email</span></>}
                      </Button>
                      <Button
                        size="sm"
                        color={invoice.is_paid ? "primary" : "light"}
                        outline
                        disabled={receiptDownload === invoice.id}
                        onClick={() => downloadInvoiceDocument(invoice)}
                        title={invoice.is_paid ? "Download consolidated receipt" : "Download unpaid sales invoice"}
                      >
                        {receiptDownload === invoice.id ? (
                          <Spinner size="sm" />
                        ) : (
                          <><Icon name="download" /><span>{invoice.is_paid ? "Receipt" : "Sales invoice"}</span></>
                        )}
                      </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>

          <div className="customer-document-pagination">
            <Button color="light" disabled={invoiceLoading || Number(invoiceMeta.page) <= 1} onClick={() => loadInvoices(Number(invoiceMeta.page) - 1)}>Previous</Button>
            <span>Page {invoiceMeta.page || 1} of {invoiceMeta.last_page || 1}</span>
            <Button color="light" disabled={invoiceLoading || Number(invoiceMeta.page) >= Number(invoiceMeta.last_page)} onClick={() => loadInvoices(Number(invoiceMeta.page) + 1)}>Next</Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};

export default DocumentsTab;
