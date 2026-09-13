import React, { useCallback, useEffect, useState } from "react";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import DataTable from "react-data-table-component";
import {
  Badge,
  Col,
  FormGroup,
  Input,
  Label,
  Nav,
  NavItem,
  NavLink,
  Row,
  Spinner,
  TabContent,
  TabPane,
} from "reactstrap";
import classnames from "classnames";
import {
  Block,
  BlockBetween,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Button,
  Icon,
  PreviewCard,
} from "../../components/Component";
import MobileAdminAPI from "../../helpers/mobileHttp";
import { toast } from "react-toastify";
import dateFormat from "dateformat";
import { useDataRefresh } from "../../utils/dataRefresh";

const formatWhen = (value) => {
  if (!value) return "—";
  try {
    return dateFormat(new Date(value), "yyyy-mm-dd HH:MM");
  } catch {
    return String(value);
  }
};

const StatCard = ({ label, value, hint, color = "primary" }) => (
  <div className="card card-bordered h-100">
    <div className="card-inner py-3">
      <div className="text-soft small mb-1">{label}</div>
      <div className={`fs-3 fw-bold text-${color}`}>{value ?? "—"}</div>
      {hint ? <div className="text-soft small mt-1">{hint}</div> : null}
    </div>
  </div>
);

const MobileAdmin = () => {
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState(null);
  const [otps, setOtps] = useState([]);
  const [users, setUsers] = useState([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [sessions, setSessions] = useState([]);
  const [logs, setLogs] = useState([]);
  const [userPage, setUserPage] = useState(1);
  const [userSearch, setUserSearch] = useState("");
  const [userOnlineOnly, setUserOnlineOnly] = useState(false);
  const [logType, setLogType] = useState("all");
  const [logPhone, setLogPhone] = useState("");
  const [otpPhone, setOtpPhone] = useState("");
  const [profile, setProfile] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [reload, setReload] = useState(0);

  const bump = () => setReload((n) => n + 1);
  useDataRefresh(bump, { scopes: ["mobile"], onVisible: true });

  const loadOverview = useCallback(async () => {
    const data = await MobileAdminAPI.getOverview();
    setOverview(data);
  }, []);

  const loadOtps = useCallback(async () => {
    const data = await MobileAdminAPI.getRecentOtps(50);
    setOtps(data.items || []);
  }, []);

  const loadUsers = useCallback(async () => {
    const data = await MobileAdminAPI.getUsers({
      page: userPage,
      per_page: 25,
      q: userSearch || undefined,
      has_session: userOnlineOnly ? "1" : undefined,
    });
    setUsers(data.items || []);
    setUsersTotal(data.total || 0);
  }, [userPage, userSearch, userOnlineOnly]);

  const loadSessions = useCallback(async () => {
    const data = await MobileAdminAPI.getSessions({ page: 1, per_page: 50 });
    setSessions(data.items || []);
  }, []);

  const loadLogs = useCallback(async () => {
    const data = await MobileAdminAPI.getAudit({
      type: logType,
      phone: logPhone || undefined,
      limit: 100,
    });
    setLogs(data.items || []);
  }, [logType, logPhone]);

  const refreshTab = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (activeTab === "overview") {
        await Promise.all([loadOverview(), loadSessions()]);
      } else if (activeTab === "otps") {
        await loadOtps();
      } else if (activeTab === "users") {
        await loadUsers();
      } else if (activeTab === "logs") {
        await loadLogs();
      }
    } catch (err) {
      setError(
        err.response?.data?.error || err.message || "Failed to load mobile admin data"
      );
    } finally {
      setLoading(false);
    }
  }, [activeTab, loadOverview, loadOtps, loadUsers, loadSessions, loadLogs]);

  useEffect(() => {
    refreshTab();
  }, [refreshTab, reload]);

  const lookupCustomer = async () => {
    if (!otpPhone.trim()) {
      toast.error("Enter a phone number");
      return;
    }
    setActionBusy(true);
    try {
      const data = await MobileAdminAPI.getCustomer(otpPhone.trim());
      setProfile(data);
      toast.success("Customer loaded");
    } catch (err) {
      setProfile(null);
      toast.error(err.response?.data?.error || "Lookup failed");
    } finally {
      setActionBusy(false);
    }
  };

  const handleResend = async (purpose = "signup", force = false) => {
    const phone = profile?.phone || otpPhone.trim();
    if (!phone) return;
    setActionBusy(true);
    try {
      const result = await MobileAdminAPI.resendOtp({ phone, purpose, force });
      toast.success(
        result.sms?.success
          ? `OTP sent: ${result.otp?.code}`
          : `OTP created but SMS failed: ${result.otp?.code}`
      );
      await lookupCustomer();
      bump();
    } catch (err) {
      toast.error(err.response?.data?.error || "Resend failed");
    } finally {
      setActionBusy(false);
    }
  };

  const handleInvalidate = async () => {
    const phone = profile?.phone || otpPhone.trim();
    if (!phone) return;
    setActionBusy(true);
    try {
      const result = await MobileAdminAPI.invalidateOtp({ phone });
      toast.success(`Invalidated ${result.invalidated || 0} OTP(s)`);
      await lookupCustomer();
      bump();
    } catch (err) {
      toast.error(err.response?.data?.error || "Invalidate failed");
    } finally {
      setActionBusy(false);
    }
  };

  const handleMarkVerified = async () => {
    const phone = profile?.phone || otpPhone.trim();
    if (!phone) return;
    setActionBusy(true);
    try {
      await MobileAdminAPI.markVerified(phone);
      toast.success("Phone marked verified");
      await lookupCustomer();
      bump();
    } catch (err) {
      toast.error(err.response?.data?.error || "Mark verified failed");
    } finally {
      setActionBusy(false);
    }
  };

  const handleRevokeSession = async (id) => {
    if (!window.confirm("Force logout this device session?")) return;
    try {
      await MobileAdminAPI.revokeSession(id);
      toast.success("Session revoked");
      bump();
    } catch (err) {
      toast.error(err.response?.data?.error || "Revoke failed");
    }
  };

  const handleRevokeUser = async (id) => {
    if (!window.confirm("Force logout all sessions for this app user?")) return;
    try {
      const result = await MobileAdminAPI.revokeUserSessions(id);
      toast.success(`Revoked ${result.revoked || 0} session(s)`);
      bump();
    } catch (err) {
      toast.error(err.response?.data?.error || "Revoke failed");
    }
  };

  const otpColumns = [
    {
      name: "When",
      selector: (row) => formatWhen(row.createdAt),
      width: "140px",
    },
    {
      name: "Phone",
      selector: (row) => row.phone,
      wrap: true,
    },
    {
      name: "Customer",
      selector: (row) => row.customerName || "—",
      wrap: true,
    },
    {
      name: "Code",
      cell: (row) => <code>{row.code}</code>,
      width: "90px",
    },
    {
      name: "Purpose",
      selector: (row) => row.purpose,
      width: "120px",
    },
    {
      name: "Status",
      cell: (row) => {
        if (row.active) return <Badge color="success">Active</Badge>;
        if (row.verified) return <Badge color="info">Used</Badge>;
        if (row.locked) return <Badge color="danger">Locked</Badge>;
        if (row.expired) return <Badge color="secondary">Expired</Badge>;
        return <Badge color="light">—</Badge>;
      },
      width: "100px",
    },
    {
      name: "Attempts",
      selector: (row) => `${row.attempts}/${row.maxAttempts}`,
      width: "90px",
    },
  ];

  const userColumns = [
    {
      name: "Phone",
      selector: (row) => row.phone,
      wrap: true,
    },
    {
      name: "Name",
      selector: (row) => row.customerName || "—",
      wrap: true,
    },
    {
      name: "Status",
      cell: (row) => (
        <>
          {row.online ? <Badge color="success" className="me-1">Online</Badge> : null}
          {row.phoneVerified ? <Badge color="info">Verified</Badge> : <Badge color="warning">Unverified</Badge>}
        </>
      ),
      width: "160px",
    },
    {
      name: "Sessions",
      selector: (row) => row.activeSessions,
      width: "90px",
    },
    {
      name: "Last login",
      selector: (row) => formatWhen(row.lastLogin),
      width: "140px",
    },
    {
      name: "Registered",
      selector: (row) => formatWhen(row.createdAt),
      width: "140px",
    },
    {
      name: "Actions",
      cell: (row) =>
        row.activeSessions > 0 ? (
          <Button size="sm" color="danger" outline onClick={() => handleRevokeUser(row.id)}>
            Logout
          </Button>
        ) : (
          "—"
        ),
      width: "100px",
    },
  ];

  const sessionColumns = [
    { name: "Phone", selector: (row) => row.phone, wrap: true },
    {
      name: "Device",
      selector: (row) => row.deviceInfo || "—",
      wrap: true,
      grow: 2,
    },
    { name: "IP", selector: (row) => row.ipAddress || "—", width: "120px" },
    { name: "Started", selector: (row) => formatWhen(row.createdAt), width: "140px" },
    { name: "Expires", selector: (row) => formatWhen(row.expiresAt), width: "140px" },
    {
      name: "Actions",
      cell: (row) => (
        <Button size="sm" color="danger" outline onClick={() => handleRevokeSession(row.id)}>
          Revoke
        </Button>
      ),
      width: "100px",
    },
  ];

  const logColumns = [
    { name: "When", selector: (row) => formatWhen(row.createdAt), width: "140px" },
    {
      name: "Type",
      cell: (row) => (
        <Badge color={row.kind === "auth" ? "primary" : "secondary"}>
          {(row.kind || "otp").toUpperCase()}
        </Badge>
      ),
      width: "80px",
    },
    { name: "Phone", selector: (row) => row.phone || "—", wrap: true },
    {
      name: "Action",
      selector: (row) => row.actionLabel || row.action,
      wrap: true,
      grow: 2,
    },
    {
      name: "Detail",
      selector: (row) => row.detail || row.smsError || "—",
      wrap: true,
      grow: 2,
    },
    { name: "Source", selector: (row) => row.source || "—", width: "80px" },
    { name: "IP", selector: (row) => row.ipAddress || "—", width: "110px" },
  ];

  return (
    <React.Fragment>
      <Head title="Mobile App" />
      <Content>
        <BlockHead size="sm">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle page>Mobile App</BlockTitle>
            </BlockHeadContent>
            <BlockHeadContent>
              <Button color="primary" outline onClick={bump} disabled={loading}>
                <Icon name="reload" />
                <span>Refresh</span>
              </Button>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>

        {error ? (
          <div className="alert alert-danger">{error}</div>
        ) : null}

        <PreviewCard>
          <Nav tabs className="mb-3">
            {[
              { id: "overview", label: "Overview" },
              { id: "otps", label: "OTPs" },
              { id: "users", label: "App users" },
              { id: "logs", label: "Logs" },
            ].map((tab) => (
              <NavItem key={tab.id}>
                <NavLink
                  className={classnames({ active: activeTab === tab.id })}
                  href="#tab"
                  onClick={(e) => {
                    e.preventDefault();
                    setActiveTab(tab.id);
                  }}
                >
                  {tab.label}
                </NavLink>
              </NavItem>
            ))}
          </Nav>

          {loading ? (
            <div className="text-center py-4">
              <Spinner color="primary" />
            </div>
          ) : null}

          <TabContent activeTab={activeTab}>
            <TabPane tabId="overview">
              {overview ? (
                <>
                  <Row className="g-3 mb-4">
                    <Col sm="6" lg="3">
                      <StatCard label="Registered" value={overview.registered} hint={`${overview.registeredToday || 0} today`} color="primary" />
                    </Col>
                    <Col sm="6" lg="3">
                      <StatCard label="Logged in now" value={overview.loggedInUsers} hint={`${overview.activeSessions || 0} sessions`} color="success" />
                    </Col>
                    <Col sm="6" lg="3">
                      <StatCard label="Verified phones" value={overview.verified} hint={`${overview.withPassword || 0} with password`} color="info" />
                    </Col>
                    <Col sm="6" lg="3">
                      <StatCard
                        label="OTPs today"
                        value={overview.otps?.today?.total || 0}
                        hint={`${overview.otps?.pendingOtps || 0} pending · ${overview.otps?.smsFailedToday || 0} SMS fail`}
                        color="warning"
                      />
                    </Col>
                  </Row>
                  <Row className="g-3 mb-4">
                    <Col sm="6" lg="3">
                      <StatCard label="Logins today" value={overview.loginsToday} />
                    </Col>
                    <Col sm="6" lg="3">
                      <StatCard label="Active last 7 days" value={overview.activeLast7Days} />
                    </Col>
                    <Col sm="6" lg="3">
                      <StatCard label="Push devices" value={overview.pushDevices} />
                    </Col>
                    <Col sm="6" lg="3">
                      <StatCard label="Signup OTPs today" value={overview.otps?.today?.signup || 0} />
                    </Col>
                  </Row>
                  <h6 className="title mb-2">Live sessions</h6>
                  <DataTable
                    data={sessions}
                    columns={sessionColumns}
                    noHeader
                    pagination={false}
                    dense
                    persistTableHead
                  />
                </>
              ) : null}
            </TabPane>

            <TabPane tabId="otps">
              <Row className="g-3 mb-3 align-items-end">
                <Col md="5">
                  <FormGroup className="mb-0">
                    <Label>Lookup phone</Label>
                    <Input
                      value={otpPhone}
                      onChange={(e) => setOtpPhone(e.target.value)}
                      placeholder="07... or +254..."
                      onKeyDown={(e) => e.key === "Enter" && lookupCustomer()}
                    />
                  </FormGroup>
                </Col>
                <Col md="7" className="d-flex flex-wrap gap-2">
                  <Button color="primary" onClick={lookupCustomer} disabled={actionBusy}>
                    Lookup
                  </Button>
                  <Button color="success" outline onClick={() => handleResend("signup")} disabled={actionBusy}>
                    Resend signup OTP
                  </Button>
                  <Button color="warning" outline onClick={() => handleResend("password_reset")} disabled={actionBusy}>
                    Resend reset OTP
                  </Button>
                  <Button color="secondary" outline onClick={handleInvalidate} disabled={actionBusy}>
                    Invalidate pending
                  </Button>
                  <Button color="info" outline onClick={handleMarkVerified} disabled={actionBusy}>
                    Mark verified
                  </Button>
                </Col>
              </Row>

              {profile ? (
                <div className="alert alert-light border mb-3">
                  <strong>{profile.customer?.name || "Unknown customer"}</strong>
                  {" · "}
                  {profile.phone}
                  {profile.appUser ? (
                    <>
                      {" · "}
                      App user #{profile.appUser.id}
                      {" · "}
                      {profile.appUser.activeSessions || 0} session(s)
                      {" · "}
                      Last login {formatWhen(profile.appUser.lastLogin)}
                    </>
                  ) : (
                    " · Not registered on app yet"
                  )}
                  {profile.activeOtp ? (
                    <div className="mt-1">
                      Active OTP: <code>{profile.activeOtp.code}</code> ({profile.activeOtp.purpose})
                    </div>
                  ) : null}
                </div>
              ) : null}

              <h6 className="title mb-2">Recent OTPs</h6>
              <DataTable data={otps} columns={otpColumns} noHeader pagination dense persistTableHead />
            </TabPane>

            <TabPane tabId="users">
              <Row className="g-3 mb-3 align-items-end">
                <Col md="5">
                  <FormGroup className="mb-0">
                    <Label>Search phone / customer id</Label>
                    <Input
                      value={userSearch}
                      onChange={(e) => {
                        setUserPage(1);
                        setUserSearch(e.target.value);
                      }}
                      placeholder="Search..."
                    />
                  </FormGroup>
                </Col>
                <Col md="4">
                  <FormGroup check className="mb-0 mt-4">
                    <Input
                      type="checkbox"
                      id="onlineOnly"
                      checked={userOnlineOnly}
                      onChange={(e) => {
                        setUserPage(1);
                        setUserOnlineOnly(e.target.checked);
                      }}
                    />
                    <Label check for="onlineOnly">
                      Online only
                    </Label>
                  </FormGroup>
                </Col>
              </Row>
              <DataTable
                data={users}
                columns={userColumns}
                noHeader
                pagination
                paginationServer
                paginationTotalRows={usersTotal}
                paginationPerPage={25}
                paginationDefaultPage={userPage}
                onChangePage={(p) => setUserPage(p)}
                dense
                persistTableHead
              />
            </TabPane>

            <TabPane tabId="logs">
              <Row className="g-3 mb-3 align-items-end">
                <Col md="3">
                  <FormGroup className="mb-0">
                    <Label>Type</Label>
                    <Input type="select" value={logType} onChange={(e) => setLogType(e.target.value)}>
                      <option value="all">All</option>
                      <option value="otp">OTP</option>
                      <option value="auth">Login / auth</option>
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="5">
                  <FormGroup className="mb-0">
                    <Label>Filter phone</Label>
                    <Input
                      value={logPhone}
                      onChange={(e) => setLogPhone(e.target.value)}
                      placeholder="Optional phone filter"
                    />
                  </FormGroup>
                </Col>
                <Col md="2">
                  <Button color="primary" onClick={loadLogs}>
                    Apply
                  </Button>
                </Col>
              </Row>
              <DataTable data={logs} columns={logColumns} noHeader pagination dense persistTableHead />
            </TabPane>
          </TabContent>
        </PreviewCard>
      </Content>
    </React.Fragment>
  );
};

export default MobileAdmin;
