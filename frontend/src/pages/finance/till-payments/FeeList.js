import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Button,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Nav,
  NavItem,
  NavLink,
  Spinner,
  Table,
  TabContent,
  TabPane,
} from "reactstrap";
import classnames from "classnames";
import Content from "../../../layout/content/Content";
import Head from "../../../layout/head/Head";
import {
  Block,
  BlockBetween,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  PreviewCard,
} from "../../../components/Component";
import { http } from "../../../helpers";
import TicketsAPI from "../../../helpers/TicketsAPI";
import { extractTicketsFromApiPayload } from "../../../helpers/authorizeTicketCustomer";
import {
  formatKes,
  mergeTillRows,
  ticketAssignee,
  ticketCreator,
  ticketCustomerName,
  ticketPhone,
  ticketStatus,
} from "../../../helpers/tillPayments";
import { showError, showSuccess } from "../../../utils/notifications";
import "./till-payments.css";

const StatusChip = ({ status, label }) => (
  <span className={classnames("reloc-chip", `reloc-chip--${status}`)}>{label}</span>
);

/**
 * @param {{ feeType: string, ticketType: string, title: string, minAmount: number, defaultAmount: number|string }} config
 */
const FeeList = ({ config }) => {
  const { feeType, ticketType, title, minAmount, defaultAmount } = config;
  const amountHint =
    minAmount > 1
      ? `Minimum ${minAmount}. You may increase.`
      : "Enter any amount (KES).";

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [collectOpen, setCollectOpen] = useState(false);
  const [active, setActive] = useState(null);
  const [tab, setTab] = useState("stk");
  const [amount, setAmount] = useState(
    defaultAmount !== "" && defaultAmount != null ? String(defaultAmount) : ""
  );
  const [phone, setPhone] = useState("");
  const [receipt, setReceipt] = useState("");
  const [busy, setBusy] = useState(false);
  const [pollHint, setPollHint] = useState("");
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ticketRes, txnRes] = await Promise.all([
        TicketsAPI.getAll({ type: ticketType, per_page: 200 }),
        http.get("/megapay/transactions", { params: { fee_type: feeType, per_page: 200 } }),
      ]);
      const tickets = extractTicketsFromApiPayload(ticketRes);
      const txns = Array.isArray(txnRes.data?.data) ? txnRes.data.data : [];
      const fallback = Number(defaultAmount) > 0 ? Number(defaultAmount) : minAmount;
      setRows(mergeTillRows(tickets, txns, fallback));
    } catch (err) {
      showError(err?.response?.data?.message || err.message || `Failed to load ${title}`);
    } finally {
      setLoading(false);
    }
  }, [feeType, ticketType, title, defaultAmount, minAmount]);

  useEffect(() => {
    load();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!q) return true;
      const t = row.ticket || {};
      const blob = [
        t.number,
        t.id,
        t.subject,
        ticketCreator(t),
        ticketAssignee(t),
        ticketStatus(t),
        ticketPhone(t),
        ticketCustomerName(t),
        row.transaction?.receipt,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [rows, search, statusFilter]);

  const openCollect = (row) => {
    setActive(row);
    const paidAmt = Number(row.amount);
    if (Number.isFinite(paidAmt) && paidAmt >= minAmount) {
      setAmount(String(paidAmt));
    } else if (defaultAmount !== "" && defaultAmount != null) {
      setAmount(String(defaultAmount));
    } else {
      setAmount("");
    }
    setPhone(ticketPhone(row.ticket) || "");
    setReceipt("");
    setTab("stk");
    setPollHint("");
    setCollectOpen(true);
  };

  const openCollectStandalone = () => {
    setActive(null);
    if (defaultAmount !== "" && defaultAmount != null) {
      setAmount(String(defaultAmount));
    } else {
      setAmount("");
    }
    setPhone("");
    setReceipt("");
    setTab("stk");
    setPollHint("");
    setCollectOpen(true);
  };

  const closeCollect = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setCollectOpen(false);
    setActive(null);
    setBusy(false);
    setPollHint("");
  };

  const ticketSnapshot = (ticket) => {
    if (!ticket) return {};
    return {
      ticket_id: String(ticket?.id ?? ""),
      ticket_number: ticket?.number != null ? String(ticket.number) : "",
      ticket_subject: ticket?.subject || "",
      ticket_created_by: ticketCreator(ticket),
    };
  };

  const startPoll = (checkoutId) => {
    if (pollRef.current) clearInterval(pollRef.current);
    setPollHint("Waiting for customer PIN…");
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts += 1;
      try {
        const res = await http.get(`/megapay/transactions/${encodeURIComponent(checkoutId)}`);
        const txn = res.data?.data;
        const st = String(txn?.status || "").toLowerCase();
        if (st === "paid") {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setPollHint(`Paid — ${txn.receipt || "receipt received"}`);
          showSuccess(`Payment received${txn.receipt ? `: ${txn.receipt}` : ""}`);
          await load();
          setTimeout(closeCollect, 800);
        } else if (st === "cancelled" || st === "failed") {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setPollHint(txn.result_desc || st);
          showError(txn.result_desc || `Payment ${st}`);
          await load();
        } else if (attempts >= 40) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setPollHint("Still pending — refresh the list shortly");
          await load();
        }
      } catch {
        // keep polling
      }
    }, 3000);
  };

  const validateAmount = () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < minAmount) {
      showError(
        minAmount > 1
          ? `Amount must be at least ${minAmount}`
          : "Enter a valid amount (at least 1)"
      );
      return null;
    }
    return amt;
  };

  const sendStk = async () => {
    const amt = validateAmount();
    if (amt == null) return;
    if (!phone.trim()) {
      showError("Enter the customer phone number");
      return;
    }
    setBusy(true);
    try {
      const snap = ticketSnapshot(active?.ticket);
      const res = await http.post("/megapay/stk", {
        phone: phone.trim(),
        amount: amt,
        fee_type: feeType,
        ...snap,
      });
      showSuccess(res.data?.message || "STK push sent");
      const checkout = res.data?.CheckoutRequestID || res.data?.transaction?.checkout_request_id;
      if (checkout) startPoll(checkout);
      await load();
    } catch (err) {
      showError(err?.response?.data?.message || err.message || "STK failed");
    } finally {
      setBusy(false);
    }
  };

  const saveManual = async () => {
    const amt = validateAmount();
    if (amt == null) return;
    if (!receipt.trim()) {
      showError("Enter the M-Pesa transaction ID from the SMS");
      return;
    }
    setBusy(true);
    try {
      const snap = ticketSnapshot(active?.ticket);
      const res = await http.post("/megapay/manual", {
        receipt: receipt.trim(),
        phone: phone.trim() || undefined,
        amount: amt,
        fee_type: feeType,
        ...snap,
      });
      showSuccess(res.data?.message || "Payment recorded");
      await load();
      closeCollect();
    } catch (err) {
      showError(err?.response?.data?.message || err.message || "Could not record payment");
    } finally {
      setBusy(false);
    }
  };

  const unpaidDisplayAmount = () => {
    if (defaultAmount !== "" && defaultAmount != null) {
      return formatKes(defaultAmount);
    }
    return "—";
  };

  return (
    <React.Fragment>
      <Head title={title} />
      <Content>
        <div className="reloc-finance">
          <BlockHead size="sm">
            <BlockBetween>
              <BlockHeadContent>
                <BlockTitle page>{title}</BlockTitle>
              </BlockHeadContent>
              <BlockHeadContent className="d-flex align-items-center gap-2">
                <Button
                  color="primary"
                  className="till-collect-btn"
                  onClick={openCollectStandalone}
                >
                  Collect
                </Button>
                <Button
                  tag={Link}
                  to={`${process.env.PUBLIC_URL}/admin/finance/till-payments`}
                  color="light"
                  size="sm"
                >
                  Till dashboard
                </Button>
              </BlockHeadContent>
            </BlockBetween>
          </BlockHead>

          <Block>
            <PreviewCard>
              <div className="reloc-toolbar">
                <div className="reloc-toolbar-left">
                  <Input
                    className="reloc-search"
                    placeholder="Search ticket, subject, creator, phone…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <Input
                    type="select"
                    style={{ maxWidth: 160 }}
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">All payments</option>
                    <option value="unpaid">Unpaid</option>
                    <option value="pending">Pending STK</option>
                    <option value="paid">Paid</option>
                  </Input>
                </div>
                <div className="d-flex gap-2 align-items-center">
                  <Button color="light" size="sm" onClick={load} disabled={loading}>
                    Refresh
                  </Button>
                </div>
              </div>

              {loading ? (
                <div className="text-center py-5">
                  <Spinner size="sm" /> Loading {title.toLowerCase()} tickets…
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-soft mb-0 py-4 text-center">No {title.toLowerCase()} tickets match.</p>
              ) : (
                <Table responsive className="reloc-table mb-0">
                  <thead>
                    <tr>
                      <th>Ticket</th>
                      <th>Subject</th>
                      <th>Created by</th>
                      <th>Assigned to</th>
                      <th>Status</th>
                      <th>Customer</th>
                      <th>Amount</th>
                      <th>Payment</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => {
                      const t = row.ticket;
                      const num = t.number || t.id;
                      return (
                        <tr key={t.id || num}>
                          <td>
                            <Link
                              className="reloc-ticket-link"
                              to={`${process.env.PUBLIC_URL}/admin/tickets/view/${t.id}`}
                            >
                              #{num}
                            </Link>
                          </td>
                          <td>
                            <div className="fw-medium">{t.subject || "—"}</div>
                          </td>
                          <td>{ticketCreator(t)}</td>
                          <td>{ticketAssignee(t)}</td>
                          <td>
                            <span className="reloc-chip reloc-chip--ticket-status">
                              {ticketStatus(t)}
                            </span>
                          </td>
                          <td>
                            <div>{ticketCustomerName(t) || "—"}</div>
                            <div className="small text-soft">{ticketPhone(t) || "—"}</div>
                          </td>
                          <td className="text-nowrap">
                            {row.status === "paid"
                              ? formatKes(row.transaction?.amount)
                              : unpaidDisplayAmount()}
                            {row.transaction?.receipt ? (
                              <div className="small text-soft">{row.transaction.receipt}</div>
                            ) : null}
                          </td>
                          <td>
                            <StatusChip status={row.status} label={row.label} />
                          </td>
                          <td className="text-end">
                            {row.status !== "paid" ? (
                              <Button color="primary" size="sm" onClick={() => openCollect(row)}>
                                Collect
                              </Button>
                            ) : (
                              <span className="small text-soft text-capitalize">
                                {row.transaction?.payment_method || "paid"}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              )}
            </PreviewCard>
          </Block>
        </div>

        <Modal isOpen={collectOpen} toggle={closeCollect} className="modal-dialog-centered reloc-finance" size="md">
          <ModalHeader toggle={closeCollect}>
            Collect {title.toLowerCase()} fee
            {!active?.ticket ? " (no ticket)" : ""}
          </ModalHeader>
          <ModalBody>
            {active?.ticket ? (
              <dl className="reloc-panel-summary">
                <dt>Ticket</dt>
                <dd>#{active.ticket.number || active.ticket.id}</dd>
                <dt>Subject</dt>
                <dd>{active.ticket.subject || "—"}</dd>
                <dt>Created by</dt>
                <dd>{ticketCreator(active.ticket)}</dd>
              </dl>
            ) : (
              <p className="reloc-panel-summary mb-3 small text-soft">
                Standalone collection — not linked to a ticket on this list. Enter phone and amount to
                send STK or record a TransID.
              </p>
            )}

            <Nav tabs className="mb-3">
              <NavItem>
                <NavLink className={classnames({ active: tab === "stk" })} onClick={() => setTab("stk")}>
                  STK push
                </NavLink>
              </NavItem>
              <NavItem>
                <NavLink className={classnames({ active: tab === "manual" })} onClick={() => setTab("manual")}>
                  Manual TransID
                </NavLink>
              </NavItem>
            </Nav>

            <FormGroup>
              <Label>Amount (KES)</Label>
              <Input
                type="number"
                min={minAmount}
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={minAmount > 1 ? String(minAmount) : "e.g. 1500"}
              />
              <small className="text-soft">{amountHint}</small>
            </FormGroup>
            <FormGroup>
              <Label>Customer phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07…" />
            </FormGroup>

            <TabContent activeTab={tab}>
              <TabPane tabId="stk">
                {pollHint ? <p className="small text-soft mb-2">{pollHint}</p> : null}
              </TabPane>
              <TabPane tabId="manual">
                <FormGroup>
                  <Label>M-Pesa transaction ID</Label>
                  <Input
                    value={receipt}
                    onChange={(e) => setReceipt(e.target.value.toUpperCase())}
                    placeholder="e.g. UHG4P30DO7"
                  />
                  <small className="text-soft">From the customer&apos;s M-Pesa confirmation SMS.</small>
                </FormGroup>
              </TabPane>
            </TabContent>
          </ModalBody>
          <ModalFooter>
            <Button color="light" onClick={closeCollect} disabled={busy}>
              Cancel
            </Button>
            {tab === "stk" ? (
              <Button color="primary" onClick={sendStk} disabled={busy}>
                {busy ? "Sending…" : "Send STK"}
              </Button>
            ) : (
              <Button color="primary" onClick={saveManual} disabled={busy}>
                {busy ? "Saving…" : "Record payment"}
              </Button>
            )}
          </ModalFooter>
        </Modal>
      </Content>
    </React.Fragment>
  );
};

export default FeeList;
