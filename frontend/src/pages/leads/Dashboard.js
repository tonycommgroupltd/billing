import React, { useCallback, useEffect, useMemo, useState } from "react";
import { connect } from "react-redux";
import { Link } from "react-router-dom";
import { Badge, Card, Col, Row, Spinner } from "reactstrap";
import moment from "moment";

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
} from "../../components/Component";
import LeadsAPI from "../../helpers/LeadsAPI";
import {
  filterLeads,
  getLeadActivityTime,
  getLeadOwner,
  getLeadPipelineStatus,
  isLeadConverted,
} from "../../utils/leadFilters";
import "./LeadsDashboard.css";

const userLabel = (user) =>
  user?.display_name || user?.name || user?.username || user?.email || "Unknown";

const canSeeAllLeads = (user) =>
  (user?.all_roles || []).some((role) =>
    ["super-administrator", "administrator", "manager", "customer-care"].includes(String(role).toLowerCase())
  );

const statusTone = (status) => {
  if (status === "converted") return "success";
  if (status === "lost") return "danger";
  if (status === "in progress") return "warning";
  if (status === "completed") return "info";
  if (status === "new") return "primary";
  return "secondary";
};

const buildListHref = (metric, startDate, endDate) => {
  const params = new URLSearchParams();
  if (metric && metric !== "all") params.set("metric", metric);
  if (startDate) params.set("start", startDate);
  if (endDate) params.set("end", endDate);
  const qs = params.toString();
  return `/admin/leads/list${qs ? `?${qs}` : ""}`;
};

const StatCard = ({ label, value, icon, color, to, loading }) => (
  <Link to={to} className="leads-stat-card text-reset">
    <Card className="card-bordered h-100">
      <div className="card-inner">
        <div className="d-flex justify-content-between align-items-start">
          <div>
            <div className="leads-stat-label">{label}</div>
            <div className={`leads-stat-value text-${color}`}>{loading ? "…" : value}</div>
          </div>
          <span className={`leads-stat-icon bg-${color}-dim text-${color}`}>
            <Icon name={icon} />
          </span>
        </div>
      </div>
    </Card>
  </Link>
);

