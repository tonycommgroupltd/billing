import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  Input,
  InputGroup,
  InputGroupText,
  Spinner,
  Table,
} from "reactstrap";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import {
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Button,
  Icon,
} from "../../components/Component";
import HotspotAPI from "../../helpers/HotspotAPI";
import HotspotNav from "./HotspotNav";
import "./hotspot.css";

const HotspotUsers = () => {
  const [users, setUsers] = useState([]);
  const [routers, setRouters] = useState([]);
  const [meta, setMeta] = useState({ page: 1, last_page: 1, total: 0 });
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [routerId, setRouterId] = useState("");
  const [loading, setLoading] = useState(true);
  const [changingId, setChangingId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadUsers = useCallback(async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const response = await HotspotAPI.getUsers({
        page,
        per_page: 25,
        search: appliedSearch || undefined,
        status: status || undefined,
      });
      setUsers(Array.isArray(response.data) ? response.data : []);
      setMeta(response.meta || { page, last_page: 1, total: 0 });
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not load hotspot users.");
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, status]);

  useEffect(() => {
    HotspotAPI.getRouters()
      .then((response) => {
        const list = Array.isArray(response.data) ? response.data : [];
        setRouters(list);
        if (list.length === 1) setRouterId(String(list[0].id));
      })
      .catch(() => setRouters([]));
  }, []);

  useEffect(() => {
    loadUsers(1);
  }, [loadUsers]);

  const submitSearch = (event) => {
    event.preventDefault();
    setAppliedSearch(search.trim());
  };

  const toggleUser = async (user) => {
    const disable = !Boolean(Number(user.is_disabled));
    const verb = disable ? "disable" : "enable";
    if (!window.confirm(`Are you sure you want to ${verb} ${user.username}?`)) return;

    setChangingId(user.id);
    setError("");
    setMessage("");
    try {
      await HotspotAPI.setUserStatus({
        user_id: user.id,
        disabled: disable,
        router_id: routerId || undefined,
      });
      setMessage(`${user.username} was ${disable ? "disabled and disconnected" : "enabled"}.`);
      await loadUsers(meta.page || 1);
    } catch (requestError) {
      setError(requestError.response?.data?.error || `Could not ${verb} this user.`);
    } finally {
      setChangingId(null);
    }
  };

  return (
    <>
      <Head title="Hotspot users" />
      <Content>
        <BlockHead size="sm">
          <BlockHeadContent>
            <BlockTitle page>Hotspot users</BlockTitle>
          </BlockHeadContent>
        </BlockHead>
        <HotspotNav />

        {error && <Alert color="danger">{error}</Alert>}
        {message && <Alert color="success">{message}</Alert>}

        <Card className="hotspot-stat-card">
          <CardBody>
            <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
              <form onSubmit={submitSearch} style={{ minWidth: 260, flex: "1 1 320px", maxWidth: 480 }}>
                <InputGroup>
                  <InputGroupText><Icon name="search" /></InputGroupText>
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search username, phone, or router"
                  />
                  <Button color="primary" type="submit">Search</Button>
                </InputGroup>
              </form>
              <div className="d-flex gap-2 flex-wrap">
                <Input type="select" value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="">All statuses</option>
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                  <option value="expired">Expired</option>
                </Input>
                <Input
                  type="select"
                  value={routerId}
                  onChange={(event) => setRouterId(event.target.value)}
                  title="Router used for management actions"
                >
                  <option value="">Auto-detect router</option>
                  {routers.map((router) => (
                    <option key={router.id} value={router.id}>
                      {router.display_name || router.name}
                    </option>
                  ))}
                </Input>
              </div>
            </div>

            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="text-soft">{meta.total || 0} users</span>
              {loading && <Spinner size="sm" color="primary" />}
            </div>
            <div className="table-responsive">
              <Table hover className="hotspot-table align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>User</th><th>Phone</th><th>Package</th><th>Router</th>
                    <th>Expires</th><th>Status</th><th className="text-end">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {!loading && users.length === 0 ? (
                    <tr><td colSpan="7" className="text-center text-soft py-5">No hotspot users matched the filters.</td></tr>
                  ) : users.map((user) => {
                    const expired = user.status === "expired" ||
                      (user.expires_at && new Date(user.expires_at).getTime() <= Date.now());
                    const disabled = Boolean(Number(user.is_disabled));
                    return (
                      <tr key={user.id}>
                        <td>
                          <div className="fw-semibold">{user.username}</div>
                          <small className="text-soft">{user.mac_address || "No MAC"}</small>
                        </td>
                        <td>{user.phone_number || "-"}</td>
                        <td>{user.package_type || user.profile || "-"}</td>
                        <td>
                          <div>{user.router_name || "-"}</div>
                          {user.platform_label ? <small className="text-soft">{user.platform_label}</small> : null}
                        </td>
                        <td>{user.expires_at ? new Date(user.expires_at).toLocaleString() : "Never"}</td>
                        <td>
                          <Badge color={expired ? "secondary" : disabled ? "danger" : "success"}>
                            {expired ? "Expired" : disabled ? "Disabled" : "Active"}
                          </Badge>
                        </td>
                        <td className="text-end">
                          <Button
                            size="sm"
                            color={disabled ? "success" : "danger"}
                            outline
                            disabled={changingId === user.id || (expired && disabled)}
                            onClick={() => toggleUser(user)}
                          >
                            {changingId === user.id && <Spinner size="sm" className="me-1" />}
                            {disabled ? "Enable" : "Disable"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>

            <div className="d-flex justify-content-between align-items-center mt-3">
              <Button
                color="light"
                disabled={loading || Number(meta.page) <= 1}
                onClick={() => loadUsers(Number(meta.page) - 1)}
              >
                Previous
              </Button>
              <span className="small text-soft">Page {meta.page || 1} of {meta.last_page || 1}</span>
              <Button
                color="light"
                disabled={loading || Number(meta.page) >= Number(meta.last_page)}
                onClick={() => loadUsers(Number(meta.page) + 1)}
              >
                Next
              </Button>
            </div>
          </CardBody>
        </Card>
      </Content>
    </>
  );
};

export default HotspotUsers;
