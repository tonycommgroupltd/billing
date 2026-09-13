import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Col, Row, Spinner, Table } from "reactstrap";
import {
  Block,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Button,
  Icon,
  PreviewCard,
  RSelect,
} from "../../components/Component";
import Content from "../../layout/content/Content";
import Head from "../../layout/head/Head";
import { http } from "../../helpers";
import { toast } from "react-toastify";
import dateFormat from "dateformat";

const dayOptions = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
];

const Report = () => {
  const [days, setDays] = useState(dayOptions[1]);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await http.get("/whatsapp-report", { params: { days: days?.value || 30 } });
      setReport(data);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load WhatsApp report");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = report?.totals || {};
  const byStatus = totals.by_status || {};
  const account = report?.account || {};

  return (
    <>
      <Head title="WhatsApp Reports" />
      <Content>
        <BlockHead size="sm">
          <div className="nk-block-between-md g-4">
            <BlockHeadContent>
              <BlockTitle tag="h3" page>
                WhatsApp Reports
              </BlockTitle>
            </BlockHeadContent>
            <BlockHeadContent className="d-flex align-items-center gap-2">
              <div style={{ minWidth: 160 }}>
                <RSelect options={dayOptions} value={days} onChange={setDays} />
              </div>
              <Button color="light" onClick={load} disabled={loading}>
                {loading ? <Spinner size="sm" /> : <Icon name="reload" />}
                <span>Refresh</span>
              </Button>
              <Link to="/admin/whatsapp/outbox" className="btn btn-outline-light bg-white">
                <Icon name="list" />
                <span>Outbox</span>
              </Link>
            </BlockHeadContent>
          </div>
        </BlockHead>

        <Block>
          <Row className="g-gs">
            <Col sm="6" xl="3">
              <PreviewCard>
                <span className="sub-text">Business number</span>
                <h4 className="title" style={{ fontSize: 18 }}>
                  {loading && !report
                    ? "…"
                    : account.ok
                      ? account.display_phone_number || "—"
                      : "—"}
                </h4>
                <span className="text-soft" style={{ fontSize: 12 }}>
                  {account.ok
                    ? `${account.verified_name || "WhatsApp"} · quality ${account.quality_rating || "—"}`
                    : account.error || "Account status unavailable"}
                </span>
              </PreviewCard>
            </Col>
            <Col sm="6" xl="3">
              <PreviewCard>
                <span className="sub-text">Messaging limit</span>
                <h4 className="title" style={{ fontSize: 18 }}>
                  {account.ok ? account.messaging_limit_tier || "—" : "—"}
                </h4>
                <span className="text-soft" style={{ fontSize: 12 }}>
                  Approved templates: {report?.templates ?? "—"}
                </span>
              </PreviewCard>
            </Col>
            <Col sm="6" xl="3">
              <PreviewCard>
                <span className="sub-text">Messages</span>
                <h4 className="title">{loading && !report ? "…" : totals.all ?? 0}</h4>
                <span className="text-soft" style={{ fontSize: 12 }}>
                  Since {report?.since || "—"}
                </span>
              </PreviewCard>
            </Col>
            <Col sm="6" xl="3">
              <PreviewCard>
                <span className="sub-text">Sent / success</span>
                <h4 className="title text-success">{totals.sent ?? 0}</h4>
                <span className="text-soft" style={{ fontSize: 12 }}>
                  Success rate {report?.success_rate != null ? `${report.success_rate}%` : "—"}
                </span>
              </PreviewCard>
            </Col>
            <Col sm="6" xl="3">
              <PreviewCard>
                <span className="sub-text">Failed</span>
                <h4 className="title text-danger">{totals.failed ?? 0}</h4>
              </PreviewCard>
            </Col>
            <Col sm="6" xl="3">
              <PreviewCard>
                <span className="sub-text">Outbox / Inbox</span>
                <h4 className="title">
                  {totals.outbox ?? 0} / {totals.inbox ?? 0}
                </h4>
              </PreviewCard>
            </Col>
          </Row>
        </Block>

        <Block>
          <PreviewCard>
            <h6 className="title mb-3">Status breakdown</h6>
            {Object.keys(byStatus).length === 0 ? (
              <p className="text-soft mb-0">No messages in this period.</p>
            ) : (
              <div className="d-flex flex-wrap gap-2">
                {Object.entries(byStatus).map(([status, count]) => (
                  <Badge
                    key={status || "null"}
                    color={
                      status === "sent" || status === "delivered" || status === "read"
                        ? "success"
                        : status === "failed"
                          ? "danger"
                          : "secondary"
                    }
                    className="fs-14px px-3 py-2"
                  >
                    {status || "unknown"}: {count}
                  </Badge>
                ))}
              </div>
            )}
          </PreviewCard>
        </Block>

        <Block>
          <PreviewCard>
            <h6 className="title mb-3">Daily volume</h6>
            {!report?.daily?.length ? (
              <p className="text-soft mb-0">No daily data.</p>
            ) : (
              <div className="table-responsive">
                <Table className="table-tranx">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th className="text-end">Messages</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...(report.daily || [])].reverse().map((row) => (
                      <tr key={row.day}>
                        <td>{row.day}</td>
                        <td className="text-end">{row.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </PreviewCard>
        </Block>

        <Block>
          <PreviewCard>
            <h6 className="title mb-3">Recent failures</h6>
            {!report?.failed_recent?.length ? (
              <p className="text-soft mb-0">No failures in this period.</p>
            ) : (
              <div className="table-responsive">
                <Table className="table-tranx">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Customer</th>
                      <th>When</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.failed_recent.map((row) => (
                      <tr key={row.id}>
                        <td>{row.id}</td>
                        <td>{row.name || "—"}</td>
                        <td>{row.created_at ? dateFormat(row.created_at, "yyyy-mm-dd HH:MM") : "—"}</td>
                        <td className="text-end">
                          <Link to={`/admin/whatsapp/outbox/${row.id}`} className="btn btn-sm btn-light">
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </PreviewCard>
        </Block>
      </Content>
    </>
  );
};

export default Report;
