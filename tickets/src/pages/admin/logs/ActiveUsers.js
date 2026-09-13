import React, { useState, useEffect, useCallback } from 'react';
import { connect } from 'react-redux';
import { Link } from 'react-router-dom';
import Head from '../../../layout/head/Head';
import Content from '../../../layout/content/Content';
import { Card, Row, Col, Badge, Table } from 'reactstrap';
import { Block, BlockBetween, BlockHead, BlockHeadContent, BlockTitle, Button, Icon } from '../../../components/Component';
import moment from 'moment';
import PresenceAPI from '../../../helpers/PresenceAPI';

const roleBadgeColor = (role) => {
  const r = (role || '').toLowerCase();
  if (r.includes('admin') || r.includes('super')) return 'danger';
  if (r === 'manager') return 'warning';
  if (r === 'engineer') return 'info';
  if (r === 'technician') return 'primary';
  return 'secondary';
};

const formatRoles = (roles) => {
  if (!Array.isArray(roles) || !roles.length) return '—';
  return roles.map((role) => (
    <Badge key={role} color={roleBadgeColor(role)} className="me-1 mb-1" pill>
      {role}
    </Badge>
  ));
};

const deviceLabel = (row) => {
  if (row.device_label) return row.device_label;
  if (row.device_type || row.browser) {
    const type = row.device_type
      ? row.device_type.charAt(0).toUpperCase() + row.device_type.slice(1)
      : 'Device';
    return row.browser ? `${type} · ${row.browser}` : type;
  }
  if (row.last_seen_at) return 'Unknown device';
  return 'Never signed in';
};

const ActiveUsers = () => {
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({ total: 0, online: 0, offline: 0 });
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    try {
      const res = await PresenceAPI.list();
      setRows(Array.isArray(res?.data) ? res.data : []);
      setStats(res?.stats || { total: 0, online: 0, offline: 0 });
      setLastRefresh(new Date());
    } catch (e) {
      console.error('Active users load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  const filtered = rows.filter((row) => {
    if (filter === 'online') return row.is_online;
    if (filter === 'offline') return !row.is_online;
    return true;
  });

  return (
    <React.Fragment>
      <Head title="Active Users" />
      <Content>
        <BlockHead size="sm">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle tag="h3" page>
                Active Users
              </BlockTitle>
              <p className="text-soft mb-0">
                People using the ticketing system — role, device, and online status. View only (no remote logout).
              </p>
            </BlockHeadContent>
            <BlockHeadContent>
              <div className="d-flex gap-2 flex-wrap">
                <Link to="/admin/logs/list" className="btn btn-outline-light btn-dim">
                  <Icon name="activity" />
                  <span>Activity Logs</span>
                </Link>
                <Button color="primary" outline onClick={() => { setLoading(true); load(); }}>
                  <Icon name="reload" />
                  <span>Refresh</span>
                </Button>
              </div>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>

        <Block>
          <Row className="g-gs mb-4">
            <Col sm="4">
              <Card className="card-bordered h-100">
                <div className="card-inner">
                  <div className="text-soft small">Online now</div>
                  <div className="amount h3 text-success mb-0">{stats.online ?? 0}</div>
                </div>
              </Card>
            </Col>
            <Col sm="4">
              <Card className="card-bordered h-100">
                <div className="card-inner">
                  <div className="text-soft small">Offline</div>
                  <div className="amount h3 mb-0">{stats.offline ?? 0}</div>
                </div>
              </Card>
            </Col>
            <Col sm="4">
              <Card className="card-bordered h-100">
                <div className="card-inner">
                  <div className="text-soft small">Ticketing users</div>
                  <div className="amount h3 mb-0">{stats.total ?? 0}</div>
                </div>
              </Card>
            </Col>
          </Row>

          <Card className="card-bordered">
            <div className="card-inner">
              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                <div className="btn-group">
                  {['all', 'online', 'offline'].map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={`btn btn-sm ${filter === key ? 'btn-primary' : 'btn-outline-light'}`}
                      onClick={() => setFilter(key)}
                    >
                      {key === 'all' ? 'All' : key === 'online' ? 'Online' : 'Offline'}
                    </button>
                  ))}
                </div>
                {lastRefresh && (
                  <span className="text-soft small">
                    Updated {moment(lastRefresh).format('HH:mm:ss')} · online = active in last 2 min
                  </span>
                )}
              </div>

              {loading && !rows.length ? (
                <div className="text-center py-5 text-soft">Loading users…</div>
              ) : (
                <div className="table-responsive">
                  <Table className="table-tranx mb-0">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Role</th>
                        <th>Device</th>
                        <th>Status</th>
                        <th>Last seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="text-center text-soft py-4">
                            No users match this filter.
                          </td>
                        </tr>
                      ) : (
                        filtered.map((row) => (
                          <tr key={row.user_id}>
                            <td>
                              <div className="fw-medium">{row.user_name || '—'}</div>
                              <div className="text-soft small">{row.user_email || '—'}</div>
                            </td>
                            <td>{formatRoles(row.roles)}</td>
                            <td>
                              <div>{deviceLabel(row)}</div>
                              {row.os && row.os !== 'Unknown' && (
                                <div className="text-soft small">{row.os}</div>
                              )}
                            </td>
                            <td>
                              {row.is_online ? (
                                <Badge color="success" pill>
                                  <span className="me-1">●</span> Online
                                </Badge>
                              ) : (
                                <Badge color="light" pill className="text-muted">
                                  Offline
                                </Badge>
                              )}
                            </td>
                            <td className="text-soft">
                              {row.last_seen_at
                                ? moment(row.last_seen_at).fromNow()
                                : 'Never'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </Table>
                </div>
              )}
            </div>
          </Card>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default connect()(ActiveUsers);
