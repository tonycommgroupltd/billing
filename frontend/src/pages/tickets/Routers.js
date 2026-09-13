import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import { Card, Row, Col, Table } from "reactstrap";
import { Block, BlockHead, BlockHeadContent, BlockTitle, Button, Icon } from "../../components/Component";
import moment from "moment";

// Helper function to format assignedTo name
const formatAssignedToName = (assignedTo) => {
  if (!assignedTo || assignedTo === '0' || assignedTo === '-') return 'Unassigned';
  const assignedStr = assignedTo.toString().trim();
  const match = assignedStr.match(/^(.+?)\s*\(/);
  if (match) return match[1].trim();
  if (assignedStr.includes('@')) {
    const emailName = assignedStr.split('@')[0];
    return emailName.split(/[._-]/).map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
  }
  return assignedStr;
};

const ROUTERS_FILTER_KEY = 'tickets_routers_filters_v1';
const defaultRoutersFilters = { search: '' };

const Routers = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [routersList, setRoutersList] = useState([]);
  const [totalWithArchived, setTotalWithArchived] = useState({ totalTickets: 0, totalRouters: 0, today: 0 }); // Total including archived
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [filters, setFilters] = useState(() => {
    try {
      const saved = sessionStorage.getItem(ROUTERS_FILTER_KEY);
      return saved ? { ...defaultRoutersFilters, ...JSON.parse(saved) } : defaultRoutersFilters;
    } catch { return defaultRoutersFilters; }
  });
  useEffect(() => {
    try { sessionStorage.setItem(ROUTERS_FILTER_KEY, JSON.stringify(filters)); } catch {}
  }, [filters]);
  const [sortConfig, setSortConfig] = useState({ key: 'updated_at', direction: 'desc' });
  const [selectedTickets, setSelectedTickets] = useState([]);
  const [bulkAction, setBulkAction] = useState('');
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { default: TicketsAPI } = await import("../../helpers/TicketsAPI");
      
      // Fetch active (non-archived) tickets with routers for the list
      const resp = await TicketsAPI.getRoutersList();
      console.log('Routers API Response:', resp);
      console.log('First item router_numbers:', resp.data?.[0]?.router_numbers);
      const items = (resp.data || []).map(t => {
        const formatted = formatAssignedToName(t.assignedTo);
        return { ...t, assignedTo: formatted === 'Unassigned' ? t.assignedTo : formatted };
      });
      setRoutersList(items);
      
      // Fetch total count including archived tickets
      // We'll make a direct database call through a custom endpoint
      try {
        const totalResp = await TicketsAPI.getRoutersListTotal();
        if (totalResp?.data) {
          setTotalWithArchived({
            totalTickets: totalResp.data.totalTickets || items.length,
            totalRouters: totalResp.data.totalRouters || items.reduce((acc, t) => acc + (t.router_count || 0), 0),
            today: totalResp.data.today || 0
          });
        }
      } catch (err) {
        console.log('Failed to get total with archived, using current list:', err);
        // Fallback to current list counts if API fails
        setTotalWithArchived({
          totalTickets: items.length,
          totalRouters: items.reduce((acc, t) => acc + (t.router_count || 0), 0),
          today: 0
        });
      }
      
      setLastRefresh(new Date());
    } catch (e) {
      console.error("Failed to load routers", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleArchive = async (ticketId, event) => {
    event.stopPropagation();
    if (!window.confirm('Are you sure you want to archive this ticket?')) return;
    
    try {
      const { default: TicketsAPI } = await import("../../helpers/TicketsAPI");
      await TicketsAPI.archive(ticketId);
      // Remove from list or reload
      setRoutersList(prev => prev.filter(t => t.id !== ticketId));
      // Show success notification if available
      if (window.showSuccess) window.showSuccess('Ticket archived successfully');
    } catch (error) {
      console.error('Failed to archive ticket:', error);
      if (window.showError) window.showError('Failed to archive ticket');
    }
  };

  const handleDelete = async (ticketId, event) => {
    event.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this ticket? This action cannot be undone.')) return;
    
    try {
      const { default: TicketsAPI } = await import("../../helpers/TicketsAPI");
      await TicketsAPI.delete(ticketId);
      // Remove from list
      setRoutersList(prev => prev.filter(t => t.id !== ticketId));
      // Show success notification if available
      if (window.showSuccess) window.showSuccess('Ticket deleted successfully');
    } catch (error) {
      console.error('Failed to delete ticket:', error);
      if (window.showError) window.showError('Failed to delete ticket');
    }
  };

  const handleSelectTicket = (id, checked) => {
    setSelectedTickets(prev => checked ? [...prev, id] : prev.filter(x => x !== id));
  };

  const handleSelectAll = (checked) => {
    setSelectedTickets(checked ? filtered.map(t => t.id) : []);
  };

  const handleBulkArchive = async () => {
    if (selectedTickets.length === 0) return;
    if (!window.confirm(`Archive ${selectedTickets.length} selected ticket(s)?`)) return;
    try {
      const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
      await Promise.all(selectedTickets.map(id => TicketsAPI.archive(id).catch(() => {})));
      setRoutersList(prev => prev.filter(t => !selectedTickets.includes(t.id)));
      setSelectedTickets([]);
      setBulkAction('');
    } catch (e) {
      console.error('Bulk archive failed', e);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedTickets.length === 0) return;
    if (!window.confirm(`Permanently delete ${selectedTickets.length} selected ticket(s)? This cannot be undone.`)) return;
    try {
      const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
      await Promise.all(selectedTickets.map(id => TicketsAPI.delete(id).catch(() => {})));
      setRoutersList(prev => prev.filter(t => !selectedTickets.includes(t.id)));
      setSelectedTickets([]);
      setBulkAction('');
    } catch (e) {
      console.error('Bulk delete failed', e);
    }
  };

  const handleBulkAction = () => {
    if (bulkAction === 'archive') handleBulkArchive();
    else if (bulkAction === 'delete') handleBulkDelete();
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filtered = useMemo(() => {
    let result = routersList;
    
    // Apply search filter
    if (filters.search) {
      const lower = filters.search.toLowerCase();
      const normalizePhone = (p) => {
        const d = (p || '').replace(/\D/g, '');
        if (d.startsWith('254') && d.length > 9) return d.slice(3);
        if (d.startsWith('0') && d.length > 1) return d.slice(1);
        return d;
      };
      const qPhone = normalizePhone(lower);
      result = result.filter(t => {
        const rawPhone = (t.customer_phone || t.customer?.phone || t.customerPhone || '').toString();
        const phoneMatch = rawPhone.toLowerCase().includes(lower) ||
          (qPhone.length >= 4 && normalizePhone(rawPhone).includes(qPhone));
        return (t.router_numbers || '').toLowerCase().includes(lower) ||
          (t.subject || '').toLowerCase().includes(lower) ||
          (t.number || '').toString().toLowerCase().includes(lower) ||
          (t.customer_name || t.customer?.name || '').toLowerCase().includes(lower) ||
          phoneMatch;
      });
    }
    
    // Apply sorting
    if (sortConfig.key) {
      result = [...result].sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];
        
        // Handle null/undefined values
        if (aVal === null || aVal === undefined) aVal = '';
        if (bVal === null || bVal === undefined) bVal = '';
        
        // Special handling for different field types
        if (sortConfig.key === 'updated_at') {
          aVal = new Date(aVal).getTime();
          bVal = new Date(bVal).getTime();
        } else if (sortConfig.key === 'number') {
          // Extract numeric part from ticket number (e.g., "#2332" -> 2332)
          aVal = parseInt(aVal.toString().replace(/\D/g, '')) || 0;
          bVal = parseInt(bVal.toString().replace(/\D/g, '')) || 0;
        } else {
          // String comparison
          aVal = aVal.toString().toLowerCase();
          bVal = bVal.toString().toLowerCase();
        }
        
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    
    return result;
  }, [routersList, filters.search, sortConfig]);

  const stats = useMemo(() => {
    return {
      totalTickets: totalWithArchived.totalTickets || routersList.length,
      totalRouters: totalWithArchived.totalRouters || routersList.reduce((acc, t) => acc + (t.router_count || 0), 0),
      today: totalWithArchived.today || 0,
    };
  }, [routersList, totalWithArchived]);

  return (
    <React.Fragment>
      <Head title="Routers" />
      <Content>
        <BlockHead size="sm">
          <BlockHeadContent>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <BlockTitle page tag="h3">Router Numbers</BlockTitle>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Button className={`btn btn-outline-dark btn-icon ${loading ? "disabled" : ""}`} onClick={load} disabled={loading} title="Refresh">
                  <Icon name={loading ? "loader" : "reload"} className={loading ? "spinning" : ""} />
                </Button>
                <span style={{ fontSize: 12, color: "#6c757d" }}>Last updated: {lastRefresh.toLocaleTimeString()}</span>
              </div>
            </div>
          </BlockHeadContent>
        </BlockHead>

        <Block>
          <Row className="g-gs dashboard-top">
            <Col sm="6" md="4" className="dashboards-top-block-item">
              <Card>
                <div className="card-inner p-0">
                  <div className="dashboards-top-block-item-title">
                    <span className="icon-wrap"><Icon name="cpu" /></span>
                    <span className="text">Total Tickets</span>
                  </div>
                  <div className="dashboards-top-block-item-bottom">
                    <span className="view">With Routers</span>
                    <span className="count">{loading ? "..." : stats.totalTickets}</span>
                  </div>
                </div>
              </Card>
            </Col>
            <Col sm="6" md="4" className="dashboards-top-block-item">
              <Card>
                <div className="card-inner p-0">
                  <div className="dashboards-top-block-item-title">
                    <span className="icon-wrap"><Icon name="layers" /></span>
                    <span className="text">Total Routers</span>
                  </div>
                  <div className="dashboards-top-block-item-bottom">
                    <span className="view">Count</span>
                    <span className="count">{loading ? "..." : stats.totalRouters}</span>
                  </div>
                </div>
              </Card>
            </Col>
            <Col sm="6" md="4" className="dashboards-top-block-item">
              <Card>
                <div className="card-inner p-0">
                  <div className="dashboards-top-block-item-title">
                    <span className="icon-wrap"><Icon name="calendar" /></span>
                    <span className="text">Updated Today</span>
                  </div>
                  <div className="dashboards-top-block-item-bottom">
                    <span className="view">Tickets</span>
                    <span className="count">{loading ? "..." : stats.today}</span>
                  </div>
                </div>
              </Card>
            </Col>
          </Row>
        </Block>

        <Block>
          <Card>
            <div className="card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: 'wrap', gap: '8px' }}>
              <strong>Tickets with Routers</strong>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {selectedTickets.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '13px', color: '#374151', fontWeight: '500' }}>{selectedTickets.length} selected</span>
                    <select
                      className="form-select form-select-sm"
                      style={{ width: '140px' }}
                      value={bulkAction}
                      onChange={e => setBulkAction(e.target.value)}
                    >
                      <option value="">Bulk Action</option>
                      <option value="archive">Archive</option>
                      <option value="delete">Delete</option>
                    </select>
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={!bulkAction}
                      onClick={handleBulkAction}
                    >
                      Apply
                    </button>
                    <button
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => { setSelectedTickets([]); setBulkAction(''); }}
                    >
                      Clear
                    </button>
                  </div>
                )}
                <div style={{ width: '200px' }}>
                  <input
                    type="search"
                    className="form-control form-control-sm"
                    placeholder="Search router..."
                    value={filters.search}
                    onChange={(e) => setFilters({search: e.target.value})}
                  />
                </div>
              </div>
            </div>
            <div className="card-body">
              <div style={{ overflowX: 'auto' }}>
                <Table className="table-striped" style={{ minWidth: '800px' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '40px', padding: '8px 12px' }} onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          style={{ width: '14px', height: '14px', accentColor: '#357bf2', cursor: 'pointer' }}
                          checked={filtered.length > 0 && selectedTickets.length === filtered.length}
                          ref={el => { if (el) el.indeterminate = selectedTickets.length > 0 && selectedTickets.length < filtered.length; }}
                          onChange={e => handleSelectAll(e.target.checked)}
                          title="Select all"
                        />
                      </th>
                      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('number')}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          Ticket
                          <span style={{ display: 'inline-flex', flexDirection: 'column', fontSize: '10px', lineHeight: '6px' }}>
                            <span style={{ opacity: sortConfig.key === 'number' && sortConfig.direction === 'asc' ? 1 : 0.3 }}>▲</span>
                            <span style={{ opacity: sortConfig.key === 'number' && sortConfig.direction === 'desc' ? 1 : 0.3 }}>▼</span>
                          </span>
                        </div>
                      </th>
                      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('router_numbers')}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          Router Number
                          <span style={{ display: 'inline-flex', flexDirection: 'column', fontSize: '10px', lineHeight: '6px' }}>
                            <span style={{ opacity: sortConfig.key === 'router_numbers' && sortConfig.direction === 'asc' ? 1 : 0.3 }}>▲</span>
                            <span style={{ opacity: sortConfig.key === 'router_numbers' && sortConfig.direction === 'desc' ? 1 : 0.3 }}>▼</span>
                          </span>
                        </div>
                      </th>
                      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('subject')}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          Subject
                          <span style={{ display: 'inline-flex', flexDirection: 'column', fontSize: '10px', lineHeight: '6px' }}>
                            <span style={{ opacity: sortConfig.key === 'subject' && sortConfig.direction === 'asc' ? 1 : 0.3 }}>▲</span>
                            <span style={{ opacity: sortConfig.key === 'subject' && sortConfig.direction === 'desc' ? 1 : 0.3 }}>▼</span>
                          </span>
                        </div>
                      </th>
                      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('assignedTo')}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          Assigned
                          <span style={{ display: 'inline-flex', flexDirection: 'column', fontSize: '10px', lineHeight: '6px' }}>
                            <span style={{ opacity: sortConfig.key === 'assignedTo' && sortConfig.direction === 'asc' ? 1 : 0.3 }}>▲</span>
                            <span style={{ opacity: sortConfig.key === 'assignedTo' && sortConfig.direction === 'desc' ? 1 : 0.3 }}>▼</span>
                          </span>
                        </div>
                      </th>
                      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('updated_at')}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          Updated
                          <span style={{ display: 'inline-flex', flexDirection: 'column', fontSize: '10px', lineHeight: '6px' }}>
                            <span style={{ opacity: sortConfig.key === 'updated_at' && sortConfig.direction === 'asc' ? 1 : 0.3 }}>▲</span>
                            <span style={{ opacity: sortConfig.key === 'updated_at' && sortConfig.direction === 'desc' ? 1 : 0.3 }}>▼</span>
                          </span>
                        </div>
                      </th>
                      <th style={{ width: '120px', textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={7} className="text-center">Loading...</td></tr>
                    ) : filtered.length === 0 ? (
                      <tr><td colSpan={7} className="text-center">No routers found</td></tr>
                    ) : (
                      filtered.map((t) => {
                        console.log('Rendering row - ID:', t.id, 'router_numbers:', t.router_numbers, 'type:', typeof t.router_numbers);
                        return (
                        <tr key={t.id} style={{ cursor: "pointer", backgroundColor: selectedTickets.includes(t.id) ? '#f0f8ff' : '' }} onClick={() => navigate(`/admin/tickets/view/${t.id}`, { state: { ticket: t } })}>
                          <td onClick={e => e.stopPropagation()} style={{ padding: '8px 12px' }}>
                            <input
                              type="checkbox"
                              style={{ width: '14px', height: '14px', accentColor: '#357bf2', cursor: 'pointer' }}
                              checked={selectedTickets.includes(t.id)}
                              onChange={e => handleSelectTicket(t.id, e.target.checked)}
                            />
                          </td>
                          <td><strong>#{t.number}</strong></td>
                          <td>
                            {t.router_numbers ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {t.router_numbers.toString().split(',').map((num, idx) => {
                                  const trimmed = num.trim();
                                  return trimmed ? (
                                    <span 
                                      key={idx} 
                                      style={{ 
                                        backgroundColor: '#e0f2fe',
                                        color: '#0369a1',
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        fontSize: '12px',
                                        fontWeight: '500',
                                        border: '1px solid #bae6fd',
                                        whiteSpace: 'nowrap'
                                      }}
                                    >
                                      {trimmed}
                                    </span>
                                  ) : null;
                                })}
                              </div>
                            ) : (
                              <span style={{ color: '#9ca3af', fontSize: '13px' }}>No Router #</span>
                            )}
                          </td>
                          <td>{t.subject}</td>
                          <td>{t.assignedTo}</td>
                          <td>{moment(t.updated_at).format("YYYY-MM-DD HH:mm")}</td>
                          <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                              <button
                                onClick={(e) => handleArchive(t.id, e)}
                                className="btn btn-sm btn-outline-warning"
                                style={{ padding: '4px 8px', fontSize: '12px' }}
                                title="Archive ticket"
                              >
                                <Icon name="archive" />
                              </button>
                              <button
                                onClick={(e) => handleDelete(t.id, e)}
                                className="btn btn-sm btn-outline-danger"
                                style={{ padding: '4px 8px', fontSize: '12px' }}
                                title="Delete ticket"
                              >
                                <Icon name="trash" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        );
                      })
                    )}
                  </tbody>
                </Table>
              </div>
            </div>
          </Card>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default Routers;
