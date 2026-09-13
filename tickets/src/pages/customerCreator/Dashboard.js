import React, { useEffect, useMemo, useState } from "react";
import { connect } from 'react-redux';
import { Link } from "react-router-dom";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import { Card, Row, Col } from "reactstrap";
import { Block, BlockHead, BlockHeadContent, BlockTitle, Button, Icon } from "../../components/Component";
import moment from 'moment';
import { BarChartExample } from "../../components/charts/Chart";
import '../../utils/chart-setup';
import { getActivityTime, isInstallationComplete } from "../../utils/customerCreatorFilters";

const listBase = `${process.env.PUBLIC_URL}/admin/customer-creater/list`;

const CustomerCreatorDashboard = ({ user }) => {
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [stats, setStats] = useState({});
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const displayUser = (u) => u?.display_name || u?.name || u?.username || u?.email || 'Unknown';
  const currentCreator = displayUser(user);

  const load = async () => {
    setLoading(true);
    try {
      // Load customer creators data
      const { default: CustomerCreaterAPI } = await import('../../helpers/CustomerCreaterAPI');
      
      // Get all customer creators created by current user (no pagination limit)
      const resp = await CustomerCreaterAPI.listByUser(currentCreator, { per_page: 10000 });
      const customerData = resp.data || [];
      setCustomers(customerData);
      
      // Get statistics for current user
      const statsResp = await CustomerCreaterAPI.getStats({ created_by: currentCreator });
      setStats(statsResp.data || {});
      
      setLastRefresh(new Date());
    } catch (e) {
      console.error('Failed to load customer creator data', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Summary cards based on installation status
  const totalPosted = useMemo(() => customers.length, [customers]);
  const totalCompleted = useMemo(() => 
    customers.filter(isInstallationComplete).length, 
    [customers]
  );
  const installedToday = useMemo(() => 
    customers.filter(c => {
      const at = getActivityTime(c);
      return isInstallationComplete(c) && at && at.isSame(moment(), 'day');
    }).length, 
    [customers]
  );
  const installedThisMonth = useMemo(() => 
    customers.filter(c => {
      const at = getActivityTime(c);
      return isInstallationComplete(c) && at && at.isSame(moment(), 'month');
    }).length, 
    [customers]
  );

  // Chart: Customer creators added vs installations completed (last 14 days)
  const chartData = useMemo(() => {
    const days = 14;
    const labels = [];
    const addedCounts = [];
    const installedCounts = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const day = moment().subtract(i, 'days');
      labels.push(day.format('MMM DD'));
      
      const added = customers.filter(c => {
        const at = getActivityTime(c);
        return at && at.isSame(day, 'day');
      }).length;
      const installed = customers.filter(c => {
        const at = getActivityTime(c);
        return isInstallationComplete(c) && at && at.isSame(day, 'day');
      }).length;
      
      addedCounts.push(added);
      installedCounts.push(installed);
    }
    
    return {
      labels,
      datasets: [
        {
          label: 'Ticket activity',
          data: addedCounts,
          backgroundColor: 'rgba(53, 123, 242, 0.4)',
          borderColor: '#357bf2',
          borderWidth: 2,
          fill: true,
        },
        {
          label: 'Installations Completed',
          data: installedCounts,
          backgroundColor: 'rgba(41, 204, 151, 0.4)',
          borderColor: '#29cc97',
          borderWidth: 2,
          fill: true,
        }
      ]
    };
  }, [customers]);

  // Recent activities (last 10 customer creators with ticket status)
  const recentActivities = useMemo(() => {
    const items = [...customers]
      .sort((a, b) => {
        const ta = getActivityTime(a);
        const tb = getActivityTime(b);
        return (tb ? tb.valueOf() : 0) - (ta ? ta.valueOf() : 0);
      })
      .slice(0, 10)
      .map(c => ({
        id: c.id,
        name: c.name,
        ticketId: c.ticketId,
        ticketStatus: c.ticketStatus || 'new',
        ticketAssignedTo: c.ticketAssignedTo,
        phone: c.phone,
        address: c.address,
        timestamp: c.ticket_updated_at || c.updated_at,
      }));
    return items;
  }, [customers]);

  return (
    <React.Fragment>
      <Head title="Customer Creator - Dashboard" />
      <Content>
        <BlockHead size="sm">
          <BlockHeadContent>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <BlockTitle page tag="h3">Customer Creator Dashboard</BlockTitle>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Button className={`btn btn-outline-dark btn-icon ${loading ? 'disabled' : ''}`} onClick={load} disabled={loading} title="Refresh">
                  <Icon name={loading ? 'loader' : 'reload'} className={loading ? 'spinning' : ''} />
                </Button>
                <span style={{ fontSize: 12, color: '#6c757d' }}>Last updated: {lastRefresh.toLocaleTimeString()}</span>
              </div>
            </div>
          </BlockHeadContent>
        </BlockHead>

        {/* Summary Cards */}
        <Block>
          <Row className="g-gs dashboard-top">
            <Col sm="6" md="3" className="dashboards-top-block-item">
              <Card>
                <Link to={`${listBase}?metric=posted`} className="dashboards-top-block-item-link-absolute action-click" title="View all posted customers" />
                <div className="card-inner p-0">
                  <div className="dashboards-top-block-item-title">
                    <span className="icon-wrap">
                      <Icon name="plus" />
                    </span>
                    <span className="text">Total Posted</span>
                  </div>
                  <div className="dashboards-top-block-item-bottom">
                    <span className="view">All Time · Click to view</span>
                    <span className="count">{loading ? '...' : totalPosted}</span>
                  </div>
                </div>
              </Card>
            </Col>

            <Col sm="6" md="3" className="dashboards-top-block-item">
              <Card>
                <Link to={`${listBase}?metric=completed`} className="dashboards-top-block-item-link-absolute action-click" title="View all completed installations" />
                <div className="card-inner p-0">
                  <div className="dashboards-top-block-item-title">
                    <span className="icon-wrap">
                      <Icon name="check" />
                    </span>
                    <span className="text">Total Completed</span>
                  </div>
                  <div className="dashboards-top-block-item-bottom">
                    <span className="view">Installations Done · Click to view</span>
                    <span className="count">{loading ? '...' : totalCompleted}</span>
                  </div>
                </div>
              </Card>
            </Col>

            <Col sm="6" md="3" className="dashboards-top-block-item">
              <Card>
                <Link to={`${listBase}?metric=completed_today`} className="dashboards-top-block-item-link-absolute action-click" title="View completed today" />
                <div className="card-inner p-0">
                  <div className="dashboards-top-block-item-title">
                    <span className="icon-wrap">
                      <Icon name="calendar" />
                    </span>
                    <span className="text">Completed Today</span>
                  </div>
                  <div className="dashboards-top-block-item-bottom">
                    <span className="view">Installations · Click to view</span>
                    <span className="count">{loading ? '...' : installedToday}</span>
                  </div>
                </div>
              </Card>
            </Col>

            <Col sm="6" md="3" className="dashboards-top-block-item">
              <Card>
                <Link to={`${listBase}?metric=completed_month`} className="dashboards-top-block-item-link-absolute action-click" title="View completed this month" />
                <div className="card-inner p-0">
                  <div className="dashboards-top-block-item-title">
                    <span className="icon-wrap">
                      <Icon name="chart" />
                    </span>
                    <span className="text">Completed This Month</span>
                  </div>
                  <div className="dashboards-top-block-item-bottom">
                    <span className="view">Installations · Click to view</span>
                    <span className="count">{loading ? '...' : installedThisMonth}</span>
                  </div>
                </div>
              </Card>
            </Col>
          </Row>
        </Block>

        {/* Installation Activity Chart */}
        <Block>
          <Card>
            <div className="card-header"><strong>Activity vs Completed Installations (Last 14 days)</strong></div>
            <div className="card-body" style={{ height: 320 }}>
              <BarChartExample data={chartData} className="bar-chart" />
            </div>
          </Card>
        </Block>

        {/* Recent Activities */}
        <Block>
          <Card>
            <div className="card-header"><strong>Recent Customer Activities</strong></div>
            <div className="card-body">
              {recentActivities.length === 0 ? (
                <div className="text-muted">No recent customers added.</div>
              ) : (
                <div className="list-group">
                  {recentActivities.map(act => {
                    const isCompleted = act.ticketStatus.toLowerCase() === 'installation complete';
                    const isAssigned = act.ticketAssignedTo && act.ticketAssignedTo !== '';
                    
                    return (
                      <div key={act.id} className="list-group-item d-flex justify-content-between align-items-center" style={{ padding: '10px 12px', border: 'none', borderBottom: '1px solid #e5e9f2' }}>
                        <div>
                          <div style={{ fontWeight: 600, color: '#364a63' }}>
                            {act.name}
                            {act.ticketId && <span className="badge bg-info ms-2">Ticket #{act.ticketId}</span>}
                          </div>
                          <div style={{ fontSize: 12, color: '#8094ae' }}>
                            Status: <span className={`badge ${
                              isCompleted ? 'bg-success' : isAssigned ? 'bg-warning' : 'bg-secondary'
                            }`} style={{fontSize: '10px'}}>
                              {act.ticketStatus}
                            </span>
                            • Phone: {act.phone}
                            {isAssigned && <span> • Assigned to: {act.ticketAssignedTo}</span>}
                          </div>
                          {act.address && <div style={{ fontSize: 11, color: '#8094ae' }}>Address: {act.address}</div>}
                        </div>
                        <div style={{ fontSize: 12, color: '#8094ae' }}>{act.timestamp ? moment(act.timestamp).fromNow() : '-'}</div>
                      </div>
                    );
                  })}
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
export default connect(mapStateToProps)(CustomerCreatorDashboard);
