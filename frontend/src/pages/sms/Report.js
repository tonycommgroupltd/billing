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
      const { data } = await http.get("/sms-report", { params: { days: days?.value || 30 } });
      setReport(data);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load SMS report");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = report?.totals || {};
  const byStatus = totals.by_status || {};

  return (
    <>
      <Head title="SMS Reports" />
      <Content>
        <BlockHead size="sm">
          <div className="nk-block-between-md g-4">
            <BlockHeadContent>
              <BlockTitle tag="h3" page>
                SMS Reports
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
              <Link to="/admin/sms/outbox" className="btn btn-outline-light bg-white">
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
                <span className="sub-text">SMS balance</span>
                <h4
                  className={`title ${
                    report?.balance?.ok
                      ? Number(report.balance.credit) < 100
                        ? "text-warning"
                        : "text-success"
                      : report?.balance
                        ? "text-danger"
                        : ""
                  }`}
                >
                  {loading && !report
                    ? "…"
                    : report?.balance?.ok
                      ? Number(report.balance.credit).toLocaleString(undefined, {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })
                      : "—"}
                </h4>
                <span className="text-soft" style={{ fontSize: 12 }}>
                  {report?.balance?.ok
                    ? `${report.balance.provider || "AdvantaSMS"} credits`
                    : report?.balance?.error || "Balance unavailable"}
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
                <span className="sub-text">Sent</span>
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
                <span className="sub-text">Pending queue</span>
                <h4 className="title text-warning">{totals.pending ?? 0}</h4>
                <span className="text-soft" style={{ fontSize: 12 }}>
                  Waiting for sms:send-bulk
                </span>
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
                    key={status}
                    color={
                      status === "sent" ? "success" : status === "failed" ? "danger" : status === "pending" ? "warning" : "secondary"
                    }
                    className="fs-14px px-3 py-2"
                  >
                    {status}: {count}
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
                      <th>Recipient</th>
                      <th>Customer</th>
                      <th>When</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.failed_recent.map((row) => (
                      <tr key={row.id}>
                        <td>{row.id}</td>
                        <td>{row.recipient}</td>
                        <td>{row.name || "—"}</td>
                        <td>
                          {row.created_at ? dateFormat(row.created_at, "yyyy-mm-dd HH:MM") : "—"}
                        </td>
                        <td className="text-end">
                          <Link to={`/admin/sms/outbox/${row.id}`} className="btn btn-sm btn-light">
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