const LeadsDashboard = ({ user }) => {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const allLeads = canSeeAllLeads(user);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = allLeads
        ? await LeadsAPI.list({ per_page: 10000 })
        : await LeadsAPI.listByUser(userLabel(user), { per_page: 10000 });
      setLeads(response?.data || []);
      setLastRefresh(new Date());
    } catch (error) {
      console.error("Could not load leads dashboard", error);
    } finally {
      setLoading(false);
    }
  }, [allLeads, user]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () =>
      filterLeads(leads, {
        status: "all",
        owner: "",
        search: "",
        start: startDate,
        end: endDate,
      }),
    [leads, startDate, endDate]
  );

  const converted = useMemo(() => filtered.filter(isLeadConverted).length, [filtered]);
  const open = useMemo(
    () => filtered.filter((lead) => !isLeadConverted(lead) && getLeadPipelineStatus(lead) !== "lost").length,
    [filtered]
  );
  const lost = useMemo(() => filtered.filter((lead) => getLeadPipelineStatus(lead) === "lost").length, [filtered]);
  const rate = filtered.length ? Math.round((converted / filtered.length) * 100) : 0;

  const recent = useMemo(
    () =>
      [...filtered]
        .sort((a, b) => (getLeadActivityTime(b)?.valueOf() || 0) - (getLeadActivityTime(a)?.valueOf() || 0))
        .slice(0, 8),
    [filtered]
  );

  const topAgents = useMemo(() => {
    const map = {};
    filtered.forEach((lead) => {
      const owner = getLeadOwner(lead);
      if (!map[owner]) map[owner] = { owner, total: 0, converted: 0, open: 0 };
      map[owner].total += 1;
      if (isLeadConverted(lead)) map[owner].converted += 1;
      else if (getLeadPipelineStatus(lead) !== "lost") map[owner].open += 1;
    });
    return Object.values(map)
      .sort((a, b) => b.converted - a.converted || b.total - a.total)
      .slice(0, 6);
  }, [filtered]);

  const pipelineParts = useMemo(() => {
    const total = filtered.length || 1;
    return [
      { key: "converted", label: "Converted", count: converted, color: "#1ee0ac" },
      { key: "open", label: "Open", count: open, color: "#f4bd0e" },
      { key: "lost", label: "Lost", count: lost, color: "#e85347" },
    ].map((part) => ({ ...part, pct: Math.round((part.count / total) * 100) }));
  }, [filtered.length, converted, open, lost]);

  const applyPreset = (preset) => {
    if (preset === "month") {
      setStartDate(moment().startOf("month").format("YYYY-MM-DD"));
      setEndDate(moment().endOf("month").format("YYYY-MM-DD"));
      return;
    }
    if (preset === "30") {
      setStartDate(moment().subtract(29, "days").format("YYYY-MM-DD"));
      setEndDate(moment().format("YYYY-MM-DD"));
      return;
    }
    setStartDate("");
    setEndDate("");
  };

  return (
    <div className="leads-dashboard">
      <Head title="Leads Dashboard" />
      <Content>
        <BlockHead size="sm">
          <BlockBetween className="g-2">
            <BlockHeadContent>
              <BlockTitle page tag="h3">
                Leads Dashboard
              </BlockTitle>
            </BlockHeadContent>
            <BlockHeadContent>
              <div className="d-flex align-items-center flex-wrap gap-2">
                <span className="text-soft small">
                  {lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString()}` : ""}
                </span>
                <Button color="light" className="btn-icon" onClick={load} disabled={loading} title="Refresh">
                  <Icon name={loading ? "loader" : "reload"} className={loading ? "spinning" : ""} />
                </Button>
                <Link className="btn btn-primary" to="/admin/leads/add">
                  <Icon name="plus" className="me-1" />
                  Add Lead
                </Link>
              </div>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>

        <Block>
          <div className="leads-toolbar card card-bordered">
            <div className="card-inner py-3">
              <div className="leads-toolbar-row">
                <div className="leads-toolbar-dates">
                  <label className="form-label">From</label>
                  <input
                    type="date"
                    className="form-control"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="leads-toolbar-dates">
                  <label className="form-label">To</label>
                  <input
                    type="date"
                    className="form-control"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
                <div className="leads-toolbar-presets btn-group">
                  <button
                    type="button"
                    className={`btn btn-dim btn-outline-light ${!startDate && !endDate ? "active" : ""}`}
                    onClick={() => applyPreset("all")}
                  >
                    All
                  </button>
                  <button type="button" className="btn btn-dim btn-outline-light" onClick={() => applyPreset("month")}>
                    This month
                  </button>
                  <button type="button" className="btn btn-dim btn-outline-light" onClick={() => applyPreset("30")}>
                    Last 30 days
                  </button>
                </div>
                <div className="leads-toolbar-meta text-soft">
                  {startDate || endDate
                    ? `${filtered.length} of ${leads.length} leads`
                    : `${leads.length} leads`}
                </div>
              </div>
            </div>
          </div>

          <Row className="g-3 leads-stat-row">
            <Col sm="6" xl="3">
              <StatCard
                label="Total leads"
                value={filtered.length}
                icon="users"
                color="success"
                to={buildListHref("all", startDate, endDate)}
                loading={loading}
              />
            </Col>
            <Col sm="6" xl="3">
              <StatCard
                label="Open"
                value={open}
                icon="clock"
                color="primary"
                to={buildListHref("open", startDate, endDate)}
                loading={loading}
              />
            </Col>
            <Col sm="6" xl="3">
              <StatCard
                label="Converted"
                value={converted}
                icon="check-circle"
                color="warning"
                to={buildListHref("converted", startDate, endDate)}
                loading={loading}
              />
            </Col>
            <Col sm="6" xl="3">
              <StatCard
                label="Conversion rate"
                value={`${rate}%`}
                icon="growth"
                color="danger"
                to={buildListHref("converted", startDate, endDate)}
                loading={loading}
              />
            </Col>
          </Row>

          <Card className="card-bordered leads-pipeline-card">
            <div className="card-inner">
              <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                <h6 className="title mb-0">Pipeline mix</h6>
                <div className="leads-pipeline-legend">
                  {pipelineParts.map((part) => (
                    <span key={part.key}>
                      <i style={{ background: part.color }} />
                      {part.label} {part.count}
                    </span>
                  ))}
                </div>
              </div>
              <div className="leads-pipeline-bar">
                {pipelineParts.map((part) =>
                  part.count > 0 ? (
                    <div
                      key={part.key}
                      title={`${part.label}: ${part.count}`}
                      style={{ width: `${part.pct}%`, background: part.color }}
                    />
                  ) : null
                )}
              </div>
            </div>
          </Card>

          <Row className="g-3">
            <Col lg="7">
              <Card className="card-bordered h-100">
                <div className="card-inner">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h6 className="title mb-0">Recent activity</h6>
                    <Link to={buildListHref("all", startDate, endDate)} className="link link-primary">
                      View all
                    </Link>
                  </div>

                  {loading ? (
                    <div className="text-center py-5">
                      <Spinner color="primary" size="sm" />
                    </div>
                  ) : recent.length === 0 ? (
                    <div className="text-center py-5 text-soft">
                      {leads.length === 0 ? "No leads recorded yet." : "No leads in this date range."}
                    </div>
                  ) : (
                    <div className="table-responsive">
                      <table className="table table-hover align-middle mb-0">
                        <thead className="table-light">
                          <tr>
                            <th>Lead</th>
                            <th>Brought by</th>
                            <th>Status</th>
                            <th className="text-end">When</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recent.map((lead) => {
                            const status = isLeadConverted(lead) ? "converted" : getLeadPipelineStatus(lead);
                            const ticketId = lead.ticketId || lead.ticket_id;
                            return (
                              <tr key={lead.id}>
                                <td>
                                  <Link
                                    to={ticketId ? `/admin/tickets/view/${ticketId}` : "/admin/leads/list"}
                                    className="fw-medium"
                                  >
                                    {lead.name || "—"}
                                  </Link>
                                  <div className="small text-soft">{lead.phone || "No phone"}</div>
                                </td>
                                <td className="text-soft">{getLeadOwner(lead)}</td>
                                <td>
                                  <Badge color={statusTone(status)} className="badge-dim" style={{ textTransform: "capitalize" }}>
                                    {status}
                                  </Badge>
                                </td>
                                <td className="text-soft text-end text-nowrap">
                                  {getLeadActivityTime(lead)?.fromNow() || moment(lead.created_at).fromNow()}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </Card>
            </Col>

            <Col lg="5">
              <Card className="card-bordered h-100">
                <div className="card-inner">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h6 className="title mb-0">{allLeads ? "Top agents" : "Your totals"}</h6>
                    <span className="text-soft small">Selected range</span>
                  </div>

                  {loading ? (
                    <div className="text-center py-5">
                      <Spinner color="primary" size="sm" />
                    </div>
                  ) : topAgents.length === 0 ? (
                    <div className="text-center py-5 text-soft">No agent activity yet.</div>
                  ) : (
                    <div className="table-responsive">
                      <table className="table table-hover align-middle mb-0">
                        <thead className="table-light">
                          <tr>
                            <th>Agent</th>
                            <th className="text-center">Leads</th>
                            <th className="text-center">Open</th>
                            <th className="text-center">Converted</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topAgents.map((row) => (
                            <tr key={row.owner}>
                              <td className="fw-medium">{row.owner}</td>
                              <td className="text-center">{row.total}</td>
                              <td className="text-center text-primary">{row.open}</td>
                              <td className="text-center text-success fw-bold">{row.converted}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </Card>
            </Col>
          </Row>
        </Block>
      </Content>
    </div>
  );
};

const mapStateToProps = (state) => ({ user: state.auth.currentUser });
export default connect(mapStateToProps)(LeadsDashboard);
