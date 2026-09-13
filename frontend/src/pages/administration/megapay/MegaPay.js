import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Col,
  FormGroup,
  Input,
  Label,
  Row,
  Spinner,
  Table,
} from "reactstrap";
import Content from "../../../layout/content/Content";
import Head from "../../../layout/head/Head";
import {
  BackTo,
  Block,
  BlockBetween,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  PreviewCard,
} from "../../../components/Component";
import { http } from "../../../helpers";
import { showError, showSuccess } from "../../../utils/notifications";

const FEE_TYPES = [
  { value: "relocation", label: "Relocation" },
  { value: "installation", label: "Installation" },
  { value: "other", label: "Other" },
];

const statusColor = (status) => {
  switch (String(status || "").toLowerCase()) {
    case "paid":
      return "success";
    case "pending":
      return "warning";
    case "cancelled":
      return "secondary";
    case "failed":
      return "danger";
    default:
      return "light";
  }
};

const formatWhen = (value) => {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
};

const MegaPay = () => {
  const [settings, setSettings] = useState({ party_b_number: "", party_b_type: "till" });
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [feeType, setFeeType] = useState("relocation");
  const [reference, setReference] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [sending, setSending] = useState(false);
  const [activeCheckout, setActiveCheckout] = useState("");
  const [pollStatus, setPollStatus] = useState("");

  const [rows, setRows] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");

  const pollRef = useRef(null);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const res = await http.get("/megapay/settings");
      const data = res.data?.data || {};
      setSettings({
        party_b_number: data.party_b_number || "",
        party_b_type: data.party_b_type === "paybill" ? "paybill" : "till",
      });
    } catch (err) {
      showError(err?.response?.data?.message || err.message || "Failed to load MegaPay settings");
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  const loadTransactions = useCallback(async () => {
    setListLoading(true);
    setListError("");
    try {
      const res = await http.get("/megapay/transactions", { params: { per_page: 50 } });
      setRows(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (err) {
      setListError(err?.response?.data?.message || err.message || "Failed to load transactions");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
    loadTransactions();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadSettings, loadTransactions]);

  const saveSettings = async (e) => {
    e.preventDefault();
    setSettingsSaving(true);
    try {
      const res = await http.put("/megapay/settings", {
        party_b_number: settings.party_b_number,
        party_b_type: settings.party_b_type,
      });
      const data = res.data?.data || settings;
      setSettings({
        party_b_number: data.party_b_number || "",
        party_b_type: data.party_b_type === "paybill" ? "paybill" : "till",
      });
      showSuccess(res.data?.message || "Settings saved");
    } catch (err) {
      showError(err?.response?.data?.message || err.message || "Save failed");
    } finally {
      setSettingsSaving(false);
    }
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = (checkoutId) => {
    stopPolling();
    setActiveCheckout(checkoutId);
    setPollStatus("Waiting for customer PIN…");
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts += 1;
      try {
        const res = await http.get(`/megapay/transactions/${encodeURIComponent(checkoutId)}`);
        const txn = res.data?.data;
        if (!txn) return;
        const st = String(txn.status || "").toLowerCase();
        if (st === "paid") {
          setPollStatus(`Paid — receipt ${txn.receipt || "—"}`);
          stopPolling();
          showSuccess(`Payment received${txn.receipt ? `: ${txn.receipt}` : ""}`);
          loadTransactions();
        } else if (st === "cancelled" || st === "failed") {
          setPollStatus(txn.result_desc || st);
          stopPolling();
          showError(txn.result_desc || `Payment ${st}`);
          loadTransactions();
        } else if (attempts >= 40) {
          setPollStatus("Still pending — refresh the list later");
          stopPolling();
          loadTransactions();
        }
      } catch {
        // keep polling until timeout
      }
    }, 3000);
  };

  const sendStk = async (e) => {
    e.preventDefault();
    setSending(true);
    setPollStatus("");
    try {
      const res = await http.post("/megapay/stk", {
        phone,
        amount: Number(amount),
        fee_type: feeType,
        reference: reference || undefined,
        ticket_id: ticketId || undefined,
      });
      showSuccess(res.data?.message || "STK push sent");
      const checkout = res.data?.CheckoutRequestID || res.data?.transaction?.checkout_request_id;
      if (checkout) startPolling(checkout);
      setPhone("");
      setAmount("");
      setReference("");
      setTicketId("");
      loadTransactions();
    } catch (err) {
      showError(err?.response?.data?.message || err.message || "STK failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <React.Fragment>
      <Head title="MegaPay" />
      <Content>
        <BlockHead size="sm">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle page>MegaPay</BlockTitle>
            </BlockHeadContent>
            <BlockHeadContent>
              <BackTo link="/admin/administration" icon="arrow-left">
                Administration
              </BackTo>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>

        <Block>
          <Row className="g-gs">
            <Col lg="5">
              <PreviewCard>
                <h6 className="title mb-3">PartyB settlement</h6>
                {settingsLoading ? (
                  <div className="text-center py-3">
                    <Spinner size="sm" /> Loading…
                  </div>
                ) : (
                  <form onSubmit={saveSettings}>
                    <FormGroup>
                      <Label>Till / Paybill number</Label>
                      <Input
                        value={settings.party_b_number}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, party_b_number: e.target.value }))
                        }
                        placeholder="e.g. 4129711"
                        required
                      />
                    </FormGroup>
                    <FormGroup>
                      <Label>Type</Label>
                      <Input
                        type="select"
                        value={settings.party_b_type}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, party_b_type: e.target.value }))
                        }
                      >
                        <option value="till">Till (Buy Goods)</option>
                        <option value="paybill">Paybill</option>
                      </Input>
                    </FormGroup>
                    <Button color="primary" type="submit" disabled={settingsSaving}>
                      {settingsSaving ? "Saving…" : "Save PartyB"}
                    </Button>
                  </form>
                )}
              </PreviewCard>

              <PreviewCard className="mt-4">
                <h6 className="title mb-3">Collect fee (STK)</h6>
                {!settings.party_b_number ? (
                  <Alert color="warning">Configure PartyB above before sending STK.</Alert>
                ) : null}
                <form onSubmit={sendStk}>
                  <FormGroup>
                    <Label>Customer phone</Label>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="07…"
                      required
                    />
                  </FormGroup>
                  <FormGroup>
                    <Label>Amount (KES)</Label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                    />
                  </FormGroup>
                  <FormGroup>
                    <Label>Fee type</Label>
                    <Input
                      type="select"
                      value={feeType}
                      onChange={(e) => setFeeType(e.target.value)}
                    >
                      {FEE_TYPES.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </Input>
                  </FormGroup>
                  <FormGroup>
                    <Label>Reference (optional)</Label>
                    <Input
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      placeholder="Auto if empty"
                      maxLength={12}
                    />
                  </FormGroup>
                  <FormGroup>
                    <Label>Ticket ID (optional)</Label>
                    <Input
                      value={ticketId}
                      onChange={(e) => setTicketId(e.target.value)}
                      placeholder="For relocation / install tickets"
                    />
                  </FormGroup>
                  <Button
                    color="primary"
                    type="submit"
                    disabled={sending || !settings.party_b_number}
                  >
                    {sending ? "Sending…" : "Send STK"}
                  </Button>
                  {pollStatus ? (
                    <div className="mt-3 small text-soft">
                      {activeCheckout ? (
                        <span>
                          Checkout <code>{activeCheckout}</code> —{" "}
                        </span>
                      ) : null}
                      {pollStatus}
                    </div>
                  ) : null}
                </form>
              </PreviewCard>
            </Col>

            <Col lg="7">
              <PreviewCard>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h6 className="title mb-0">Recent transactions</h6>
                  <Button color="light" size="sm" onClick={loadTransactions} disabled={listLoading}>
                    Refresh
                  </Button>
                </div>
                {listError ? <Alert color="danger">{listError}</Alert> : null}
                {listLoading ? (
                  <div className="text-center py-5">
                    <Spinner size="sm" /> Loading…
                  </div>
                ) : rows.length === 0 ? (
                  <p className="text-soft mb-0">No MegaPay transactions yet.</p>
                ) : (
                  <Table responsive className="mb-0">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Phone</th>
                        <th>Amount</th>
                        <th>Fee</th>
                        <th>PartyB</th>
                        <th>Receipt</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id}>
                          <td className="text-nowrap">{formatWhen(row.created_at)}</td>
                          <td>{row.phone}</td>
                          <td>{row.amount}</td>
                          <td>
                            {row.fee_type}
                            {row.ticket_id ? (
                              <div className="small text-soft">#{row.ticket_id}</div>
                            ) : null}
                          </td>
                          <td>{row.party_b || "—"}</td>
                          <td>{row.receipt || "—"}</td>
                          <td>
                            <Badge color={statusColor(row.status)}>{row.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </PreviewCard>
            </Col>
          </Row>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default MegaPay;
