import React, { useState, useEffect, useCallback } from "react";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import {
  Card, Badge, Spinner, Table, Button, Input, Alert,
  Modal, ModalHeader, ModalBody,
} from "reactstrap";
import { Block, BlockHead, BlockHeadContent, BlockTitle, Row, Col, Icon } from "../../components/Component";
import HotspotAPI from "../../helpers/HotspotAPI";

const formatBytes = (bytes) => {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, Math.min(i, 4))).toFixed(2) + " " + units[Math.min(i, 4)];
};

const formatDuration = (seconds) => {
  if (!seconds || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const HotspotUserTracker = () => {
  const [users, setUsers] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("tracking"); // tracking | online
  const [detailModal, setDetailModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(null);
  const [stats, setStats] = useState(null);

  const fetchUsers = useCallback(async () => {
    try {
      const params = {};
      if (search) params.search = search;
      const [usersRes, onlineRes, statsRes] = await Promise.all([
        HotspotAPI.getActiveUsers(params),
        HotspotAPI.getOnlineUsers(),
        HotspotAPI.getUserTrackerStats(),
      ]);
      if (usersRes.success) setUsers(usersRes.data || []);
      if (onlineRes.success) setOnlineUsers(onlineRes.data || []);
      if (statsRes.success) setStats(statsRes.data || null);
    } catch (e) {
      console.error("User tracker fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchUsers();
    const interval = setInterval(fetchUsers, 15000);
    return () => clearInterval(interval);
  }, [fetchUsers]);

  const handleSearch = (e) => {
    e.preventDefault();
    setLoading(true);
    fetchUsers();
  };

  const viewUserDetail = async (user) => {
    setSelectedUser(user);
    setDetailModal(true);
    setDetailLoading(true);
    try {
      const res = await HotspotAPI.getUserDetail({
        username: user.username,
        phone: user.phone_number,
      });
      if (res.success) setDetailData(res.data);
    } catch (e) {
      console.error("Detail fetch error:", e);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDisconnect = async (username) => {
    if (!window.confirm(`Disconnect user "${username}"?`)) return;
    setDisconnecting(username);
    try {
      await HotspotAPI.disconnectUser(username);
      fetchUsers();
    } catch (e) {
      console.error("Disconnect error:", e);
    } finally {
      setDisconnecting(null);
    }
  };

  const isExpired = (expiresAt) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const isActive = (expiresAt) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) > new Date();
  };

  return (
    <React.Fragment>
      <Head title="User Tracking" />
      <Content>
        <BlockHead size="sm">
          <div className="d-flex align-items-center justify-content-between">
            <BlockHeadContent>
              <BlockTitle page tag="h4">User Tracking</BlockTitle>
            </BlockHeadContent>
            <div className="d-flex gap-2">
              <Button size="sm" color={activeTab === "tracking" ? "primary" : "outline-primary"}
                onClick={() => setActiveTab("tracking")}>
                <Icon name="users" className="me-1" />Purchased Users
              </Button>
              <Button size="sm" color={activeTab === "online" ? "success" : "outline-success"}
                onClick={() => setActiveTab("online")}>
                <Icon name="wifi" className="me-1" />Active Sessions ({onlineUsers.length})
              </Button>
            </div>
          </div>
        </BlockHead>

        {/* ══════ SEARCH CARD ══════ */}
        <Card className="shadow-sm border-0 mb-4" style={{ borderRadius: 12 }}>
          <div className="card-body">
            <form onSubmit={handleSearch}>
              <Row className="g-2 align-items-end">
                <Col xs="12" md="9">
                  <label className="form-label small">Search by username, phone, receipt, or checkout ID</label>
                  <Input
                    type="text"
                    placeholder="M5184007585 / 07XXXXXXXX / ws_CO_..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </Col>
                <Col xs="12" md="3">
                  <Button color="primary" className="w-100" type="submit">
                    <Icon name="search" className="me-1" />Search
                  </Button>
                </Col>
              </Row>
            </form>
          </div>
        </Card>

        {/* ══════ INFO ALERT ══════ */}
        {!search && activeTab === "tracking" && (
          <Alert color="info" className="border-0">
            <Icon name="info" className="me-1" />
            Showing latest purchased users. Use the search to find specific users.
          </Alert>
        )}

        {loading ? (
          <div className="text-center py-5">
            <Spinner color="primary" />
            <p className="mt-2">Loading users...</p>
          </div>
        ) : activeTab === "tracking" ? (
          /* ══════ USER TRACKING TABLE ══════ */
          <Card className="shadow-sm border-0" style={{ borderRadius: 12 }}>
            <div className="card-header bg-white border-0 py-3">
              <h6 className="mb-0">User Tracking</h6>
              <small className="text-muted">{users.length} user(s) found</small>
            </div>
            <div className="card-body p-0">
              {/* Desktop table */}
              <div className="table-responsive d-none d-md-block">
                <Table size="sm" striped hover className="mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Purchase Date</th>
                      <th>Username</th>
                      <th>Phone</th>
                      <th>Package</th>
                      <th>Amount</th>
                      <th>Receipt</th>
                      <th>Group</th>
                      <th>Status</th>
                      <th>Session Start</th>
                      <th>Expected End</th>
                      <th>Last Session</th>
                      <th>Total Data</th>
                      <th>Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0 ? (
                      <tr><td colSpan="14" className="text-center py-4 text-muted">No users found</td></tr>
                    ) : users.map((u, i) => {
                      const isOnline = u.is_online === true || (u.radius_session?.active_sessions || 0) > 0;
                      const earlyEnd = u.radius_session?.ended_early;
                      const expectedEnd = u.radius_session?.expected_end || u.expires_at;
                      return (
                        <tr key={i}
                          className={earlyEnd ? "table-danger" : ""}
                          style={{ cursor: "pointer" }}
                          onClick={() => viewUserDetail(u)}>
                          <td><small>{u.created_at ? new Date(u.created_at).toLocaleString() : "—"}</small></td>
                          <td><code className="fw-bold">{u.username || "—"}</code></td>
                          <td>{u.phone_number || "—"}</td>
                          <td>{u.package_type || "—"}</td>
                          <td>{u.amount ? `KES ${Number(u.amount).toLocaleString()}` : "—"}</td>
                          <td><small>{u.mpesa_receipt_number || "—"}</small></td>
                          <td>{u.radius_group || u.radius_session?.group || "N/A"}</td>
                          <td>
                            <Badge color={isOnline ? "success" : "secondary"}>
                              {isOnline ? "Active" : "Inactive"}
                            </Badge>
                          </td>
                          <td><small>{u.radius_session?.start || "—"}</small></td>
                          <td>
                            <small>{expectedEnd ? new Date(expectedEnd).toLocaleString() : "—"}</small>
                            {earlyEnd && <div className="small text-danger">Ended early</div>}
                          </td>
                          <td>{u.radius_session?.session_time ? formatDuration(u.radius_session.session_time) : "—"}</td>
                          <td>{u.radius_session?.total_bytes ? formatBytes(u.radius_session.total_bytes) : "—"}</td>
                          <td>
                            <small>
                              {u.location && u.location !== "Unverified MACs"
                                ? <><span className="me-1">📍</span>{u.location}</>
                                : <span className="text-muted fst-italic">{u.location || "—"}</span>}
                            </small>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>

              {/* Mobile card view */}
              <div className="d-md-none p-3">
                {users.length === 0 ? (
                  <p className="text-center text-muted py-4">No users found</p>
                ) : users.map((u, i) => {
                  const isOnline = u.is_online === true || (u.radius_session?.active_sessions || 0) > 0;
                  const earlyEnd = u.radius_session?.ended_early;
                  const expectedEnd = u.radius_session?.expected_end || u.expires_at;
                  return (
                    <Card key={i}
                      className={`mb-3 shadow-sm ${earlyEnd ? "border border-danger" : "border-0"}`}
                      style={{ borderRadius: 10, cursor: "pointer" }}
                      onClick={() => viewUserDetail(u)}>
                      <div className="card-body p-3">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <code className="fw-bold">{u.username || "—"}</code>
                          <Badge color={isOnline ? "success" : "secondary"}>
                            {isOnline ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <Row className="g-2">
                          {[
                            ["Phone", u.phone_number],
                            ["Package", u.package_type],
                            ["Amount", u.amount ? `KES ${Number(u.amount).toLocaleString()}` : "—"],
                            ["Receipt", u.mpesa_receipt_number],
                            ["Group", u.radius_group || "N/A"],
                            ["Purchase", u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"],
                            ["Session Start", u.radius_session?.start || "—"],
                            ["Expected End", expectedEnd ? new Date(expectedEnd).toLocaleString() : "—"],
                            ["Last Session", u.radius_session?.session_time ? formatDuration(u.radius_session.session_time) : "—"],
                            ["Total Data", u.radius_session?.total_bytes ? formatBytes(u.radius_session.total_bytes) : "—"],
                            ["Location", u.location || "—"],
                          ].map(([label, val], j) => (
                            <Col xs="6" key={j}>
                              <div style={{ fontSize: "0.72rem", textTransform: "uppercase", color: "#6c757d", letterSpacing: "0.5px" }}>
                                {label}
                              </div>
                              <div style={{ fontSize: "0.9rem" }}>{val || "—"}</div>
                            </Col>
                          ))}
                        </Row>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          </Card>
        ) : (
          /* ══════ ACTIVE SESSIONS TABLE ══════ */
          <Card className="shadow-sm border-0" style={{ borderRadius: 12 }}>
            <div className="card-header bg-white border-0 py-3">
              <h6 className="mb-0">Active Hotspot Sessions</h6>
              <small className="text-muted">Currently connected users from FreeRADIUS</small>
            </div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <Table size="sm" striped hover className="mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Username</th>
                      <th>IP Address</th>
                      <th>MAC Address</th>
                      <th>NAS/Router</th>
                      <th>Started</th>
                      <th>Session Time</th>
                      <th>Download</th>
                      <th>Upload</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {onlineUsers.length === 0 ? (
                      <tr><td colSpan="9" className="text-center py-4 text-muted">No active sessions</td></tr>
                    ) : onlineUsers.map((u, i) => (
                      <tr key={i}>
                        <td className="fw-bold">{u.username}</td>
                        <td>{u.framedipaddress || "—"}</td>
                        <td><code className="small">{u.callingstationid || "—"}</code></td>
                        <td>
                          {u.nasipaddress || "—"}
                          {u.nasidentifier && <div className="text-muted" style={{ fontSize: "0.7rem" }}>{u.nasidentifier}</div>}
                        </td>
                        <td><small>{u.acctstarttime ? new Date(u.acctstarttime).toLocaleString() : "—"}</small></td>
                        <td>{u.acctsessiontime ? formatDuration(u.acctsessiontime) : "—"}</td>
                        <td className="text-success">
                          <Icon name="download" className="me-1" style={{ fontSize: "0.7rem" }} />
                          {formatBytes(u.acctinputoctets || 0)}
                        </td>
                        <td className="text-primary">
                          <Icon name="upload" className="me-1" style={{ fontSize: "0.7rem" }} />
                          {formatBytes(u.acctoutputoctets || 0)}
                        </td>
                        <td>
                          <Button size="sm" color="danger"
                            disabled={disconnecting === u.username}
                            onClick={(e) => { e.stopPropagation(); handleDisconnect(u.username); }}>
                            {disconnecting === u.username ? <Spinner size="sm" /> : (
                              <><Icon name="cross-circle" className="me-1" />Disconnect</>
                            )}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
              {onlineUsers.length > 0 && (
                <div className="card-footer bg-light text-center py-2">
                  <strong>Total Active Sessions: {onlineUsers.length}</strong>
                </div>
              )}
            </div>

            {/* Session Detail Cards */}
            {onlineUsers.length > 0 && (
              <div className="p-3">
                <Row className="g-3">
                  {onlineUsers.map((u, i) => (
                    <Col md="6" key={i}>
                      <Card className="border shadow-sm" style={{ borderRadius: 8 }}>
                        <div className="card-body p-3">
                          <h6 className="mb-1">{u.username}</h6>
                          <div className="small text-muted mb-2">Session Details</div>
                          <Row className="g-1">
                            {[
                              ["IP", u.framedipaddress],
                              ["MAC", u.callingstationid],
                              ["NAS", u.nasipaddress],
                              ["Started", u.acctstarttime ? new Date(u.acctstarttime).toLocaleString() : "—"],
                              ["Session", formatDuration(u.acctsessiontime || 0)],
                              ["Session ID", u.acctsessionid ? u.acctsessionid.substring(0, 16) + "..." : "—"],
                            ].map(([label, val], j) => (
                              <Col xs="6" key={j}>
                                <span className="text-muted" style={{ fontSize: "0.7rem", textTransform: "uppercase" }}>{label}</span>
                                <div style={{ fontSize: "0.85rem" }}>{val || "—"}</div>
                              </Col>
                            ))}
                          </Row>
                        </div>
                      </Card>
                    </Col>
                  ))}
                </Row>
              </div>
            )}
          </Card>
        )}

        {/* ══════ STATS: TOP USERS ══════ */}
        {stats && stats.top_users && stats.top_users.length > 0 && (
          <Card className="border-0 shadow-sm mt-4" style={{ borderRadius: 12 }}>
            <div className="card-body">
              <h6 className="mb-3"><Icon name="bar-chart" className="me-1" />Top Users Today (by Data)</h6>
              <div className="table-responsive">
                <Table size="sm" className="mb-0">
                  <thead className="table-light">
                    <tr><th>#</th><th>Username</th><th>Total Data</th><th>Sessions</th></tr>
                  </thead>
                  <tbody>
                    {stats.top_users.map((u, i) => (
                      <tr key={i}>
                        <td><Badge color={i < 3 ? "success" : "secondary"}>{i + 1}</Badge></td>
                        <td className="fw-bold">{u.username}</td>
                        <td>{formatBytes(u.total_bytes || 0)}</td>
                        <td>{u.session_count || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </div>
          </Card>
        )}

        {/* ══════ USER DETAIL MODAL ══════ */}
        <Modal isOpen={detailModal} toggle={() => setDetailModal(false)} size="lg">
          <ModalHeader toggle={() => setDetailModal(false)}>
            User Detail — {selectedUser?.username || ""}
          </ModalHeader>
          <ModalBody>
            {detailLoading ? (
              <div className="text-center py-4"><Spinner color="primary" /></div>
            ) : detailData ? (
              <>
                {/* User Info */}
                <Card className="border mb-3" style={{ borderRadius: 8 }}>
                  <div className="card-body">
                    <h6>User Information</h6>
                    <Row className="g-2">
                      {[
                        ["Username", detailData.user?.username],
                        ["Phone", detailData.user?.phone_number],
                        ["Package", detailData.user?.package_type],
                        ["Created", detailData.user?.created_at],
                        ["Expires", detailData.user?.expires_at],
                        ["MAC", detailData.user?.mac_address],
                      ].map(([label, val], i) => (
                        <Col xs="6" md="4" key={i}>
                          <div className="text-muted small text-uppercase">{label}</div>
                          <div>{val || "—"}</div>
                        </Col>
                      ))}
                    </Row>
                  </div>
                </Card>

                {/* RADIUS Attributes */}
                {detailData.radius_check && detailData.radius_check.length > 0 && (
                  <Card className="border mb-3" style={{ borderRadius: 8 }}>
                    <div className="card-body">
                      <h6>RADIUS Check Attributes</h6>
                      <Table size="sm" className="mb-0">
                        <thead className="table-light"><tr><th>Attribute</th><th>Op</th><th>Value</th></tr></thead>
                        <tbody>
                          {detailData.radius_check.map((a, i) => (
                            <tr key={i}>
                              <td>{a.attribute}</td><td>{a.op}</td><td><code>{a.value}</code></td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  </Card>
                )}

                {detailData.radius_reply && detailData.radius_reply.length > 0 && (
                  <Card className="border mb-3" style={{ borderRadius: 8 }}>
                    <div className="card-body">
                      <h6>RADIUS Reply Attributes</h6>
                      <Table size="sm" className="mb-0">
                        <thead className="table-light"><tr><th>Attribute</th><th>Op</th><th>Value</th></tr></thead>
                        <tbody>
                          {detailData.radius_reply.map((a, i) => (
                            <tr key={i}>
                              <td>{a.attribute}</td><td>{a.op}</td><td><code>{a.value}</code></td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  </Card>
                )}

                {/* Session History */}
                {detailData.sessions && detailData.sessions.length > 0 && (
                  <Card className="border mb-3" style={{ borderRadius: 8 }}>
                    <div className="card-body">
                      <h6>Session History</h6>
                      <div className="table-responsive">
                        <Table size="sm" className="mb-0">
                          <thead className="table-light">
                            <tr><th>Start</th><th>Stop</th><th>Duration</th><th>Download</th><th>Upload</th><th>IP</th></tr>
                          </thead>
                          <tbody>
                            {detailData.sessions.map((sess, i) => (
                              <tr key={i}>
                                <td><small>{sess.acctstarttime ? new Date(sess.acctstarttime).toLocaleString() : "—"}</small></td>
                                <td><small>{sess.acctstoptime ? new Date(sess.acctstoptime).toLocaleString() : <Badge color="success">Online</Badge>}</small></td>
                                <td>{formatDuration(sess.acctsessiontime || 0)}</td>
                                <td className="text-success">{formatBytes(sess.acctinputoctets || 0)}</td>
                                <td className="text-primary">{formatBytes(sess.acctoutputoctets || 0)}</td>
                                <td>{sess.framedipaddress || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      </div>
                    </div>
                  </Card>
                )}

                {/* Payment History */}
                {detailData.payments && detailData.payments.length > 0 && (
                  <Card className="border" style={{ borderRadius: 8 }}>
                    <div className="card-body">
                      <h6>Payment History</h6>
                      <div className="table-responsive">
                        <Table size="sm" className="mb-0">
                          <thead className="table-light">
                            <tr><th>Date</th><th>Amount</th><th>Package</th><th>Receipt</th><th>Status</th></tr>
                          </thead>
                          <tbody>
                            {detailData.payments.map((p, i) => (
                              <tr key={i}>
                                <td><small>{p.created_at ? new Date(p.created_at).toLocaleString() : "—"}</small></td>
                                <td className="fw-bold">KES {Number(p.amount || 0).toLocaleString()}</td>
                                <td>{p.package_type || "—"}</td>
                                <td><small>{p.mpesa_receipt_number || "—"}</small></td>
                                <td><Badge color={statusColors[p.status] || "secondary"}>{p.status}</Badge></td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      </div>
                    </div>
                  </Card>
                )}
              </>
            ) : (
              <p className="text-muted text-center py-3">No detail data available</p>
            )}
          </ModalBody>
        </Modal>
      </Content>
    </React.Fragment>
  );
};

const statusColors = {
  completed: "success",
  success: "success",
  pending: "warning",
  failed: "danger",
  cancelled: "danger",
};

export default HotspotUserTracker;
