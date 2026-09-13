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
import TicketsAPI from "../../../helpers/TicketsAPI";
import { extractTicketsFromApiPayload } from "../../../helpers/authorizeTicketCustomer";
import {
  formatKes,
  mergeRelocationRows,
} from "../../../helpers/relocationPayments";
import { showError } from "../../../utils/notifications";
import "./relocation.css";

const Kpi = ({ label, value, sub, accent }) => (
  <Card className={`reloc-kpi${accent ? " reloc-kpi--accent" : ""}`}>
    <div className="card-inner">
      <span className="reloc-kpi-label">{label}</span>
      <div className="reloc-kpi-value">{value}</div>
      {sub ? <span className="reloc-kpi-sub">{sub}</span> : null}
    </div>
  </Card>
);

const RelocationDashboard = () => {
  const [stats, setStats] = useState(null);
  const [unpaidCount, setUnpaidCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, ticketRes, txnRes] = await Promise.all([
        http.get("/megapay/relocation/stats"),
        TicketsAPI.getAll({ type: "Relocation", per_page: 200 }),
        http.get("/megapay/transactions", { params: { fee_type: "relocation", per_page: 200 } }),
      ]);
      setStats(statsRes.data?.data || null);
      const tickets = extractTicketsFromApiPayload(ticketRes);
      const txns = Array.isArray(txnRes.data?.data) ? txnRes.data.data : [];
      const merged = mergeRelocationRows(tickets, txns);
      setUnpaidCount(merged.filter((r) => r.status === "unpaid").length);
    } catch (err) {
      showError(err?.response?.data?.message || err.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const recent = stats?.recent_paid || [];

  return (
    <React.Fragment>
      <Head title="Relocation dashboard" />
      <Content>
        <div className="reloc-finance">
          <BlockHead size="sm">
            <BlockBetween>
              <BlockHeadContent>
                <BlockTitle page>Relocation dashboard</BlockTitle>
              </BlockHeadContent>
              <BlockHeadContent className="d-flex gap-2">
                <Button color="light" size="sm" onClick={load} disabled={loading}>
                  Refresh
                </Button>
                <Button
                  tag={Link}
                  to={`${process.env.PUBLIC_URL}/admin/finance/relocation`}
                  color="primary"
                  size="sm"
                >
                  Open list
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
                    <Kpi label="Unpaid tickets" value={unpaidCount} sub="Awaiting collection" />
                  </Col>
                  <Col sm="6" lg="3">
                    <Kpi
                      label="Pending STK"
                      value={stats?.pending_stk ?? 0}
                      sub="PIN not confirmed yet"
                    />
                  </Col>
                  <Col sm="6" lg="3">
                    <Kpi
                      label="Paid today"
                      value={stats?.paid_today_count ?? 0}
                      sub={formatKes(stats?.paid_today_amount)}
                      accent
                    />
                  </Col>
                  <Col sm="6" lg="3">
                    <Kpi
                      label="Paid this month"
                      value={stats?.paid_month_count ?? 0}
                      sub={formatKes(stats?.paid_month_amount)}
                    />
                  </Col>
                </Row>

                <PreviewCard>
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h6 className="title mb-0">Recent paid relocations</h6>
                    <span className="small text-soft">
                      All-time {formatKes(stats?.paid_total_amount)} · {stats?.paid_total_count ?? 0}{" "}
                      payments
                    </span>
                  </div>
                  {recent.length === 0 ? (
                    <p className="text-soft mb-0">No paid relocation fees yet.</p>
                  ) : (
                    <Table responsive className="reloc-table mb-0">
                      <thead>
                        <tr>
                          <th>When</th>
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

export default RelocationDashboard;
