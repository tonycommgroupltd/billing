import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
import { Alert, Badge, Card, Spinner, Table } from "reactstrap";
import KraAPI, { resolveInvoiceVerificationUrl } from "../../helpers/KraAPI";
import KraReceipt, { normalizeKraReceipt } from "../../components/kra/KraReceipt";

const fmtCurrency = (value) => {
  const n = Number(value || 0);
  return `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtDateTime = (value) => {
  if (!value) return "-";
  const compactDate = String(value || "");
  if (/^\d{8}$/.test(compactDate)) {
    const year = compactDate.slice(0, 4);
    const month = compactDate.slice(4, 6);
    const day = compactDate.slice(6, 8);
    return `${day}/${month}/${year}`;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-KE");
};

const prettyJson = (value) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch (err) {
    return String(value);
  }
};

const pickArray = (payload, keys) => {
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) {
      return payload[key];
    }
  }
  return [];
};

const KraInvoiceBrowser = () => {
  const { traderInvoiceNo } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [invoiceData, setInvoiceData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const apiConfig = useMemo(() => {
    const authHeader = window.localStorage.getItem("kra_etims_auth_header") || "";
    return authHeader.trim();
  }, []);

  const verificationUrl = useMemo(
    () => resolveInvoiceVerificationUrl(invoiceData),
    [invoiceData]
  );

  const loadInvoice = async (isRefresh = false) => {
    if (!traderInvoiceNo) {
      setError("Missing trader invoice number");
      setLoading(false);
      return;
    }

    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError("");
      const res = await KraAPI.getInvoice(traderInvoiceNo, apiConfig);
      setInvoiceData(res.data);
    } catch (err) {
      setInvoiceData(null);
      setError(err.response?.data?.error || "Failed to load invoice in browser view");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadInvoice(false);
  }, [traderInvoiceNo, apiConfig]);

  const invoice = invoiceData?.data && !Array.isArray(invoiceData.data) ? invoiceData.data : invoiceData;
  const items = pickArray(invoice, ["salesItems", "items", "invoiceItems", "lines"]);
  const customerName = invoice?.customerName || invoice?.buyerName || invoice?.customer?.name || "-";
  const customerPin = invoice?.customerPin || invoice?.buyerPin || invoice?.customer?.pin || "-";
  const totalAmount = invoice?.totalAmount || invoice?.amount || invoice?.total || 0;
  const taxAmount = invoice?.taxAmount || invoice?.tax || 0;
  const taxableAmount = invoice?.taxableAmount || 0;
  const status = invoice?.status || invoiceData?.statusCode || "-";
  const salesDate = invoice?.salesDate || invoice?.invoiceDate || invoice?.createdAt || null;
  const receiptTypeCode = invoice?.receiptTypeCode || "-";
  const paymentType = invoice?.paymentType || "-";
  const salesTypeCode = invoice?.salesTypeCode || "-";
  const currency = invoice?.currency || invoice?.currencyCode || "KES";

  return (
    <React.Fragment>
      <Head title="KRA Invoice Browser" />
      <Content>
        <BlockHead size="sm">
          <BlockBetween className="g-3 align-items-center">
            <BlockHeadContent>
              <BlockTitle page>KRA Invoice Browser</BlockTitle>
              <p className="text-soft mb-0">Browser-friendly view for invoice {traderInvoiceNo || "-"}.</p>
            </BlockHeadContent>
            <BlockHeadContent>
              <Link to={`${process.env.PUBLIC_URL}/admin/finance/kra-operations`}>
                <Button color="light" outline>
                  <Icon name="arrow-left" className="me-1" /> Back to KRA Operations
                </Button>
              </Link>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>

        {error && <Alert color="danger">{error}</Alert>}

        {loading ? (
          <div className="text-center py-5"><Spinner color="primary" /></div>
        ) : invoiceData ? (
          <Row className="g-gs">
            <Col lg="12" className="mb-3">
              <KraReceipt
                receipt={normalizeKraReceipt(invoice, {
                  verificationUrl,
                  walkIn: !customerPin || customerPin === "-",
                  customerPin,
                })}
              />
            </Col>
            <Col lg="4">
              <Card className="card-bordered h-100">
                <div className="card-inner">
                  <h6 className="title mb-3">Invoice Summary</h6>
                  <div className="mb-2"><strong>eTIMS ID:</strong> {invoice?.id || "-"}</div>
                  <div className="mb-2"><strong>Invoice No:</strong> {invoice?.invoiceNo || traderInvoiceNo || "-"}</div>
                  <div className="mb-2"><strong>Trader Invoice No:</strong> {invoice?.traderInvoiceNo || traderInvoiceNo || "-"}</div>
                  <div className="mb-2"><strong>Status:</strong> <Badge color="info">{status}</Badge></div>
                  {String(status).toLowerCase() === "not-sent" && (
                    <Alert color="warning" className="mt-2 mb-2 py-2">
                      eTIMS has saved this invoice but has not transferred it to KRA yet.
                    </Alert>
                  )}
                  <div className="mb-2"><strong>Sales Date:</strong> {fmtDateTime(salesDate)}</div>
                  <div className="mb-2"><strong>Total Amount:</strong> {fmtCurrency(totalAmount)}</div>
                  <div className="mb-2"><strong>Tax Amount:</strong> {fmtCurrency(taxAmount)}</div>
                  <div className="mb-2"><strong>Taxable Amount:</strong> {fmtCurrency(taxableAmount)}</div>
                </div>
              </Card>
            </Col>

            <Col lg="4">
              <Card className="card-bordered h-100">
                <div className="card-inner">
                  <h6 className="title mb-3">Customer</h6>
                  <div className="mb-2"><strong>Name:</strong> {customerName}</div>
                  <div className="mb-2"><strong>PIN:</strong> {customerPin}</div>
                  <div className="mb-2"><strong>Currency:</strong> {currency}</div>
                  <div className="mb-2"><strong>Receipt Type:</strong> {receiptTypeCode}</div>
                  <div className="mb-2"><strong>Payment Type:</strong> {paymentType}</div>
                  <div className="mb-2"><strong>Sales Type:</strong> {salesTypeCode}</div>
                </div>
              </Card>
            </Col>

            <Col lg="4">
              <Card className="card-bordered h-100">
                <div className="card-inner">
                  <h6 className="title mb-3">eTIMS Reply</h6>
                  <div className="mb-2"><strong>HTTP Status:</strong> {invoiceData?.status || "-"}</div>
                  <div className="mb-2"><strong>Status Code:</strong> {invoiceData?.statusCode || "-"}</div>
                  <div className="mb-3"><strong>Message:</strong> {invoiceData?.message || "-"}</div>

                  <h6 className="title mb-2">Quick Actions</h6>
                  <div className="d-grid gap-2">
                    {verificationUrl && (
                      <Button
                        color="success"
                        onClick={() => window.open(verificationUrl, "_blank", "noopener,noreferrer")}
                      >
                        <Icon name="external" className="me-1" /> Open KRA verification link
                      </Button>
                    )}
                    <Button color="primary" outline onClick={() => loadInvoice(true)} disabled={refreshing}>
                      {refreshing ? <Spinner size="sm" className="me-1" /> : <Icon name="reload" className="me-1" />} Refresh Status
                    </Button>
                    <Button color="light" outline onClick={() => window.print()}>
                      <Icon name="printer" className="me-1" /> Print This View
                    </Button>
                    <Button color="light" outline onClick={() => navigator.clipboard.writeText(traderInvoiceNo || "") }>
                      <Icon name="copy" className="me-1" /> Copy Invoice Number
                    </Button>
                  </div>
                </div>
              </Card>
            </Col>

            <Col lg="12">
              <Card className="card-bordered">
                <div className="card-inner">
                  <h6 className="title mb-2">Invoice Items</h6>
                  {items.length === 0 ? (
                    <div className="text-soft">No invoice line items were returned by eTIMS for this invoice reply.</div>
                  ) : (
                    <div className="table-responsive">
                      <Table size="sm" className="mb-0">
                        <thead>
                          <tr>
                            <th>Item Code</th>
                            <th>Description</th>
                            <th>Qty</th>
                            <th>Unit Price</th>
                            <th>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item, index) => (
                            <tr key={`${item.itemCode || item.code || index}-${index}`}>
                              <td>{item.itemCode || item.code || "-"}</td>
                              <td>{item.itemDescription || item.description || item.name || "-"}</td>
                              <td>{item.qty || item.quantity || "-"}</td>
                              <td>{fmtCurrency(item.unitPrice || item.price || 0)}</td>
                              <td>{fmtCurrency(item.amount || item.lineAmount || 0)}</td>
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
                  <h6 className="title mb-2">Raw API Response</h6>
                  <pre style={{ margin: 0, maxHeight: 420, overflow: "auto", background: "#f8f9fa", padding: 12 }}>
                    {prettyJson(invoiceData)}
                  </pre>
                </div>
              </Card>
            </Col>
          </Row>
        ) : null}
      </Content>
    </React.Fragment>
  );
};

export default KraInvoiceBrowser;