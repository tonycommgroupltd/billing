import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { connect } from "react-redux";
import Content from "../../layout/content/Content";
import Head from "../../layout/head/Head";
import { Card, Badge, Table, Row, Col } from "reactstrap";
import {
  Block,
  BlockHead,
  BlockBetween,
  BlockHeadContent,
  BlockTitle,
  Button,
  Icon,
} from "../../components/Component";
import moment from "moment";
import { isInstallationMenuType } from "../../config/ticketTypes";

// Helper function to format assignedTo name
const formatAssignedToName = (assignedTo) => {
  if (!assignedTo || assignedTo === '0' || assignedTo === '-') return 'Unassigned';
  const assignedStr = assignedTo.toString().trim();
  const match = assignedStr.match(/^(.+?)\s*\(/);
  if (match) return match[1].trim();
  if (assignedStr.includes('@')) {
    return assignedStr.split('@')[0]
      .split(/[._-]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  return assignedStr;
};

const FILTER_KEY = 'tickets_archived_installations_filters_v1';
const defaultFilters = { status: 'all', search: '', assignedTo: '', start: '', end: '' };

const ArchivedInstallations = ({ user }) => {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [filters, setFilters] = useState(() => {
    try {
      const saved = sessionStorage.getItem(FILTER_KEY);
      return saved ? { ...defaultFilters, ...JSON.parse(saved) } : defaultFilters;
    } catch { return defaultFilters; }
  });
  const [pagination, setPagination] = useState({
    currentPage: 1,
    itemsPerPage: 25,
    totalItems: 0
  });
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => {
    try { sessionStorage.setItem(FILTER_KEY, JSON.stringify(filters)); } catch {}
  }, [filters]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
      const response = await TicketsAPI.getArchived({ per_page: 0, type: 'Installation' });
      let tickets = (response.data || []).filter((t) => isInstallationMenuType(t.type || t.typeLabel));
      tickets = tickets.map(ticket => ({
        ...ticket,
        number: ticket.number || `#${ticket.id}`,
        created_at: ticket.created_at || new Date().toISOString(),
        archived_at: ticket.archived_at || ticket.deleted_at || new Date().toISOString(),
      }));
      setData(tickets);
      setPagination(prev => ({ ...prev, totalItems: tickets.length, currentPage: 1 }));
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Error fetching archived installations:', error);
      setData([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const filteredData = useMemo(() => {
    let filtered = [...data];

    if (filters.search) {
      const q = filters.search.toLowerCase();
      filtered = filtered.filter(t =>
        (t.subject || '').toLowerCase().includes(q) ||
        (t.number || '').toString().toLowerCase().includes(q) ||
        (t.customer_name || t.customerName || '').toLowerCase().includes(q) ||
        (t.customer_phone || t.customerPhone || '').toString().includes(q) ||
        formatAssignedToName(t.assignedTo).toLowerCase().includes(q)
      );
    }

    if (filters.status !== 'all') {
      filtered = filtered.filter(t => (t.status || '').toLowerCase() === filters.status.toLowerCase());
    }

    if (filters.assignedTo) {
      filtered = filtered.filter(t =>
        formatAssignedToName(t.assignedTo).toLowerCase().includes(filters.assignedTo.toLowerCase())
      );
    }

    if (filters.start) {
      filtered = filtered.filter(t => {
        const d = t.archived_at || t.created_at;
        return d && moment(d).isSameOrAfter(moment(filters.start), 'day');
      });
    }
    if (filters.end) {
      filtered = filtered.filter(t => {
        const d = t.archived_at || t.created_at;
        return d && moment(d).isSameOrBefore(moment(filters.end), 'day');
      });
    }

    return filtered;
  }, [data, filters]);

  const getPaginatedData = () => {
    const start = (pagination.currentPage - 1) * pagination.itemsPerPage;
    return filteredData.slice(start, start + pagination.itemsPerPage);
  };

  const getTotalPages = () => Math.ceil(filteredData.length / pagination.itemsPerPage);

  const handleRestoreTicket = async (ticketId) => {
    if (window.confirm('Are you sure you want to restore this installation ticket? It will move back to active installations.')) {
      try {
        setLoading(true);
        const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
        await TicketsAPI.restore(ticketId);
        setData(prev => prev.filter(t => t.id !== ticketId));
        alert('Installation ticket restored successfully.');
      } catch (error) {
        console.error('Error restoring ticket:', error);
        alert('Error restoring ticket. Please try again.');
      } finally {
        setLoading(false);
      }
    }
  };

  const getStatusBadge = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'installation complete' || s === 'resolved') return 'success';
    if (s.includes('waiting')) return 'warning';
    if (s === 'new') return 'info';
    if (s === 'booked_later') return 'primary';
    if (s === 'customer_unreachable' || s === 'out_of_range') return 'warning';
    if (s === 'installed_elsewhere') return 'secondary';
    return 'secondary';
  };

  const statusLabels = {
    new: 'New',
    resolved: 'Resolved',
    'installation complete': 'Installation Complete',
    waiting_customer: 'Waiting on Customer',
    waiting_agent: 'Waiting on Agent',
    waiting_power: 'Waiting on Power',
    customer_unreachable: 'Customer Unreachable',
    booked_later: 'Booked Later',
    out_of_range: 'Out of Range',
    installed_elsewhere: 'Installed Elsewhere',
    long_distance: 'Long Distance',
    pole_needed: 'Pole Needed'
  };

  return (
    <React.Fragment>
      <Head title="Archived Installations" />
      <Content>
        <BlockHead size="sm">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle page tag="h3">
                <Icon name="archive" style={{ marginRight: 8 }} />
                Archived Installations
              </BlockTitle>
              <div style={{ fontSize: '13px', color: '#8094ae', marginTop: 4 }}>
                Installation tickets that have been archived &bull; Last updated: {lastRefresh.toLocaleTimeString()}
              </div>
            </BlockHeadContent>
            <BlockHeadContent>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Button
                  className={`btn btn-outline-dark btn-icon ${refreshing ? 'disabled' : ''}`}
                  onClick={handleRefresh}
                  disabled={refreshing}
                  title="Refresh"
                >
                  <Icon name={refreshing ? "loader" : "reload"} className={refreshing ? "spinning" : ""} />
                </Button>
                <Button
                  className="btn btn-outline-primary"
                  onClick={() => navigate('/admin/tickets/installations')}
                >
                  <Icon name="arrow-left" style={{ marginRight: 4 }} /> Active Installations
                </Button>
              </div>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>

        {/* Summary Stats */}
        <Block>
          <Row className="g-gs">
            <Col sm="6" md="3">
              <Card className="card-bordered">
                <div className="card-inner py-3 text-center">
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#364a63' }}>{loading ? '...' : data.length}</div>
                  <div style={{ fontSize: 12, color: '#8094ae', fontWeight: 500 }}>Total Archived</div>
                </div>
              </Card>
            </Col>
            <Col sm="6" md="3">
              <Card className="card-bordered">
                <div className="card-inner py-3 text-center">
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#29cc97' }}>
                    {loading ? '...' : data.filter(t => (t.status || '').toLowerCase() === 'installation complete').length}
                  </div>
                  <div style={{ fontSize: 12, color: '#8094ae', fontWeight: 500 }}>Completed</div>
                </div>
              </Card>
            </Col>
            <Col sm="6" md="3">
              <Card className="card-bordered">
                <div className="card-inner py-3 text-center">
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#6576ff' }}>
                    {loading ? '...' : data.filter(t => (t.status || '').toLowerCase() === 'resolved').length}
                  </div>
                  <div style={{ fontSize: 12, color: '#8094ae', fontWeight: 500 }}>Resolved</div>
                </div>
              </Card>
            </Col>
            <Col sm="6" md="3">
              <Card className="card-bordered">
                <div className="card-inner py-3 text-center">
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#f4bd0e' }}>
                    {loading ? '...' : data.filter(t => !['installation complete', 'resolved'].includes((t.status || '').toLowerCase())).length}
                  </div>
                  <div style={{ fontSize: 12, color: '#8094ae', fontWeight: 500 }}>Other</div>
                </div>
              </Card>
            </Col>
          </Row>
        </Block>

        <Block>
          <Card className="card-bordered">
            {/* Filters */}
            <div className="card-inner border-bottom" style={{ padding: '16px 20px' }}>
              <Row className="g-3 align-items-end">
                <Col md={3}>
                  <label className="form-label" style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Search</label>
                  <input
                    type="search"
                    className="form-control form-control-sm"
                    placeholder="Search by name, phone, subject..."
                    value={filters.search}
                    onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  />
                </Col>
                <Col md={2}>
                  <label className="form-label" style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Status</label>
                  <select
                    className="form-control form-control-sm"
                    value={filters.status}
                    onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))}
                  >
                    <option value="all">All Statuses</option>
                    <option value="installation complete">Installation Complete</option>
                    <option value="resolved">Resolved</option>
                    <option value="new">New</option>
                    <option value="waiting_customer">Waiting on Customer</option>
                    <option value="waiting_agent">Waiting on Agent</option>
                    <option value="booked_later">Booked Later</option>
                    <option value="customer_unreachable">Customer Unreachable</option>
                    <option value="out_of_range">Out of Range</option>
                    <option value="installed_elsewhere">Installed Elsewhere</option>
                  </select>
                </Col>
                <Col md={2}>
                  <label className="form-label" style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>From</label>
                  <input type="date" className="form-control form-control-sm" value={filters.start} onChange={e => setFilters(prev => ({ ...prev, start: e.target.value }))} />
                </Col>
                <Col md={2}>
                  <label className="form-label" style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>To</label>
                  <input type="date" className="form-control form-control-sm" value={filters.end} onChange={e => setFilters(prev => ({ ...prev, end: e.target.value }))} />
                </Col>
                <Col md={2}>
                  <label className="form-label" style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Show</label>
                  <select
                    className="form-control form-control-sm"
                    value={pagination.itemsPerPage}
                    onChange={e => setPagination(prev => ({ ...prev, itemsPerPage: Number(e.target.value), currentPage: 1 }))}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </Col>
                <Col md={1}>
                  <Button
                    className="btn btn-sm btn-outline-secondary w-100"
                    onClick={() => setFilters(defaultFilters)}
                    title="Reset Filters"
                  >
                    <Icon name="undo" />
                  </Button>
                </Col>
              </Row>
              <div style={{ fontSize: 12, color: '#8094ae', marginTop: 8 }}>
                Showing {filteredData.length} of {data.length} archived installations
              </div>
            </div>

            {/* Table */}
            <div style={{ overflowX: isMobile ? 'auto' : 'visible', WebkitOverflowScrolling: 'touch' }}>
              <Table className="table-striped" style={{ marginBottom: 0, fontSize: 13 }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fb' }}>
                    <th style={{ padding: '10px 12px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, width: 70 }}>ID</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Subject</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Customer</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, width: 120 }}>Status</th>
                    {!isMobile && <th style={{ padding: '10px 12px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, width: 110 }}>Priority</th>}
                    <th style={{ padding: '10px 12px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, width: 110 }}>Assigned</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, width: 130 }}>Archived</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, width: 90, textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={isMobile ? 7 : 8} className="text-center text-muted py-4">Loading archived installations...</td></tr>
                  ) : getPaginatedData().length === 0 ? (
                    <tr>
                      <td colSpan={isMobile ? 7 : 8} className="text-center py-5">
                        <Icon name="archive" style={{ fontSize: 32, color: '#c4cdd5', display: 'block', marginBottom: 8 }} />
                        <div style={{ color: '#8094ae', fontSize: 14 }}>No archived installations found</div>
                        <div style={{ color: '#b8c4ce', fontSize: 12, marginTop: 4 }}>Archived installation tickets will appear here</div>
                      </td>
                    </tr>
                  ) : (
                    getPaginatedData().map(t => (
                      <tr
                        key={t.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => navigate(`/admin/tickets/view/${t.id}`, { state: { ticket: t } })}
                      >
                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>#{t.id}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <div style={{ fontWeight: 500 }}>{t.subject || 'Installation'}</div>
                          <div style={{ fontSize: 11, color: '#8094ae' }}>{t.number}</div>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <div>{t.customer_name || t.customerName || '-'}</div>
                          <div style={{ fontSize: 11, color: '#8094ae' }}>{t.customer_phone || t.customerPhone || ''}</div>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <Badge color={getStatusBadge(t.status)} className="badge-sm">
                            {statusLabels[(t.status || '').toLowerCase()] || t.status || '-'}
                          </Badge>
                        </td>
                        {!isMobile && (
                          <td style={{ padding: '8px 12px' }}>
                            <Badge color={t.priority === 'urgent' ? 'danger' : t.priority === 'high' ? 'warning' : t.priority === 'medium' ? 'info' : 'light'} className="badge-sm">
                              {t.priority || '-'}
                            </Badge>
                          </td>
                        )}
                        <td style={{ padding: '8px 12px', fontSize: 12 }}>
                          {formatAssignedToName(t.assignedTo)}
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: 12, color: '#8094ae' }}>
                          {t.archived_at ? moment(t.archived_at).format(isMobile ? 'MM/DD/YY' : 'YYYY-MM-DD HH:mm') : '-'}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                            <Button
                              className="btn btn-sm btn-outline-primary btn-icon"
                              onClick={() => navigate(`/admin/tickets/view/${t.id}`, { state: { ticket: t } })}
                              title="View"
                              style={{ padding: '4px 6px' }}
                            >
                              <Icon name="eye" />
                            </Button>
                            <Button
                              className="btn btn-sm btn-outline-success btn-icon"
                              onClick={() => handleRestoreTicket(t.id)}
                              title="Restore"
                              style={{ padding: '4px 6px' }}
                            >
                              <Icon name="undo" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </div>

            {/* Pagination */}
            {getTotalPages() > 1 && (
              <div className="card-inner border-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px' }}>
                <div style={{ fontSize: 12, color: '#8094ae' }}>
                  Page {pagination.currentPage} of {getTotalPages()} &bull; {filteredData.length} total
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <Button
                    className="btn btn-sm btn-outline-secondary"
                    disabled={pagination.currentPage === 1}
                    onClick={() => setPagination(prev => ({ ...prev, currentPage: prev.currentPage - 1 }))}
                  >
                    Prev
                  </Button>
                  {Array.from({ length: Math.min(getTotalPages(), 5) }, (_, i) => {
                    let pageNum;
                    if (getTotalPages() <= 5) {
                      pageNum = i + 1;
                    } else if (pagination.currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (pagination.currentPage >= getTotalPages() - 2) {
                      pageNum = getTotalPages() - 4 + i;
                    } else {
                      pageNum = pagination.currentPage - 2 + i;
                    }
                    return (
                      <Button
                        key={pageNum}
                        className={`btn btn-sm ${pagination.currentPage === pageNum ? 'btn-primary' : 'btn-outline-secondary'}`}
                        onClick={() => setPagination(prev => ({ ...prev, currentPage: pageNum }))}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                  <Button
                    className="btn btn-sm btn-outline-secondary"
                    disabled={pagination.currentPage === getTotalPages()}
                    onClick={() => setPagination(prev => ({ ...prev, currentPage: prev.currentPage + 1 }))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </Block>
      </Content>
    </React.Fragment>
  );
};

const mapStateToProps = (state) => ({
  user: state.auth.currentUser
});

export default connect(mapStateToProps)(ArchivedInstallations);
