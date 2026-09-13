import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Spinner, Table } from "reactstrap";
import Content from "../../../layout/content/Content";
import Head from "../../../layout/head/Head";
import {
  Block,
  BlockBetween,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Col,
  PreviewCard,
  Row,
} from "../../../components/Component";
import { http } from "../../../helpers";
import {
  FEE_TYPE_LABELS,
  TILL_FEE_CONFIG,
  formatKes,
} from "../../../helpers/tillPayments";
import { showError } from "../../../utils/notifications";
import "./till-payments.css";

const Kpi = ({ label, value, sub, accent }) => (
  <Card className={`reloc-kpi${accent ? " reloc-kpi--accent" : ""}`}>
    <div className="card-inner">
      <span className="reloc-kpi-label">{label}</span>
      <div className="reloc-kpi-value">{value}</div>
      {sub ? <span className="reloc-kpi-sub">{sub}</span> : null}
    </div>
  </Card>
);

const ActionCard = ({ to, title, desc, className }) => (
  <Link to={`${process.env.PUBLIC_URL}${to}`} className={`till-action-card ${className || ""}`}>
    <div className="till-action-title">{title}</div>
    <div className="till-action-desc">{desc}</div>
    <div className="till-action-cta">Open list →</div>
  </Link>
);

const TillPaymentsDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await http.get("/megapay/till/stats");
      setStats(res.data?.data || null);
    } catch (err) {
      showError(err?.response?.data?.message || err.message || "Failed to load till stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const recent = stats?.recent_paid || [];
  const byType = stats?.by_type || {};

  return (
    <React.Fragment>
      <Head title="Till Payments" />
      <Content>
        <div className="reloc-finance">
          <BlockHead size="sm">
            <BlockBetween>
              <BlockHeadContent>
                <BlockTitle page>Till Payments</BlockTitle>
              </BlockHeadContent>
              <BlockHeadContent>
                <Button color="light" size="sm" onClick={load} disabled={loading}>
                  Refresh
                </Button>
              </BlockHeadContent>
            </BlockBetween>
          </BlockHead>

          <Block>
            {loading && !stats ? (
              <div className="text-center py-5">
                <Spinner size="sm" /> Loading…
              </div>
            ) : (
              <>
                <Row className="g-gs mb-4">
                  <Col sm="6" lg="3">
                    <Kpi
                      label="Total collected"
                      value={formatKes(stats?.paid_total_amount)}
                      sub={`${stats?.paid_total_count ?? 0} payments`}
                      accent
                    />
                  </Col>
                  <Col sm="6" lg="3">
                    <Kpi
                      label="Paid today"
                      value={stats?.paid_today_count ?? 0}
                      sub={formatKes(stats?.paid_today_amount)}
                    />
                  </Col>
                  <Col sm="6" lg="3">
                    <Kpi
                      label="Paid this month"
                      value={stats?.paid_month_count ?? 0}
                      sub={formatKes(stats?.paid_month_amount)}
                    />
                  </Col>
                  <Col sm="6" lg="3">
                    <Kpi
                      label="Pending STK"
                      value={stats?.pending_stk ?? 0}
                      sub="Awaiting PIN"
                    />
                  </Col>
                </Row>

                <p className="till-note mb-3">
                  Settlement source: MegaPay STK (PartyB). KopoKopo webhook integration coming later.
                </p>

                <h6 className="title mb-3">Collect with STK</h6>
                <Row className="g-gs mb-4">
                  <Col md="4">
                    <ActionCard
                      to={TILL_FEE_CONFIG.router_change.path}
                      title="Router change"
                      desc="Send STK for faulty router change tickets — any amount."
                      className="till-action-card--router"
                    />
                  </Col>
                  <Col md="4">
                    <ActionCard
                      to={TILL_FEE_CONFIG.relocation.path}
                      title="Relocation"
                      desc="Relocation tickets — minimum KSh 500, can adjust up."
                    />
                  </Col>
                  <Col md="4">
                    <ActionCard
                      to={TILL_FEE_CONFIG.extension.path}
                      title="Extension"
                      desc="Extension tickets — enter any amount."
                      className="till-action-card--extension"
                    />
                  </Col>
                </Row>

                <Row className="g-gs mb-4">
                  {["router_change", "relocation", "extension"].map((key) => {
                    const cfg = TILL_FEE_CONFIG[key];
                    const s = byType[key] || {};
                    return (
                      <Col sm="4" key={key}>
                        <Card className="reloc-kpi">
                          <div className="card-inner">
                            <span className="reloc-kpi-label">{cfg.title}</span>
                            <div className="reloc-kpi-value">{formatKes(s.paid_month_amount)}</div>
                            <span className="reloc-kpi-sub">
                              This month · {s.paid_month_count ?? 0} paid · {s.pending_stk ?? 0} pending
                            </span>
                          </div>
                        </Card>
                      </Col>
                    );
                  })}
                </Row>

                <PreviewCard>
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h6 className="title mb-0">Recent till payments</h6>
                  </div>
                  {recent.length === 0 ? (
                    <p className="text-soft mb-0">No paid till fees yet.</p>
                  ) : (
                    <Table responsive className="reloc-table mb-0">
                      <thead>
                        <tr>
                          <th>When</th>
                          <th>Type</th>
                          <th>Ticket</th>
                          <th>Subject</th>
                          <th>Receipt</th>
                          <th>Amount</th>
                          <th>Method</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recent.map((txn) => (
                          <tr key={txn.id}>
                            <td className="text-nowrap">
                              {txn.updated_at
                                ? new Date(txn.updated_at).toLocaleString()
                                : "—"}
                            </td>
                            <td>{FEE_TYPE_LABELS[txn.fee_type] || txn.fee_type}</td>
                            <td>
                              {txn.ticket_id ? (
                                <Link
                                  className="reloc-ticket-link"
                                  to={`${process.env.PUBLIC_URL}/admin/tickets/view/${txn.ticket_id}`}
                                >
                                  #{txn.ticket_number || txn.ticket_id}
                                </Link>
                              ) : (
                                txn.ticket_number || "—"
                              )}
                            </td>
                            <td>{txn.ticket_subject || "—"}</td>
                            <td>{txn.receipt || "—"}</td>
                            <td>{formatKes(txn.amount)}</td>
                            <td className="text-capitalize">{txn.payment_method || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </PreviewCard>
              </>
            )}
          </Block>
        </div>
      </Content>
    </React.Fragment>
  );
};

export default TillPaymentsDashboard;
