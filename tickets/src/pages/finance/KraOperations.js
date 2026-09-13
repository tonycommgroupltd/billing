import React, { useState } from "react";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import {
  Block,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Row,
  Col,
  Button,
  Icon,
} from "../../components/Component";
import { Alert, Badge, Card, Input, Spinner, Table } from "reactstrap";
import KraAPI, {
  KRA_DEFAULT_ITEM_CODE,
  KRA_DEFAULT_ITEM_NAME,
  describeEtimsItemsFailure,
  pickDefaultEtimsItem,
  resolveInvoiceVerificationUrl,
  resolveWorkflowItemCode,
} from "../../helpers/KraAPI";

const fmtCurrency = (value) => {
  const n = Number(value || 0);
  return `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtDateTime = (value) => {
  if (!value) return "-";
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

const KraOperations = () => {
  const [customerNumber, setCustomerNumber] = useState("");
  const [customerPin, setCustomerPin] = useState("");
  const [authHeader, setAuthHeader] = useState(() => window.localStorage.getItem("kra_etims_auth_header") || "");

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [workflowData, setWorkflowData] = useState(null);
  const [serviceId, setServiceId] = useState("");
  const [itemCode, setItemCode] = useState(KRA_DEFAULT_ITEM_CODE);
  const [itemDescription, setItemDescription] = useState(KRA_DEFAULT_ITEM_NAME);
  const [etimsItems, setEtimsItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [pkg, setPkg] = useState("0");
  const [unitPrice, setUnitPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [salesStatusCode, setSalesStatusCode] = useState("01");
  const [paymentType, setPaymentType] = useState("01");
  const [exchangeRate, setExchangeRate] = useState("1");
  const [syncCustomerFirst, setSyncCustomerFirst] = useState(true);
  const [fromMonth, setFromMonth] = useState("");
  const [toMonth, setToMonth] = useState("");

  const [lastResponse, setLastResponse] = useState(null);
  const [customerInvoices, setCustomerInvoices] = useState([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [selectedInvoiceDetails, setSelectedInvoiceDetails] = useState(null);
  const [loadingInvoiceDetails, setLoadingInvoiceDetails] = useState(false);

  const [lastCreatedInvoice, setLastCreatedInvoice] = useState(null);

  const showSuccess = (message) => {
    setSuccess(message);
    setTimeout(() => setSuccess(""), 3500);
  };

  const applyEtimsItem = (item) => {
    if (!item) return;
    setItemCode(item.itemCode);
    if (item.name) setItemDescription(item.name);
    if (item.unitPrice != null && !Number.isNaN(item.unitPrice)) {
      setUnitPrice(String(item.unitPrice));
      setAmount(String(item.unitPrice));
    }
  };

  const handleCheckConnection = async () => {
    try {
      setCheckingConnection(true);
      const status = await KraAPI.checkConnection(authHeader);
      setConnectionStatus(status);
      if (status.items?.length) {
        setEtimsItems(status.items);
        applyEtimsItem(pickDefaultEtimsItem(status.items));
      }
      if (!status.ok) setError(status.message);
    } catch (e) {
      setConnectionStatus({
        ok: false,
        message: e.message || "Connection check failed",
      });
    } finally {
      setCheckingConnection(false);
    }
  };

  const handleFetchItems = async () => {
    try {
      setLoadingItems(true);
      setError("");
      const { items, raw } = await KraAPI.getEtimsItems(authHeader);
      setEtimsItems(items);
      if (items.length) {
        applyEtimsItem(pickDefaultEtimsItem(items));
      } else {
        setError(describeEtimsItemsFailure(raw));
      }
      setConnectionStatus({
        ok: items.length > 0,
        vscuReachable: items.length > 0,
        itemCount: items.length,
        message: items.length
          ? `${items.length} item(s) from eTIMS`
          : 'VSCU returned no items — is the Virtual FD running?',
        raw,
      });
    } catch (e) {
      setEtimsItems([]);
      setConnectionStatus({
        ok: false,
        message: e.response?.data?.error || "Failed to fetch eTIMS items",
      });
      setError(e.response?.data?.error || "Failed to fetch eTIMS items");
    } finally {
      setLoadingItems(false);
    }
  };

  // Auto-load eTIMS items + connection status on mount
  React.useEffect(() => {
    handleFetchItems();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoadCustomer = async () => {
    const value = customerNumber.trim();
    if (!value) {
      setError("Enter customer number first");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setSuccess("");
      setLastResponse(null);
      setCustomerInvoices([]);
      setSelectedInvoiceDetails(null);

      const res = await KraAPI.getCustomerWorkflow(value, authHeader);
      const data = res.data;
      setWorkflowData(data);

      if (data?.defaults) {
        setServiceId(data.defaults.preferredServiceId ? String(data.defaults.preferredServiceId) : "");
        const resolvedCode = resolveWorkflowItemCode(data.defaults);
        setItemCode(resolvedCode);
        const catalogItem = etimsItems.find((i) => i.itemCode === resolvedCode);
        if (catalogItem?.name) setItemDescription(catalogItem.name);
        else if (resolvedCode === KRA_DEFAULT_ITEM_CODE) setItemDescription(KRA_DEFAULT_ITEM_NAME);
        setUnitPrice(String(data.defaults.suggestedUnitPrice || catalogItem?.unitPrice || ""));
        setAmount(String(data.defaults.suggestedAmount || data.defaults.suggestedUnitPrice || catalogItem?.unitPrice || ""));
      }

      if (data?.context?.activeServices?.length) {
        setItemDescription((prev) => prev || data.context.activeServices[0].title || "Internet subscription");
      }

      showSuccess("Customer context loaded");
    } catch (err) {
      setWorkflowData(null);
      setError(err.response?.data?.error || "Failed to load customer context");
    } finally {
      setLoading(false);
    }
  };

  const handleLoadCustomerInvoices = async (customerValue = customerNumber.trim(), quiet = false) => {
    if (!customerValue) {
      if (!quiet) setError("Enter customer number first");
      return;
    }

    try {
      setLoadingInvoices(true);
      if (!quiet) {
        setSelectedInvoiceDetails(null);
      }
      if (!quiet) {
        setError("");
        setSuccess("");
      }

      const res = await KraAPI.getCustomerInvoices(customerValue, authHeader);
      setLastResponse(res.data);
      setCustomerInvoices(res.data?.invoices || []);

      if (!quiet) {
        showSuccess(`Loaded ${res.data?.totalFound || 0} customer invoice(s)`);
      }
    } catch (err) {
      if (!quiet) {
        setError(err.response?.data?.error || "Failed to load customer invoices");
      }
      setCustomerInvoices([]);
    } finally {
      setLoadingInvoices(false);
    }
  };

  const handleViewInvoiceDetails = async (traderInvoiceNo) => {
    if (!traderInvoiceNo) {
      setError("Invoice number is missing");
      return;
    }

    try {
      setLoadingInvoiceDetails(true);
      setError("");
      const res = await KraAPI.getInvoice(traderInvoiceNo, authHeader);
      setSelectedInvoiceDetails({
        traderInvoiceNo,
        data: res.data,
      });
      showSuccess(`Loaded details for ${traderInvoiceNo}`);
    } catch (err) {
      setSelectedInvoiceDetails(null);
      setError(err.response?.data?.error || "Failed to load invoice details");
    } finally {
      setLoadingInvoiceDetails(false);
    }
  };

  const handleSyncCustomer = async () => {
    const value = customerNumber.trim();
    if (!value) {
      setError("Enter customer number first");
      return;
    }

    try {
      setBusy(true);
      setError("");
      setSuccess("");

      const payload = { customerPin: customerPin.trim() };
      const res = await KraAPI.syncCustomer(value, payload, authHeader);
      setLastResponse(res.data);

      if (res.data?.success) {
        showSuccess("Customer synced to KRA successfully");
      } else {
        setError("KRA customer sync returned an error response");
      }
    } catch (err) {
      setLastResponse(err.response?.data || null);
      setError(err.response?.data?.error || "Failed to sync customer to KRA");
    } finally {
      setBusy(false);
    }
  };

  const handleCreateInvoice = async () => {
    const value = customerNumber.trim();
    if (!value) {
      setError("Enter customer number first");
      return;
    }

    try {
      setBusy(true);
      setError("");
      setSuccess("");

      const payload = {
        customerPin: customerPin.trim(),
        mainServiceId: serviceId ? Number(serviceId) : undefined,
        itemCode: itemCode.trim(),
        itemDescription: itemDescription.trim() || "Internet subscription",
        paymentType: paymentType || undefined,
        quantity: Number(quantity || 1),
        pkg: Number(pkg || 0),
        unitPrice: Number(unitPrice || 0),
        amount: Number(amount || 0),
        salesStatusCode: salesStatusCode || undefined,
        exchangeRate: Number(exchangeRate || 1),
        syncCustomerFirst,
      };

      const res = await KraAPI.createInvoice(value, payload, authHeader);
      setLastResponse(res.data);

      const isEtimsSuccess = String(res.data?.statusCode || "").toUpperCase() === "SUCCESS";
      const isWorkflowSuccess = Boolean(res.data?.success || res.data?.meta?.success);
      if (isWorkflowSuccess || isEtimsSuccess) {
        const created = {
          traderInvoiceNo: res.data?.traderInvoiceNo
            || res.data?.data?.traderInvoiceNo
            || res.data?.invoice?.traderInvoiceNo,
          ...res.data?.data,
          ...res.data?.invoice,
          ...res.data,
        };
        const verifyUrl = resolveInvoiceVerificationUrl(created);
        setLastCreatedInvoice(verifyUrl ? { ...created, verificationUrl: verifyUrl } : created);
        await handleLoadCustomerInvoices(value, true);
        showSuccess(verifyUrl
          ? "KRA invoice created — open the verification link below"
          : "KRA invoice created successfully");
      } else {
        setLastCreatedInvoice(null);
        setError("KRA invoice API returned an error response");
      }
    } catch (err) {
      setLastCreatedInvoice(null);
      setLastResponse(err.response?.data || null);
      setError(err.response?.data?.error || "Failed to create KRA invoice");
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateAllInvoices = async () => {
    const value = customerNumber.trim();
    if (!value) {
      setError("Enter customer number first");
      return;
    }

    try {
      setBusy(true);
      setError("");
      setSuccess("");

      const payload = {
        customerPin: customerPin.trim(),
        mainServiceId: serviceId ? Number(serviceId) : undefined,
        itemCode: itemCode.trim(),
        itemDescription: itemDescription.trim() || "Internet subscription",
        paymentType: paymentType || undefined,
        quantity: Number(quantity || 1),
        pkg: Number(pkg || 0),
        unitPrice: Number(unitPrice || 0),
        salesStatusCode: salesStatusCode || undefined,
        exchangeRate: Number(exchangeRate || 1),
        syncCustomerFirst,
        fromMonth: fromMonth || undefined,
        toMonth: toMonth || undefined,
      };

      const res = await KraAPI.generateAllInvoices(value, payload, authHeader);
      setLastResponse(res.data);

      const generated = res.data?.totals?.generated ?? 0;
      const failed = res.data?.totals?.failed ?? 0;
      if (failed === 0) {
        await handleLoadCustomerInvoices(value, true);
        showSuccess(`Generated ${generated} monthly KRA invoices successfully`);
      } else {
        setError(`Generated ${generated} invoices, ${failed} failed. Check KRA API Response for details.`);
      }
    } catch (err) {
      setLastResponse(err.response?.data || null);
      setError(err.response?.data?.error || "Failed to generate monthly KRA invoices");
    } finally {
      setBusy(false);
    }
  };

  const context = workflowData?.context;

  return (
    <React.Fragment>
      <Head title="KRA Operations" />
      <Content>
        <BlockHead size="sm">
          <BlockHeadContent>
            <BlockTitle page>KRA Operations</BlockTitle>
            <p className="text-soft mb-0">
              Enter customer number, sync customer to KRA, and generate eTIMS invoice from one workflow.
            </p>
          </BlockHeadContent>
        </BlockHead>

        {error && <Alert color="danger">{error}</Alert>}
        {success && <Alert color="success">{success}</Alert>}

        <Card className="card-bordered mb-3">
          <div className="card-inner py-3">
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
              <div>
                <h6 className="title mb-1">eTIMS connection</h6>
                {connectionStatus ? (
                  <div className="d-flex flex-wrap align-items-center gap-2">
                    <Badge color={connectionStatus.vscuReachable ? "success" : "danger"}>
                      {connectionStatus.vscuReachable
                        ? `VSCU · ${connectionStatus.itemCount || etimsItems.length} item(s)`
                        : "VSCU error"}
                    </Badge>
                    {connectionStatus.vscuBaseUrl && (
                      <span className="text-soft small">{connectionStatus.vscuBaseUrl}</span>
                    )}
                    <span className="text-soft small">{connectionStatus.message}</span>
                    {connectionStatus.latencyMs != null && (
                      <span className="text-soft small">({connectionStatus.latencyMs}ms)</span>
                    )}
                  </div>
                ) : (
                  <span className="text-soft small">Checking VSCU…</span>
                )}
              </div>
              <div className="d-flex gap-2">
                <Button
                  size="sm"
                  color="light"
                  outline
                  onClick={handleCheckConnection}
                  disabled={checkingConnection || loadingItems}
                >
                  {checkingConnection ? <Spinner size="sm" /> : <Icon name="reload" className="me-1" />}
                  Test connection
                </Button>
                <Button
                  size="sm"
                  color="primary"
                  outline
                  onClick={handleFetchItems}
                  disabled={loadingItems}
                >
                  {loadingItems ? <Spinner size="sm" /> : <Icon name="list" className="me-1" />}
                  Reload items
                </Button>
              </div>
            </div>
            {etimsItems.length > 0 && (
              <p className="text-soft small mb-0 mt-2">
                Default item: <strong>{KRA_DEFAULT_ITEM_CODE}</strong> ({KRA_DEFAULT_ITEM_NAME})
              </p>
            )}
          </div>
        </Card>

        {lastCreatedInvoice && (
          <Alert color="info" className="d-flex flex-wrap justify-content-between align-items-center gap-2">
            <div>
              <strong>Invoice created</strong>
              {lastCreatedInvoice.traderInvoiceNo && (
                <span className="ms-2">{lastCreatedInvoice.traderInvoiceNo}</span>
              )}
            </div>
            {lastCreatedInvoice.verificationUrl ? (
              <Button
                color="primary"
                size="sm"
                onClick={() => window.open(lastCreatedInvoice.verificationUrl, "_blank", "noopener,noreferrer")}
              >
                <Icon name="external" className="me-1" /> Open KRA verification link
              </Button>
            ) : (
              <span className="text-soft small">Verification link not in response yet — check invoice list after transfer.</span>
            )}
          </Alert>
        )}

        <Row className="g-gs">
          <Col lg="5">
            <Card className="card-bordered h-100">
              <div className="card-inner">
                <h6 className="title mb-3">
                  <Icon name="search" className="me-1" /> Customer Lookup
                </h6>

                <label className="form-label">Customer Number (ID or phone)</label>
                <Input
                  value={customerNumber}
                  onChange={(e) => setCustomerNumber(e.target.value)}
                  placeholder="e.g. 12345 or 2547..."
                  className="mb-2"
                />

                <label className="form-label">KRA Customer PIN (optional)</label>
                <Input
                  value={customerPin}
                  onChange={(e) => setCustomerPin(e.target.value)}
                  placeholder="e.g. A123456789Z (leave blank if unavailable)"
                  className="mb-2"
                />

                <label className="form-label">KRA Authorization Header (optional)</label>
                <Input
                  value={authHeader}
                  onChange={(e) => {
                    setAuthHeader(e.target.value);
                    window.localStorage.setItem("kra_etims_auth_header", e.target.value);
                  }}
                  placeholder="Basic base64(username:password)"
                  className="mb-3"
                />

                <div className="d-flex gap-2 flex-wrap">
                  <Button color="primary" onClick={handleLoadCustomer} disabled={loading || busy}>
                    {loading ? <Spinner size="sm" /> : <Icon name="search" className="me-1" />} Load Customer
                  </Button>
                  <Button color="light" outline onClick={() => handleLoadCustomerInvoices()} disabled={loading || busy || loadingInvoices}>
                    {loadingInvoices ? <Spinner size="sm" /> : <Icon name="files" className="me-1" />} View Customer Invoices
                  </Button>
                  <Button color="info" onClick={handleSyncCustomer} disabled={loading || busy}>
                    {busy ? <Spinner size="sm" /> : <Icon name="user-check" className="me-1" />} Sync KRA Customer
                  </Button>
                </div>
              </div>
            </Card>
          </Col>

          <Col lg="7">
            <Card className="card-bordered h-100">
              <div className="card-inner">
                <h6 className="title mb-3">
                  <Icon name="file-docs" className="me-1" /> Invoice Builder
                </h6>

                {!context ? (
                  <p className="text-soft mb-0">Load customer context first.</p>
                ) : (
                  <>
                      {/* Active plan + tax summary */}
                      {context.activeServices?.length > 0 && (() => {
                        const billAmt = Number(amount) || context.monthlyAmount || 0;
                        const vatRate = 0.16;
                        const excl = Number((billAmt / (1 + vatRate)).toFixed(2));
                        const vat = Number((billAmt - excl).toFixed(2));
                        return (
                          <div className="alert alert-info py-2 px-3 mb-3">
                            <div className="d-flex flex-wrap gap-3 align-items-center">
                              <div>
                                <small className="text-soft">Active Plan</small>
                                <div className="fw-bold">{context.activeServices[0]?.planTitle || context.activeServices[0]?.title || "-"}</div>
                              </div>
                              <div>
                                <small className="text-soft">Monthly Amount</small>
                                <div className="fw-bold">{fmtCurrency(context.monthlyAmount)}</div>
                              </div>
                              <div>
                                <small className="text-soft">Excl. VAT (16%)</small>
                                <div className="fw-bold">{fmtCurrency(excl)}</div>
                              </div>
                              <div>
                                <small className="text-soft">VAT (16%)</small>
                                <div className="fw-bold text-danger">{fmtCurrency(vat)}</div>
                              </div>
                              <div>
                                <small className="text-soft">Total (incl. VAT)</small>
                                <div className="fw-bold text-success">{fmtCurrency(billAmt)}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      <Row className="g-2 mb-2">
                      <Col md="6">
                        <label className="form-label">Service</label>
                        <Input type="select" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                          <option value="">Auto select active service</option>
                          {(context.services || []).map((service) => (
                            <option key={service.id} value={service.id}>
                              #{service.id} - {service.title} ({fmtCurrency(service.monthlyAmount)})
                            </option>
                          ))}
                        </Input>
                      </Col>

                      <Col md="6">
                        <label className="form-label">eTIMS item</label>
                        <div className="d-flex gap-1">
                          <Input
                            type="select"
                            value={itemCode}
                            onChange={(e) => {
                              const code = e.target.value;
                              setItemCode(code);
                              const item = etimsItems.find((i) => i.itemCode === code);
                              if (item) applyEtimsItem(item);
                            }}
                          >
                            <option value={KRA_DEFAULT_ITEM_CODE}>
                              {KRA_DEFAULT_ITEM_CODE} — {KRA_DEFAULT_ITEM_NAME}
                            </option>
                            {etimsItems
                              .filter((i) => i.itemCode !== KRA_DEFAULT_ITEM_CODE)
                              .map((item) => (
                                <option key={item.itemCode} value={item.itemCode}>
                                  {item.itemCode} — {item.name || "Item"}
                                  {item.unitPrice != null ? ` (${item.unitPrice} KES)` : ""}
                                </option>
                              ))}
                            {itemCode && !etimsItems.some((i) => i.itemCode === itemCode) && (
                              <option value={itemCode}>{itemCode} (custom)</option>
                            )}
                          </Input>
                        </div>
                        {loadingItems && (
                          <small className="text-soft">Loading items from eTIMS…</small>
                        )}
                        {!loadingItems && etimsItems.length === 0 && (
                          <small className="text-warning d-block">
                            No catalog loaded — run Test connection or ensure VSCU is on port 8888.
                          </small>
                        )}
                      </Col>
                    </Row>

                    <Row className="g-2 mb-2">
                      <Col md="12">
                        <label className="form-label">Item Description</label>
                        <Input
                          value={itemDescription}
                          onChange={(e) => setItemDescription(e.target.value)}
                          placeholder="Internet subscription"
                        />
                      </Col>
                    </Row>

                    <Row className="g-2 mb-2">
                      <Col md="4">
                        <label className="form-label">Quantity</label>
                        <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="1" />
                      </Col>
                      <Col md="4">
                        <label className="form-label">Pkg</label>
                        <Input value={pkg} onChange={(e) => setPkg(e.target.value)} placeholder="0" />
                      </Col>
                      <Col md="4">
                        <label className="form-label">Unit Price</label>
                        <Input value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="0" />
                      </Col>
                    </Row>

                    <Row className="g-2 mb-2">
                      <Col md="4">
                        <label className="form-label">Total Amount</label>
                        <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
                      </Col>
                      <Col md="4">
                        <label className="form-label">Payment Type</label>
                        <Input type="select" value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
                          <option value="01">01 - Cash</option>
                          <option value="02">02 - Credit</option>
                          <option value="03">03 - Cash/Credit</option>
                          <option value="04">04 - Cheque</option>
                          <option value="05">05 - Card</option>
                          <option value="06">06 - Mobile Money</option>
                          <option value="07">07 - Other</option>
                        </Input>
                      </Col>
                      <Col md="4">
                        <label className="form-label">Exchange Rate</label>
                        <Input value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} placeholder="1" />
                      </Col>
                    </Row>

                    <Row className="g-2 mb-2">
                      <Col md="6">
                        <label className="form-label">Sales Status Code</label>
                        <Input type="select" value={salesStatusCode} onChange={(e) => setSalesStatusCode(e.target.value)}>
                          <option value="01">01 - Wait for Approval</option>
                          <option value="02">02 - Approved</option>
                          <option value="03">03 - Credit Note Requested</option>
                          <option value="04">04 - Canceled</option>
                          <option value="05">05 - Credit Note Generated</option>
                          <option value="06">06 - Transferred (send to KRA)</option>
                        </Input>
                        <small className="text-soft">KRA collection example uses 01 by default. Change only when needed.</small>
                      </Col>
                    </Row>

                    <Row className="g-2 mb-2">
                      <Col md="6">
                        <label className="form-label">From Month (optional)</label>
                        <Input type="month" value={fromMonth} onChange={(e) => setFromMonth(e.target.value)} />
                      </Col>
                      <Col md="6">
                        <label className="form-label">To Month (optional)</label>
                        <Input type="month" value={toMonth} onChange={(e) => setToMonth(e.target.value)} />
                      </Col>
                    </Row>

                    <div className="form-check mb-3">
                      <Input
                        id="syncCustomerFirst"
                        type="checkbox"
                        className="form-check-input"
                        checked={syncCustomerFirst}
                        onChange={(e) => setSyncCustomerFirst(e.target.checked)}
                      />
                      <label htmlFor="syncCustomerFirst" className="form-check-label ms-2">
                        Sync customer to KRA before creating invoice
                      </label>
                    </div>

                    <div className="d-flex gap-2 flex-wrap">
                      <Button color="success" onClick={handleCreateInvoice} disabled={loading || busy}>
                        {busy ? <Spinner size="sm" /> : <Icon name="file-plus" className="me-1" />} Create KRA Invoice
                      </Button>
                      <Button color="warning" onClick={handleGenerateAllInvoices} disabled={loading || busy}>
                        {busy ? <Spinner size="sm" /> : <Icon name="files" className="me-1" />} Generate All Monthly Invoices
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </Card>
          </Col>

          {context && (
            <>
              <Col lg="4">
                <Card className="card-bordered h-100">
                  <div className="card-inner">
                    <h6 className="title mb-2">Customer</h6>
                    <div className="mb-1"><strong>ID:</strong> {context.customer?.id}</div>
                    <div className="mb-1"><strong>Name:</strong> {context.customer?.name || "-"}</div>
                    <div className="mb-1"><strong>Phone:</strong> {context.customer?.phone || "-"}</div>
                    <div className="mb-1"><strong>City:</strong> {context.customer?.city || "-"}</div>
                    <hr />
                    <div className="mb-1"><strong>Monthly Amount:</strong> {fmtCurrency(context.monthlyAmount)}</div>
                    <div className="mb-1">
                      <strong>Continuity:</strong>{" "}
                      {context.continuity?.eligible ? (
                        <Badge color="success">Eligible ({context.continuity?.monthsWithPayment}/3 months)</Badge>
                      ) : (
                        <Badge color="warning">{context.continuity?.monthsWithPayment || 0}/3 months</Badge>
                      )}
                    </div>
                  </div>
                </Card>
              </Col>

              <Col lg="8">
                <Card className="card-bordered h-100">
                  <div className="card-inner">
                    <h6 className="title mb-2">Services</h6>
                    <div className="table-responsive">
                      <Table size="sm" className="mb-0">
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>Title</th>
                            <th>Status</th>
                            <th>Monthly</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(context.services || []).map((s) => (
                            <tr key={s.id}>
                              <td>{s.id}</td>
                              <td>{s.title}</td>
                              <td>{s.active ? <Badge color="success">Active</Badge> : <Badge color="light">Inactive</Badge>}</td>
                              <td>{fmtCurrency(s.monthlyAmount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  </div>
                </Card>
              </Col>

              <Col lg="12">
                <Card className="card-bordered">
                  <div className="card-inner">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <h6 className="title mb-0">Customer KRA Invoices</h6>
                      <Button size="sm" color="light" outline onClick={() => handleLoadCustomerInvoices()} disabled={loadingInvoices}>
                        {loadingInvoices ? <Spinner size="sm" /> : <Icon name="reload" className="me-1" />} Refresh
                      </Button>
                    </div>

                    {loadingInvoices ? (
                      <div className="text-center py-3"><Spinner color="primary" /></div>
                    ) : customerInvoices.length === 0 ? (
                      <div className="text-soft">No workflow invoices loaded for this customer yet.</div>
                    ) : (
                      <div className="table-responsive">
                        <Table size="sm" className="mb-0">
                          <thead>
                            <tr>
                              <th>Trader Invoice No</th>
                              <th>Sales Date</th>
                              <th>Total Amount</th>
                              <th>Status</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {customerInvoices.map((invoice) => {
                              const receiptUrl = resolveInvoiceVerificationUrl(invoice);
                              return (
                                <tr key={invoice.traderInvoiceNo || `${invoice.salesDate}-${invoice.totalAmount}`}>
                                  <td>{invoice.traderInvoiceNo || "-"}</td>
                                  <td>{fmtDateTime(invoice.salesDate)}</td>
                                  <td>{fmtCurrency(invoice.totalAmount)}</td>
                                  <td>{invoice.status || "-"}</td>
                                  <td>
                                    <div className="d-flex gap-1 flex-wrap">
                                      <Button
                                        size="sm"
                                        color="light"
                                        outline
                                        disabled={loadingInvoiceDetails}
                                        onClick={() => handleViewInvoiceDetails(invoice.traderInvoiceNo)}
                                      >
                                        {loadingInvoiceDetails && selectedInvoiceDetails?.traderInvoiceNo === invoice.traderInvoiceNo ? (
                                          <Spinner size="sm" />
                                        ) : (
                                          <>
                                            <Icon name="eye" className="me-1" /> View Details
                                          </>
                                        )}
                                      </Button>
                                      <Button
                                        size="sm"
                                        color="primary"
                                        outline
                                        disabled={!receiptUrl}
                                        title={receiptUrl || "KRA receipt URL not available"}
                                        onClick={() => receiptUrl && window.open(
                                          receiptUrl,
                                          "_blank",
                                          "noopener,noreferrer"
                                        )}
                                      >
                                        <Icon name="external" className="me-1" /> Open in Browser
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </Table>
                      </div>
                    )}

                    {selectedInvoiceDetails && (
                      <div className="mt-3">
                        <h6 className="title mb-2">Invoice Details: {selectedInvoiceDetails.traderInvoiceNo}</h6>
                        <pre style={{ margin: 0, maxHeight: 360, overflow: "auto", background: "#f8f9fa", padding: 12 }}>
                          {prettyJson(selectedInvoiceDetails.data)}
                        </pre>
                      </div>
                    )}
                  </div>
                </Card>
              </Col>
            </>
          )}

          <Col lg="12">
            <Card className="card-bordered">
              <div className="card-inner">
                <h6 className="title mb-2">KRA API Response</h6>
                <pre style={{ margin: 0, maxHeight: 360, overflow: "auto", background: "#f8f9fa", padding: 12 }}>
                  {lastResponse ? prettyJson(lastResponse) : "Run sync/create actions to see live KRA response."}
                </pre>
              </div>
            </Card>
          </Col>
        </Row>
      </Content>
    </React.Fragment>
  );
};

export default KraOperations;
