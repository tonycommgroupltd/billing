import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import Head from "../../../layout/head/Head";
import Content from "../../../layout/content/Content";
import { Card } from "reactstrap";
import { Block, BlockBetween, BlockHead, BlockHeadContent, BlockTitle, Button, Icon } from "../../../components/Component";
import { Link } from "react-router-dom";
import moment from 'moment';
import LogsAPI from '../../../helpers/LogsAPI';
import { useActivityLogger, ACTIVITY_TYPES, TARGET_TYPES } from '../../../hooks/useActivityLogger';

const ActivityLogsList = ({ user }) => {
  const logActivity = useActivityLogger();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({});
  const [filters, setFilters] = useState({
    page: 1,
    limit: 50,
    activity_type: '',
    user_name: '',
    target_type: '',
    start_date: '',
    end_date: '',
    search: ''
  });

  const activityTypeColors = {
    'login': 'success',
    'logout': 'info',
    'create': 'primary',
    'update': 'warning',
    'delete': 'danger',
    'view': 'light',
    'system': 'dark'
  };

  const targetTypeIcons = {
    'ticket': 'ticket',
    'customer': 'user',
    'user': 'users',
    'system': 'settings'
  };

  useEffect(() => {
    loadLogs();
  }, [filters]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const response = await LogsAPI.getAll(filters);
      setLogs(response.data || []);
      setPagination(response.pagination || {});
      
      // Log viewing of activity logs page (only on initial load, not on filter changes)
      if (filters.page === 1 && !filters.search && !filters.activity_type) {
        await logActivity(
          ACTIVITY_TYPES.PAGE_VIEWED,
          'Viewed activity logs list',
          TARGET_TYPES.PAGE,
          null
        );
      }
    } catch (error) {
      console.error('Error loading logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({
      ...prev,
      [field]: value,
      page: field === 'page' ? value : 1 // Reset to page 1 when changing filters
    }));
  };

  const clearFilters = () => {
    setFilters({
      page: 1,
      limit: 50,
      activity_type: '',
      user_name: '',
      target_type: '',
      start_date: '',
      end_date: '',
      search: ''
    });
  };

  const formatUserAgent = (userAgent) => {
    if (!userAgent) return 'Unknown';
    
    // Simple browser detection
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Other';
  };

  return (
    <React.Fragment>
      <Head title="Activity Logs" />
      <Content>
        <BlockHead size="sm">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle tag="h3" page>
                Activity Logs
              </BlockTitle>
              <div className="nk-block-des text-soft">
                <p>Monitor all system activities and user actions.</p>
              </div>
            </BlockHeadContent>
            <BlockHeadContent>
              <Link to="/admin/logs/active-users" className="btn btn-outline-primary">
                <Icon name="users" />
                <span>Active Users</span>
              </Link>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>

        <Block>
          <Card className="card-bordered card-preview">
            <div className="card-inner">
              {/* Filters */}
              <div className="row mb-4">
                <div className="col-md-2">
                  <label className="form-label">Activity Type</label>
                  <select 
                    className="form-control"
                    value={filters.activity_type}
                    onChange={(e) => handleFilterChange('activity_type', e.target.value)}
                  >
                    <option value="">All Types</option>
                    <option value="login">Login</option>
                    <option value="logout">Logout</option>
                    <option value="create">Create</option>
                    <option value="update">Update</option>
                    <option value="delete">Delete</option>
                    <option value="view">View</option>
                    <option value="system">System</option>
                  </select>
                </div>
                
                <div className="col-md-2">
                  <label className="form-label">Target Type</label>
                  <select 
                    className="form-control"
                    value={filters.target_type}
                    onChange={(e) => handleFilterChange('target_type', e.target.value)}
                  >
                    <option value="">All Targets</option>
                    <option value="ticket">Tickets</option>
                    <option value="customer">Customers</option>
                    <option value="user">Users</option>
                    <option value="system">System</option>
                  </select>
                </div>
                
                <div className="col-md-2">
                  <label className="form-label">User Name</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Search user..."
                    value={filters.user_name}
                    onChange={(e) => handleFilterChange('user_name', e.target.value)}
                  />
                </div>
                
                <div className="col-md-2">
                  <label className="form-label">Start Date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={filters.start_date}
                    onChange={(e) => handleFilterChange('start_date', e.target.value)}
                  />
                </div>
                
                <div className="col-md-2">
                  <label className="form-label">End Date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={filters.end_date}
                    onChange={(e) => handleFilterChange('end_date', e.target.value)}
                  />
                </div>
                
                <div className="col-md-2">
                  <label className="form-label">&nbsp;</label>
                  <div>
                    <Button color="primary" onClick={loadLogs} className="me-2">
                      <Icon name="reload" /> Refresh
                    </Button>
                    <Button color="secondary" onClick={clearFilters}>
                      <Icon name="cross" /> Clear
                    </Button>
                  </div>
                </div>
              </div>

              {/* Search */}
              <div className="row mb-3">
                <div className="col-md-4">
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Search activity descriptions..."
                    value={filters.search}
                    onChange={(e) => handleFilterChange('search', e.target.value)}
                  />
                </div>
                <div className="col-md-8 text-end">
                  <span className="text-muted">
                    {pagination.total ? `Showing ${((pagination.page - 1) * pagination.limit) + 1}-${Math.min(pagination.page * pagination.limit, pagination.total)} of ${pagination.total} entries` : ''}
                  </span>
                </div>
              </div>

              {/* Logs Table */}
              <div className="table-responsive">
                <table className="table table-striped">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>User</th>
                      <th>Activity</th>
                      <th>Description</th>
                      <th>Target</th>
                      <th>IP/Browser</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="text-center text-muted py-4">
                          <Icon name="loader" className="spinner" /> Loading...
                        </td>
                      </tr>
                    ) : logs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center text-muted py-4">
                          No activity logs found
                        </td>
                      </tr>
                    ) : (
                      logs.map((log) => (
                        <tr key={log.id}>
                          <td>
                            <div style={{fontSize: '12px'}}>
                              <strong>{moment(log.created_at).format('MMM DD, YYYY')}</strong><br />
                              {moment(log.created_at).format('HH:mm:ss')}
                            </div>
                          </td>
                          <td>
                            <div>
                              <strong>{log.user_name || 'System'}</strong>
                              {log.user_email && (
                                <div style={{fontSize: '11px', color: '#666'}}>
                                  {log.user_email}
                                </div>
                              )}
                            </div>
                          </td>
                          <td>
                            <span className={`badge bg-${activityTypeColors[log.activity_type] || 'secondary'}`}>
                              {log.activity_type.charAt(0).toUpperCase() + log.activity_type.slice(1)}
                            </span>
                          </td>
                          <td>
                            <div style={{fontSize: '13px'}}>
                              {log.activity_description}
                            </div>
                          </td>
                          <td>
                            {log.target_type && (
                              <div className="d-flex align-items-center">
                                <Icon name={targetTypeIcons[log.target_type] || 'dot-circle'} className="me-1" />
                                <span style={{fontSize: '12px'}}>
                                  {log.target_type}
                                  {log.target_id && ` #${log.target_id}`}
                                </span>
                              </div>
                            )}
                          </td>
                          <td>
                            <div style={{fontSize: '11px'}}>
                              {log.ip_address && (
                                <div><Icon name="globe" className="me-1" />{log.ip_address}</div>
                              )}
                              {log.user_agent && (
                                <div><Icon name="monitor" className="me-1" />{formatUserAgent(log.user_agent)}</div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagination.pages > 1 && (
                <div className="d-flex justify-content-between align-items-center mt-4">
                  <div>
                    <select
                      className="form-control"
                      style={{width: 'auto', display: 'inline-block'}}
                      value={filters.limit}
                      onChange={(e) => handleFilterChange('limit', e.target.value)}
                    >
                      <option value={25}>25 per page</option>
                      <option value={50}>50 per page</option>
                      <option value={100}>100 per page</option>
                    </select>
                  </div>
                  
                  <div className="d-flex gap-1">
                    <Button
                      color="light"
                      size="sm"
                      disabled={pagination.page <= 1}
                      onClick={() => handleFilterChange('page', pagination.page - 1)}
                    >
                      Previous
                    </Button>
                    
                    <span className="px-3 py-1 text-muted">
                      Page {pagination.page} of {pagination.pages}
                    </span>
                    
                    <Button
                      color="light"
                      size="sm"
                      disabled={pagination.page >= pagination.pages}
                      onClick={() => handleFilterChange('page', pagination.page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </Block>
      </Content>
    </React.Fragment>
  );
};

const mapStateToProps = (state) => ({ user: state.auth.currentUser });
export default connect(mapStateToProps)(ActivityLogsList);