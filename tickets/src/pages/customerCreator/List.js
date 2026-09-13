import React, { useEffect, useState } from "react";
import { connect } from 'react-redux';
import { Link, useNavigate, useLocation } from "react-router-dom";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import { Card, Modal, ModalBody, ModalHeader } from "reactstrap";
import { Block, BlockHead, BlockHeadContent, BlockTitle, Button, Icon } from "../../components/Component";
import moment from 'moment';
import { formatTicketDateVeryShort, getTimeAgo } from '../../utils/dateUtils';
import TicketsAPI from '../../helpers/TicketsAPI';
import { useActivityLogger, ACTIVITY_TYPES, TARGET_TYPES } from '../../hooks/useActivityLogger';
import {
  DASHBOARD_METRICS,
  filterCustomers,
  filterCustomersByMetric,
  getMetricFilterState,
  parseMetricFromSearch,
} from '../../utils/customerCreatorFilters';

const LIST_PATH = `${process.env.PUBLIC_URL}/admin/customer-creater/list`;

const ListCustomerCreator = ({ user }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const logActivity = useActivityLogger();
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [users, setUsers] = useState([]);
  const [dashboardMetric, setDashboardMetric] = useState(null);
  const [filters, setFilters] = useState({ status: 'all', start: '', end: '' });
  const [editModal, setEditModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editForm, setEditForm] = useState({});

  const displayUser = (u) => u?.display_name || u?.name || u?.username || u?.email || 'Unknown';

  // Helper function to extract and format name from email or "Name (email)" format
  const getAssignedToName = (assignedTo) => {
    if (!assignedTo) return 'Unassigned';
    
    // If format is "Name (email@domain.com)"
    const nameMatch = assignedTo.match(/^(.+?)\s*\(/);
    if (nameMatch) {
      return nameMatch[1].trim();
    }
    
    // If it's just an email, extract the part before @
    if (assignedTo.includes('@')) {
      const emailName = assignedTo.split('@')[0];
      // Convert "john.doe" or "john_doe" to "John Doe"
      return emailName
        .split(/[._-]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    }
    
    // Return as is if it's already a name
    return assignedTo;
  };

  const startEditTicket = (customer) => {
    if (customer.ticketId) {
      setEditingCustomer(customer);
      setEditForm({
        subject: customer.ticketSubject || '',
        status: customer.ticketStatus || 'new',
        assigned_to: customer.ticketAssignedTo || ''
      });
      setEditModal(true);
    }
  };

  const cancelEdit = () => {
    setEditModal(false);
    setEditingCustomer(null);
    setEditForm({});
  };

  const saveTicketEdit = async () => {
    if (!editingCustomer) return;
    
    try {
      const updateData = {
        subject: editForm.subject,
        status: editForm.status,
        assigned_to: editForm.assigned_to
      };

      await TicketsAPI.update(editingCustomer.ticketId, updateData);
      
      // Update local state
      setCustomers(prev => prev.map(c => 
        c.id === editingCustomer.id 
          ? {
              ...c,
              ticketSubject: updateData.subject,
              ticketStatus: updateData.status,
              ticketAssignedTo: updateData.assigned_to
            }
          : c
      ));
      
      setEditModal(false);
      setEditingCustomer(null);
      setEditForm({});
    } catch (error) {
      console.error('Error updating ticket:', error);
      alert('Failed to update ticket');
    }
  };

  const displayedCustomers = React.useMemo(() => {
    if (dashboardMetric) {
      return filterCustomersByMetric(customers, dashboardMetric);
    }
    return filterCustomers(customers, filters);
  }, [customers, dashboardMetric, filters]);

  const applyDashboardMetric = (metric) => {
    setDashboardMetric(metric);
    setFilters(getMetricFilterState(metric));
  };

  const clearDashboardMetric = () => {
    setDashboardMetric(null);
    setFilters({ status: 'all', start: '', end: '' });
    navigate(LIST_PATH, { replace: true });
  };

  const updateFilters = (patch) => {
    if (dashboardMetric) {
      setDashboardMetric(null);
      navigate(LIST_PATH, { replace: true });
    }
    setFilters((prev) => ({ ...prev, ...patch }));
  };

  const load = async () => {
    setLoading(true);
    try {
      const { default: CustomerCreaterAPI } = await import('../../helpers/CustomerCreaterAPI');
      const resp = await CustomerCreaterAPI.listByUser(displayUser(user));
      const list = resp.data || [];
      setCustomers(list);
      
      // Log the page view activity
      await logActivity(
        ACTIVITY_TYPES.PAGE_VIEWED,
        'Viewed customer creator list',
        TARGET_TYPES.PAGE,
        null
      );
    } catch (e) {
      console.error('Failed to load customers', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const metric = parseMetricFromSearch(location.search);
    if (metric) {
      applyDashboardMetric(metric);
    }
  }, [location.search]);

  useEffect(() => { 
    load(); 
    loadUsers();
  }, []);
  
  const loadUsers = async () => {
    try {
      const response = await fetch('/api/users.php/list');
      if (response.ok) {
        const data = await response.json();
        setUsers(data.data || []);
      }
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  return (
    <React.Fragment>
      <style>{`
        .clickable-row:hover { background-color: #f0f6ff !important; }
      `}</style>
      <Head title="Customer Creater - My Customers" />
      <Content>
        <BlockHead size="sm">
          <BlockHeadContent>
            <BlockTitle page tag="h3">My Added Customers</BlockTitle>
          </BlockHeadContent>
        </BlockHead>

        <Block>
          <Card>
            <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
              <strong>Customers</strong>
              {!loading && (
                <span className="text-muted" style={{ fontSize: 13 }}>
                  Showing {displayedCustomers.length} of {customers.length}
                </span>
              )}
            </div>
            <div className="card-body">
              {dashboardMetric && DASHBOARD_METRICS[dashboardMetric] && (
                <div
                  className="alert alert-primary d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3"
                  style={{ padding: '10px 14px' }}
                >
                  <div>
                    <strong>{DASHBOARD_METRICS[dashboardMetric].label}</strong>
                    <span className="text-muted ms-2">
                      — {DASHBOARD_METRICS[dashboardMetric].description}
                      {!loading && (
                        <span className="ms-1">({displayedCustomers.length} customer{displayedCustomers.length === 1 ? '' : 's'})</span>
                      )}
                    </span>
                  </div>
                  <Button size="sm" color="light" onClick={clearDashboardMetric}>
                    Clear filter
                  </Button>
                </div>
              )}
              <div className="row g-2 mb-3">
                <div className="col-md-3">
                  <label className="form-label">Status</label>
                  <select className="form-control" value={filters.status} onChange={(e) => updateFilters({ status: e.target.value })}>
                    <option value="all">All Statuses</option>
                    <option value="new">New (Unassigned)</option>
                    <option value="work in progress">Work in Progress</option>
                    <option value="installation complete">Installation Complete</option>
                    <option value="resolved">Resolved</option>
                    <option value="waiting on customer">Waiting on Customer</option>
                    <option value="waiting on agent">Waiting on Agent</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="col-md-3">
                  <label className="form-label">From (activity)</label>
                  <input type="date" className="form-control" value={filters.start} onChange={(e) => setFilters(prev => ({ ...prev, start: e.target.value }))} />
                </div>
                <div className="col-md-3">
                  <label className="form-label">To</label>
                  <input type="date" className="form-control" value={filters.end} onChange={(e) => setFilters(prev => ({ ...prev, end: e.target.value }))} />
                </div>
              </div>
              <div className="table-responsive">
                <table className="table table-striped">
                  <thead>
                    <tr>
                      <th style={{width: 80}}>ID</th>
                      <th>Name</th>
                      <th>Phone</th>
                      <th>Type</th>
                      <th>Price (KES)</th>
                      <th>Ticket #</th>
                      <th style={{width: 140}}>Status</th>
                      <th style={{width: 180}}>Assigned To</th>
                      <th style={{width: 160}}>Created</th>
                      <th style={{width: 160}}>Updated</th>
                      <th style={{width: 140}}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={11} className="text-center text-muted">Loading...</td></tr>
                    ) : customers.length === 0 ? (
                      <tr><td colSpan={11} className="text-center text-muted">No customers added yet</td></tr>
                    ) : displayedCustomers.length === 0 ? (
                      <tr><td colSpan={11} className="text-center text-muted">No customers match this filter</td></tr>
                    ) : (
                      displayedCustomers.map(c => {
                        const ticketStatus = c.ticketStatus || 'new';
                        const isCompleted = ticketStatus.toLowerCase() === 'installation complete';
                        const isInProgress = ticketStatus.toLowerCase() === 'work in progress';
                        const isAssigned = c.ticketAssignedTo && c.ticketAssignedTo !== '';
                        
                        return (
                          <tr
                            key={c.id}
                            onClick={() => c.ticketId && navigate(`/admin/tickets/view/${c.ticketId}`)}
                            style={{ cursor: c.ticketId ? 'pointer' : 'default' }}
                            className={c.ticketId ? 'clickable-row' : ''}
                          >
                            <td>#{c.id}</td>
                            <td>
                              <strong>{c.name}</strong>
                              {c.address && <div style={{fontSize: '12px', color: '#666'}}>{c.address}</div>}
                            </td>
                            <td>{c.phone || '-'}</td>
                            <td>{c.ticketType || 'Installation'}</td>
                            <td>
                              {c.ticketInstallationPrice != null
                                ? Number(c.ticketInstallationPrice).toLocaleString('en-KE')
                                : '-'}
                            </td>
                            <td>
                              {c.ticketId ? (
                                <span className="badge bg-info">#{c.ticketNumber || c.ticketId}</span>
                              ) : (
                                <span className="text-muted">No ticket</span>
                              )}
                            </td>
                            <td>
                              <span className={`badge ${
                                isCompleted ? 'bg-success' : 
                                isInProgress ? 'bg-warning' :
                                isAssigned ? 'bg-info' : 'bg-secondary'
                              }`}>
                                {ticketStatus}
                              </span>
                            </td>
                            <td>
                              {c.ticketAssignedTo ? (
                                <span>{getAssignedToName(c.ticketAssignedTo)}</span>
                              ) : (
                                <span className="text-muted">Unassigned</span>
                              )}
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {c.created_at ? (
                                <>
                                  <div>{formatTicketDateVeryShort(c.created_at)}</div>
                                  <div style={{ fontSize: '11px', color: '#8094ae' }}>{getTimeAgo(c.created_at)}</div>
                                </>
                              ) : '—'}
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {c.updated_at ? (
                                <>
                                  <div>{formatTicketDateVeryShort(c.updated_at)}</div>
                                  <div style={{ fontSize: '11px', color: '#8094ae' }}>{getTimeAgo(c.updated_at)}</div>
                                </>
                              ) : '—'}
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <div className="d-flex align-items-center gap-1">
                                {c.ticketId && (
                                  <Link
                                    to={`/admin/tickets/view/${c.ticketId}`}
                                    className="btn btn-sm btn-outline-info d-inline-flex align-items-center"
                                    style={{fontSize: '11px', padding: '4px 10px', lineHeight: 1, gap: '4px'}}
                                  >
                                    <Icon name="eye" style={{fontSize: '14px'}} /> View
                                  </Link>
                                )}
                                {c.ticketId && (
                                  <Button
                                    size="sm"
                                    color="primary"
                                    outline
                                    className="d-inline-flex align-items-center"
                                    onClick={() => startEditTicket(c)}
                                    style={{fontSize: '11px', padding: '4px 10px', lineHeight: 1, gap: '4px'}}
                                  >
                                    <Icon name="edit" style={{fontSize: '14px'}} /> Edit
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        </Block>
      </Content>
      
      {/* Edit Ticket Modal */}
      <Modal isOpen={editModal} toggle={cancelEdit} size="md">
        <ModalHeader toggle={cancelEdit} className="bg-primary text-white">
          <Icon name="edit" className="me-2" />
          Edit Ticket - {editingCustomer?.name}
        </ModalHeader>
        <ModalBody className="p-4">
          {editingCustomer && (
            <div>
              <div className="row mb-3">
                <div className="col-12">
                  <div className="p-3 bg-light rounded">
                    <div className="row">
                      <div className="col-6">
                        <strong>Customer:</strong> {editingCustomer.name}<br />
                        <strong>Phone:</strong> {editingCustomer.phone || 'N/A'}
                      </div>
                      <div className="col-6">
                        <strong>Ticket:</strong> #{editingCustomer.ticketNumber || editingCustomer.ticketId}<br />
                        <strong>Current Status:</strong> <span className="badge bg-info">{editingCustomer.ticketStatus}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="row mb-3">
                <div className="col-12">
                  <label className="form-label"><strong>Ticket Subject</strong></label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.subject || ''}
                    onChange={(e) => setEditForm(prev => ({...prev, subject: e.target.value}))}
                    placeholder="Enter ticket subject..."
                  />
                </div>
              </div>
              
              <div className="row mb-3">
                <div className="col-6">
                  <label className="form-label"><strong>Status</strong></label>
                  <select
                    className="form-control"
                    value={editForm.status || ''}
                    onChange={(e) => setEditForm(prev => ({...prev, status: e.target.value}))}
                  >
                    <option value="">Select Status</option>
                    <option value="new">New</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
                <div className="col-6">
                  <label className="form-label"><strong>Assigned To</strong></label>
                  <select
                    className="form-control"
                    value={editForm.assigned_to || ''}
                    onChange={(e) => setEditForm(prev => ({...prev, assigned_to: e.target.value}))}
                  >
                    <option value="">Unassigned</option>
                    {editingCustomer?.ticketAssignedTo && (
                      <option value={editingCustomer.ticketAssignedTo}>
                        {getAssignedToName(editingCustomer.ticketAssignedTo)}
                      </option>
                    )}
                  </select>
                </div>
              </div>
              
              <div className="row mt-4">
                <div className="col-12">
                  <div className="d-flex gap-2 justify-content-end">
                    <Button
                      color="secondary"
                      onClick={cancelEdit}
                    >
                      <Icon name="x" className="me-2" />
                      Cancel
                    </Button>
                    <Button
                      color="primary"
                      onClick={saveTicketEdit}
                      disabled={!editForm.subject?.trim() || !editForm.status}
                    >
                      <Icon name="check" className="me-2" />
                      Save Changes
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </ModalBody>
      </Modal>
    </React.Fragment>
  );
};

const mapStateToProps = (state) => ({ user: state.auth.currentUser });
export default connect(mapStateToProps)(ListCustomerCreator);
