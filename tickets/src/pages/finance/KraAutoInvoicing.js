import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import {
  Block,
  BlockBetween,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Button,
  Icon,
  Row,
  Col,
} from "../../components/Component";
import { Alert, Badge, Card, Input, Spinner, Table } from "reactstrap";
import KraAPI from "../../helpers/KraAPI";
import KraReceipt, { normalizeKraReceipt } from "../../components/kra/KraReceipt";

const KraAutoInvoicing = () => {
  const [status, setStatus] = useState(null);
  const [pending, setPending] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [previewReceipt, setPreviewReceipt] = useState(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customers, setCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [pinDrafts, setPinDrafts] = useState({});

  const loadCustomers = useCallback(async (q = customerSearch) => {
    try {
      setLoadingCustomers(true);
      const res = await KraAPI.getAutoCustomers(q);
      const list = res?.customers || [];
      setCustomers(list);
      const drafts = {};
      list.forEach((c) => {
        drafts[c.customer_id] = c.kra_pin || "";
      });
      setPinDrafts(drafts);
    } catch (e) {
      setError(e.response?.data?.error || "Failed to load Splynx customers");
    } finally {
      setLoadingCustomers(false);
    }
  }, [customerSearch]);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [st, pend, rec] = await Promise.all([
        KraAPI.getAutoStatus(),
        KraAPI.getAutoPending(),
        KraAPI.getAutoReceipts(),
      ]);
      setStatus(st);
      setPending(pend?.pending || []);
      setReceipts(rec?.receipts || []);
    } catch (e) {
      setError(e.response?.data?.error || e.message || "Failed to load auto invoicing data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
    loadCustomers("");
  }, [loadAll, loadCustomers]);

  const handleSavePin = async (customerId) => {
    try {
      setProcessing(true);
      setError("");
      const kraPin = (pinDrafts[customerId] || "").trim().toUpperCase();
      await KraAPI.setCustomerKraPin(customerId, kraPin);
      setSuccess(kraPin ? `KRA PIN saved for customer #${customerId}` : `Customer #${customerId} set as walk-in`);
      await Promise.all([loadCustomers(), loadAll()]);
      setTimeout(() => setSuccess(""), 3500);
    } catch (e) {
      setError(e.response?.data?.error || "Failed to save KRA PIN");
    } finally {
      setProcessing(false);
    }
  };

  const handleProcess = async () => {
    try {
      setProcessing(true);
      setError("");
      const res = await KraAPI.processAutoQueue();
      setSuccess(`Processed ${res.processed || 0} payment(s)`);
      await loadAll();
      setTimeout(() => setSuccess(""), 4000);
    } catch (e) {
      setError(e.response?.data?.error || "Process queue failed");
    } finally {
      setProcessing(false);
    }
  };

  const handleInvoiceOne = async (paymentId) => {
    try {
      setProcessing(true);
      setError("");
      const res = await KraAPI.invoicePayment(paymentId);
      if (res.success) {
        setSuccess(res.skipped ? "Already invoiced" : `Invoice ${res.traderInvoiceNo || "created"}`);
        await loadAll();
      } else {
        setError(res.error || "Invoice failed");
      }
    } catch (e) {
      setError(e.response?.data?.error || "Invoice failed");
    } finally {
      setProcessing(false);
    }
  };

  const openReceiptPreview = (row) => {
    setPreviewReceipt(normalizeKraReceipt({
      traderInvoiceNo: row.trader_invoice_no,
      scuReceiptNo: row.scu_receipt_no,
      totalAmount: row.amount,
      customerName: row.customer_name,
      customerPin: row.customer_pin,
      paymentType: "06",
      status: row.status,
    }, {
      customerPhone: row.phone,
      transId: row.trans_id,
      walkIn: !!row.walk_in,
      verificationUrl: row.verification_url,
      signature: row.signature,
      amount: row.amount,
    }));
  };

  return (
    <React.Fragment>
      <Head title="KRA Auto Invoicing" />
      <Content>
        <BlockHead size="sm">
          <BlockBetween className="g-3 align-items-center">
            <BlockHeadContent>
              <BlockTitle page>KRA Auto Invoicing</BlockTitle>
              <p className="text-soft mb-0">
                Splynx payments → eTIMS invoice → stored receipt (PIN + walk-in mixed).
              </p>
            </BlockHeadContent>
            <BlockHeadContent>
              <div className="d-flex flex-wrap gap-2">
                <Link to={`${process.env.PUBLIC_URL}/admin/finance/kra-receipt-preview`}>
                  <Button color="light" outline>
                    <Icon name="file-text" className="me-1" /> Sample receipt
                  </Button>
                </Link>
                <Button color="primary" onClick={handleProcess} disabled={processing || loading}>
                  {processing ? <Spinner size="sm" className="me-1" /> : <Icon name="play" className="me-1" />}
                  Run queue now
                </Button>
              </div>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>

        {error && <Alert color="danger">{error}</Alert>}
        {success && <Alert color="success">{success}</Alert>}

        <Alert color="light" className="mb-3 border">
          <strong>How customers are added:</strong> All customers come from the <strong>Splynx / Tonycomm database</strong> automatically.
          Search below, then either enter a <strong>KRA PIN</strong> (registered buyer) or leave PIN blank and save for <strong>walk-in</strong> consumer receipts.
          When they pay, auto-invoicing picks the right type — no need to mix them manually at invoice time.
        </Alert>

        {loading ? (
          <div className="text-center py-5"><Spinner color="primary" /></div>
        ) : (
          <Row className="g-gs">
            <Col md="4">
              <Card className="card-bordered">
                <div className="card-inner">
                  <h6 className="title mb-3">Status</h6>
                  <div className="d-flex flex-wrap gap-2 mb-2">
                    <Badge color={status?.enabled ? "success" : "secondary"}>
                      {status?.enabled ? "Automatic ON" : "Automatic OFF"}
                    </Badge>
                    <Badge color="info">{status?.lookbackHours || 72}h lookback</Badge>
                  </div>
                  <p className="text-soft small mb-1">
                    Sent: <strong>{status?.counts?.sent || 0}</strong>
                    {" · "}Failed: <strong>{status?.counts?.failed || 0}</strong>
                  </p>
                  <p className="text-soft small">
                    Pending payments: <strong>{pending.length}</strong>
                  </p>
                </div>
              </Card>
            </Col>

            <Col md="8">
              <Card className="card-bordered">
                <div className="card-inner">
                  <h6 className="title mb-3">Pending payments (not yet invoiced)</h6>
                  {pending.length === 0 ? (
                    <p className="text-soft mb-0">No pending payments in the lookback window.</p>
                  ) : (
                    <div className="table-responsive">
                      <Table size="sm" className="mb-0">
                        <thead>
                          <tr>
                            <th>Customer</th>
                            <th>Phone</th>
                            <th>KRA PIN</th>
                            <th>Amount</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {pending.map((p) => (
                            <tr key={p.payment_id}>
                              <td>{p.name}</td>
                              <td>{p.phone_number}</td>
                              <td>
                                {p.kra_pin ? (
                                  <Badge color="success">{p.kra_pin}</Badge>
                                ) : (
                                  <Badge color="warning">Walk-in</Badge>
                                )}
                              </td>
                              <td>KES {Number(p.sum).toLocaleString()}</td>
                              <td>
                                <Button
                                  size="sm"
                                  color="primary"
                                  outline
                                  disabled={processing}
                                  onClick={() => handleInvoiceOne(p.payment_id)}
                                >
                                  Invoice
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  )}
                </div>
              </Card>
            </Col>

            <Col lg="12">
              <Card className="card-bordered">
                <div className="card-inner">
                  <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                    <div>
                      <h6 className="title mb-1">Splynx customers — KRA registry</h6>
                      <p className="text-soft small mb-0">Set KRA PIN or walk-in before payments are auto-invoiced.</p>
                    </div>
                    <div className="d-flex gap-2" style={{ minWidth: 280 }}>
                      <Input
                        bsSize="sm"
                        placeholder="Search name, phone, or ID"
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && loadCustomers(customerSearch)}
                      />
                      <Button size="sm" color="primary" outline onClick={() => loadCustomers(customerSearch)} disabled={loadingCustomers}>
                        Search
                      </Button>
                    </div>
                  </div>
                  {loadingCustomers ? (
                    <div className="text-center py-3"><Spinner size="sm" color="primary" /></div>
                  ) : customers.length === 0 ? (
                    <p className="text-soft mb-0">No customers found. Try a different search.</p>
                  ) : (
                    <div className="table-responsive">
                      <Table size="sm" className="mb-0">
                        <thead>
                          <tr>
                            <th>Customer</th>
                            <th>Phone</th>
                            <th>KRA PIN (optional)</th>
                            <th>Type</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {customers.map((c) => {
                            const draft = pinDrafts[c.customer_id] ?? "";
                            const isWalkIn = !draft.trim();
                            return (
                              <tr key={c.customer_id}>
                                <td>
                                  <Link to={`${process.env.PUBLIC_URL}/admin/customers/view/${c.customer_id}`}>
                                    {c.name}
                                  </Link>
                                </td>
                                <td>{c.phone_number}</td>
                                <td style={{ minWidth: 180 }}>
                                  <Input
                                    bsSize="sm"
                                    placeholder="P051234567X or leave blank"
                                    value={draft}
                                    onChange={(e) => setPinDrafts((prev) => ({
                                      ...prev,
                                      [c.customer_id]: e.target.value.toUpperCase(),
                                    }))}
                                  />
                                </td>
                                <td>
                                  {isWalkIn ? (
                                    <Badge color="warning">Walk-in</Badge>
                                  ) : (
                                    <Badge color="success">KRA registered</Badge>
                                  )}
                                </td>
                                <td>
                                  <Button
                                    size="sm"
                                    color="primary"
                                    outline
                                    disabled={processing}
                                    onClick={() => handleSavePin(c.customer_id)}
                                  >
                                    Save
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </Table>
                    </div>
                  )}
                </div>
              </Card>
            </Col>

            <Col lg="12">
              <Card className="card-bordered">
                <div className="card-inner">
                  <h6 className="title mb-3">Recent receipts</h6>
                  {receipts.length === 0 ? (
                    <p className="text-soft mb-0">No receipts stored yet.</p>
                  ) : (
                    <div className="table-responsive">
                      <Table size="sm" className="mb-0">
                        <thead>
                          <tr>
                            <th>Invoice</th>
                            <th>Customer</th>
                            <th>Phone</th>
                            <th>Type</th>
                            <th>Amount</th>
                            <th>Status</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {receipts.map((r) => (
                            <tr key={r.id}>
                              <td><code>{r.trader_invoice_no || "—"}</code></td>
                              <td>{r.customer_name || "—"}</td>
                              <td>{r.phone}</td>
                              <td>{r.walk_in ? "Walk-in" : r.customer_pin || "PIN"}</td>
                              <td>KES {Number(r.amount).toLocaleString()}</td>
                              <td>
                                <Badge color={r.status === "sent" ? "success" : "danger"}>{r.status}</Badge>
                              </td>
                              <td>
                                <Button size="sm" color="light" onClick={() => openReceiptPreview(r)}>
                                  View
                                </Button>
                                {r.trader_invoice_no && (
                                  <Link
                                    className="btn btn-sm btn-outline-primary ms-1"
                                    to={`${process.env.PUBLIC_URL}/admin/finance/kra-invoices/${encodeURIComponent(r.trader_invoice_no)}`}
                                  >
                                    Open
                                  </Link>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  )}
                </div>
              </Card>
            </Col>

            {previewReceipt && (
              <Col lg="12">
                <Card className="card-bordered">
                  <div className="card-inner">
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <h6 className="title mb-0">Receipt preview</h6>
                      <Button size="sm" color="light" onClick={() => setPreviewReceipt(null)}>Close</Button>
                    </div>
                    <KraReceipt receipt={previewReceipt} />
                  </div>
                </Card>
              </Col>
            )}
          </Row>
        )}
      </Content>
    </React.Fragment>
  );
};

export default KraAutoInvoicing;
