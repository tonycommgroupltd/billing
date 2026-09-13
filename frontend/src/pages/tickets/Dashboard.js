import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { connect } from "react-redux";
import Head from "../../layout/head/Head";
import Content from "../../layout/content/Content";
import { Card, Row, Col } from "reactstrap";
import {
  Block,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Button,
  Icon,
} from "../../components/Component";
import { Link } from "react-router-dom";
import { 
  DocumentBulletList24Regular, 
  Settings24Regular, 
  CheckmarkCircle24Regular, 
  Person24Regular,
  Add24Regular,
  ArrowClockwise24Regular,
  Wrench24Regular
} from '@fluentui/react-icons';
// Bonus system disabled
// import BonusAPI from '../../helpers/BonusAPI';
import { BarChartExample } from "../../components/charts/Chart";
import { ticketsResolvedData, generateTicketsDataForDateRange, agentPerformanceData, generateRecentActivities, getActivityIcon, getPriorityColor, getTimeAgo } from "../../components/partials/charts/tickets/TicketsData";
import DateRangePicker from 'react-bootstrap-daterangepicker';
import moment from 'moment';
import 'bootstrap-daterangepicker/daterangepicker.css';
// Import Chart.js setup
import '../../utils/chart-setup';
import { useActivityLogger, ACTIVITY_TYPES, TARGET_TYPES } from '../../hooks/useActivityLogger';
import { ticketsHttp as http } from '../../helpers/ticketsHttp';
import {
  fetchTodayTeamProfiles,
  fetchTeamGroupTickets,
  isFieldUserWithTeamPool,
  ticketVisibleToFieldUser,
} from '../../utils/teamTicketAccess';
import {
  parseTicketStatsResponse,
  calculateTicketStats,
  isTicketUnassigned,
} from '../../utils/ticketDashboardStats';

// Helper function to format assignedTo name (extract username from "Name (email)" format)
const formatAssignedToName = (assignedTo) => {
  if (!assignedTo || assignedTo === '0' || assignedTo === '-') return 'System';
  
  const assignedStr = assignedTo.toString().trim();
  
  // If it contains parentheses, extract the name part before them
  const match = assignedStr.match(/^(.+?)\s*\(/);
  if (match) {
    return match[1].trim();
  }
  
  // If it looks like an email (contains @), extract the part before @ and format it
  if (assignedStr.includes('@')) {
    const emailName = assignedStr.split('@')[0];
    return emailName
      .split(/[._-]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  
  // Otherwise return as-is (it's already a username/name)
  return assignedStr;
};

const TicketsDashboard = ({ user }) => {
  const navigate = useNavigate();
  const logActivity = useActivityLogger();
  const [data, setData] = useState({ newTickets: 0, workInProgress: 0, resolved: 0, waitingOnAgent: 0 });
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // Only technicians get filtered - exclude if they have admin/super-admin/manager roles
  const isTechnician = user?.all_roles?.includes('technician') && 
    !user?.all_roles?.includes('administrator') && 
    !user?.all_roles?.includes('super-administrator') &&
    !user?.all_roles?.includes('manager');
  const useTeamTicketPool = isFieldUserWithTeamPool(user);
  const currentUserId = user?.id;
  const currentUserName = user?.name || user?.username;
  const [teamProfiles, setTeamProfiles] = useState([]);

  const [chartType, setChartType] = useState('resolved');
  const [chartData, setChartData] = useState(ticketsResolvedData);
  const [dateRange, setDateRange] = useState({
    start: moment().subtract(7, 'days'),
    end: moment()
  });
  const [dateRangeString, setDateRangeString] = useState(`${moment().subtract(7, 'days').format('YYYY-MM-DD')} - ${moment().format('YYYY-MM-DD')}`);
  const [datasetVisibility, setDatasetVisibility] = useState({
    Created: true,
    Reopened: true,
    Resolved: true
  });
  const [recentActivities, setRecentActivities] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [assignedToMeTickets, setAssignedToMeTickets] = useState([]);
  const [adminTickets, setAdminTickets] = useState([]);
  const [adminStatusFilter, setAdminStatusFilter] = useState('all');
  const [installationTickets, setInstallationTickets] = useState(0);
  const [unassignedTickets, setUnassignedTickets] = useState(0);
  const [administrators, setAdministrators] = useState([]);
  
  // Bonus system disabled
  // const [bonusData, setBonusData] = useState(null);
  // const [bonusLoading, setBonusLoading] = useState(false);
  // const isEngineerOrTechnician = user?.all_roles?.includes('technician') || user?.all_roles?.includes('engineer');
  
  // Helper function to check if ticket is assigned to current user
  const isTicketAssignedToMe = (ticket) => {
    if (useTeamTicketPool && teamProfiles.length > 0) {
      return ticketVisibleToFieldUser(ticket, user, teamProfiles);
    }

    const assigned = (ticket.assignedTo || '').toString().trim().toLowerCase();
    if (!assigned) return false;
    
    const candidates = [currentUserName, user?.username, user?.email, user?.name]
      .filter(Boolean)
      .map((v) => v.toString().trim().toLowerCase());
    
    const idMatch = ticket.assignedToId && currentUserId && String(ticket.assignedToId) === String(currentUserId);
    const nameMatch = candidates.some((val) => assigned === val || assigned.includes(val));
    
    return idMatch || nameMatch;
  };

  useEffect(() => {
    if (!useTeamTicketPool || !user?.id) {
      setTeamProfiles([]);
      return;
    }
    fetchTodayTeamProfiles(http, user)
      .then(setTeamProfiles)
      .catch(() => setTeamProfiles([]));
  }, [useTeamTicketPool, user?.id, user?.name, user?.email, user?.username]);

  // Helper function to check if ticket is assigned to an administrator
  const isTicketAssignedToAdmin = (ticket, adminsList) => {
    if (!ticket.assignedTo || !adminsList || adminsList.length === 0) return false;
    const assigned = (ticket.assignedTo || '').toString().trim().toLowerCase();
    if (!assigned || assigned === '0' || assigned === 'unassigned') return false;
    
    // Check against the list of administrators
    return adminsList.some(admin => {
      const adminEmail = (admin.email || '').toLowerCase();
      const adminName = (admin.name || '').toLowerCase();
      const adminUsername = (admin.username || '').toLowerCase();
      
      // Extract name from "Name (email)" format if present
      const namePart = assigned.includes('(') ? assigned.split('(')[0].trim() : assigned;
      const emailPart = assigned.includes('(') && assigned.includes(')') 
        ? assigned.match(/\(([^)]+)\)/)?.[1]?.toLowerCase() 
        : '';
      
      // Match by exact match or inclusion
      return assigned === adminEmail || 
             assigned === adminName || 
             assigned === adminUsername ||
             namePart === adminName ||
             emailPart === adminEmail ||
             emailPart === adminUsername ||
             assigned.includes(adminEmail) ||
             assigned.includes(adminName) ||
             assigned.includes(adminUsername);
    });
  };

  // Fetch administrators from the database
  const fetchAdministrators = async () => {
    try {
      const { default: UsersAPI } = await import('../../helpers/UsersAPI');
      const response = await UsersAPI.getAll({ per_page: 1000 });
      const allUsers = response.data || [];
      
      console.log('Dashboard - All users loaded:', allUsers.length);
      
      // Filter users who have 'administrator' or 'super-administrator' role
      const admins = allUsers.filter(user => {
        const roles = user.roles || [];
        const hasAdminRole = roles.some(role => {
          const roleName = typeof role === 'string' ? role : (role.name || '');
          return roleName === 'administrator' || roleName === 'super-administrator';
        });
        
        if (hasAdminRole) {
          console.log('Dashboard - Found admin:', {
            name: user.name,
            email: user.email,
            username: user.username,
            roles: roles
          });
        }
        
        return hasAdminRole;
      });
      
      console.log('Dashboard - Administrators loaded:', admins.length, admins.map(a => ({
        name: a.name,
        email: a.email,
        username: a.username
      })));
      setAdministrators(admins);
      
      // Log dashboard view activity
      await logActivity(
        ACTIVITY_TYPES.PAGE_VIEWED,
        'Viewed tickets dashboard',
        TARGET_TYPES.PAGE,
        null
      );
      
      return admins;
    } catch (error) {
      console.error('Error fetching administrators:', error);
      return [];
    }
  };

  const handleCreateTicket = () => {
    navigate('/admin/tickets/create');
  };

  const handleRefresh = () => {
    fetchRecentActivities();
  };

  const handleDateRangeChange = (event, picker) => {
    setDateRange({
      start: picker.startDate,
      end: picker.endDate
    });
    
    const startStr = picker.startDate.format('YYYY-MM-DD');
    const endStr = picker.endDate.format('YYYY-MM-DD');
    setDateRangeString(`${startStr} - ${endStr}`);
    
    // Prefer real data from tickets over random generator
    if (tickets && tickets.length) {
      const newChartData = buildChartDataFromTickets(tickets, picker.startDate, picker.endDate);
      setChartData(newChartData);
    } else {
      const newChartData = generateTicketsDataForDateRange(startStr, endStr);
      setChartData(newChartData);
    }
  };

  const handleLegendClick = (datasetLabel) => {
    setDatasetVisibility(prev => ({
      ...prev,
      [datasetLabel]: !prev[datasetLabel]
    }));
  };

  // Create filtered chart data based on visibility
  const getFilteredChartData = () => {
    return {
      ...chartData,
      datasets: chartData.datasets.map(dataset => ({
        ...dataset,
        hidden: !datasetVisibility[dataset.label]
      }))
    };
  };

  const getFilteredAdminTickets = () => {
    if (adminStatusFilter === 'all') return adminTickets;
    return adminTickets.filter(t => t.status === adminStatusFilter);
  };

  const getStatusColor = (status) => {
    const colors = {
      'new': '#357bf2',
      'work in progress': '#ffc914',
      'resolved': '#29cc97',
      'installation complete': '#29cc97',
      'waiting on customer': '#ff6b6b',
      'waiting on agent': '#ffc914',
      'customer unreachable': '#ff6b6b'
    };
    return colors[status] || '#6c757d';
  };

  const getPriorityBadgeClass = (priority) => {
    const classes = {
      'low': 'badge badge-light-secondary',
      'medium': 'badge badge-light-warning',
      'high': 'badge badge-light-danger',
      'urgent': 'badge badge-danger'
    };
    return classes[priority] || 'badge badge-light-secondary';
  };

  const fetchRecentActivities = async () => {
    setLoading(true);
    setActivitiesLoading(true);
    try {
      // Fetch administrators first if not already loaded
      let admins = administrators;
      if (admins.length === 0) {
        admins = await fetchAdministrators();
      }
      
      const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
      
      // Shared stats endpoint for New / WIP / Resolved / Installations (admin cards)
      const statsResp = await TicketsAPI.getStats();
      const apiStats = parseTicketStatsResponse(statsResp);
      
      let rawTickets = [];
      let loadedFromTeamApi = false;
      if (useTeamTicketPool) {
        try {
          const { tickets } = await fetchTeamGroupTickets(http, { excludeResolved: false });
          rawTickets = Array.isArray(tickets) ? tickets : [];
          loadedFromTeamApi = true;
        } catch {
          const resp = await TicketsAPI.getAllSlim({ per_page: 0 });
          // getAllSlim → { data: apiBody }; apiBody is usually { data: tickets[] }
          rawTickets = Array.isArray(resp?.data?.data)
            ? resp.data.data
            : (Array.isArray(resp?.data) ? resp.data : []);
        }
      } else {
        // Same slim list source as Tickets List page
        const resp = await TicketsAPI.getAllSlim({ per_page: 0 });
        rawTickets = Array.isArray(resp?.data?.data)
          ? resp.data.data
          : (Array.isArray(resp?.data) ? resp.data : []);
      }

      let all = rawTickets.map(t => {
        const formatted = formatAssignedToName(t.assignedTo);
        return { ...t, assignedTo: formatted === 'System' ? t.assignedTo : formatted };
      });
      
      if ((isTechnician || useTeamTicketPool) && !loadedFromTeamApi) {
        all = all.filter(isTicketAssignedToMe);
      }
      
      // Field users: card counts from their filtered pool. Admins: getStats() + unassigned from slim list.
      const clientStats = calculateTicketStats(all, apiStats);
      const stats = (isTechnician || useTeamTicketPool)
        ? {
            newTickets: clientStats.newTickets,
            workInProgress: clientStats.workInProgress,
            resolved: clientStats.resolved,
            waitingOnAgent: clientStats.waitingOnAgent,
          }
        : {
            newTickets: apiStats.newTickets,
            workInProgress: apiStats.workInProgress,
            resolved: apiStats.resolved,
            waitingOnAgent: apiStats.waitingOnAgent,
          };
      const unassignedCount = (isTechnician || useTeamTicketPool)
        ? clientStats.unassigned
        : all.filter(isTicketUnassigned).length;

      const myTickets = [];
      const adminAssignedTickets = [];
      const activities = [];
      
      all.forEach(t => {
        if (isTicketAssignedToMe(t)) {
          myTickets.push(t);
        }
        
        if (!isTechnician && isTicketAssignedToAdmin(t, admins)) {
          adminAssignedTickets.push(t);
        }
        
        const agentName = formatAssignedToName(t.assignedTo);
        activities.push({
          id: t.id,
          agent: { 
            name: agentName, 
            initials: agentName.slice(0,2).toUpperCase(), 
            color: '#e9ecef',
            avatar: null
          },
          type: 'status_change',
          details: t.description || t.subject,
          message: t.description || 'Ticket activity',
          ticket: { id: t.id, title: `${t.subject} #${t.id}` },
          timestamp: new Date(t.updated_at || t.created_at || Date.now())
        });
      });
      
      const ticketsForChart = all;
      const initialChart = buildChartDataFromTickets(
        ticketsForChart,
        dateRange.start,
        dateRange.end
      );
      
      setData(stats);
      setLastRefresh(new Date());
      setRecentActivities(activities.slice(0, 10));
      setTickets(all);
      setAssignedToMeTickets(myTickets);
      setAdminTickets(adminAssignedTickets);
      setInstallationTickets(apiStats.installations);
      setUnassignedTickets(unassignedCount);
      setChartData(initialChart);
      
    } catch (error) {
      console.error('Error fetching recent activities:', error);
    } finally {
      setLoading(false);
      setActivitiesLoading(false);
    }
  };

  // Build chart data (Created, Reopened, Resolved) from tickets within a date range
  const buildChartDataFromTickets = (ticketsList, startMoment, endMoment) => {
    const start = startMoment.clone().startOf('day');
    const end = endMoment.clone().startOf('day');
    const days = end.diff(start, 'days') + 1;
    const labels = [];
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    for (let i = 0; i < days; i++) {
      const d = start.clone().add(i, 'days');
      labels.push(`${monthNames[d.month()]} ${d.date()}`);
    }

    const createdData = Array(days).fill(0);
    const reopenedData = Array(days).fill(0);
    const resolvedData = Array(days).fill(0);

    const toIndex = (m) => {
      const dm = m.clone().startOf('day');
      const diff = dm.diff(start, 'days');
      return diff >= 0 && diff < days ? diff : -1;
    };

    (ticketsList || []).forEach(t => {
      const createdAt = t.created_at ? moment(t.created_at) : null;
      const updatedAt = t.updated_at ? moment(t.updated_at) : null;
      // Created
      if (createdAt) {
        const idx = toIndex(createdAt);
        if (idx !== -1) createdData[idx] += 1;
      }
      const status = (t.status || '').toString().toLowerCase();
      // Resolved: count at updatedAt if present, else at createdAt
      // Also count "installation complete" as resolved for the graph
      if (status === 'resolved' || status === 'installation complete') {
        const m = updatedAt || createdAt;
        if (m) {
          const idx = toIndex(m);
          if (idx !== -1) resolvedData[idx] += 1;
        }
      }
      // Reopened: if we have explicit status or flag; fallback none
      if (status.includes('reopen')) {
        const m = updatedAt || createdAt;
        if (m) {
          const idx = toIndex(m);
          if (idx !== -1) reopenedData[idx] += 1;
        }
      }
    });

    return {
      labels,
      dataUnit: 'Tickets',
      datasets: [
        {
          label: 'Created',
          backgroundColor: '#FFC914',
          borderColor: '#FFC914',
          data: createdData,
          barPercentage: 0.7,
          categoryPercentage: 0.7,
        },
        {
          label: 'Reopened',
          backgroundColor: '#367BF5',
          borderColor: '#367BF5',
          data: reopenedData,
          barPercentage: 0.7,
          categoryPercentage: 0.7,
        },
        {
          label: 'Resolved',
          backgroundColor: '#29CC97',
          borderColor: '#29CC97',
          data: resolvedData,
          barPercentage: 0.7,
          categoryPercentage: 0.7,
        }
      ]
    };
  };

  // Bonus system disabled
  // const fetchBonusData = async () => { ... };

  useEffect(() => {
    // Fetch administrators and then fetch tickets
    const initDashboard = async () => {
      await fetchAdministrators();
      await fetchRecentActivities();
      // Bonus system disabled
      // if (isEngineerOrTechnician) { await fetchBonusData(); }
    };
    initDashboard();
  }, [teamProfiles, useTeamTicketPool, isTechnician]);

  return (
    <React.Fragment>
      <Head title="Tickets Dashboard"></Head>
      <Content>
        <BlockHead size="sm">
          <BlockHeadContent>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%'}}>
              <BlockTitle page tag="h3">
                Tickets Dashboard {(isTechnician || useTeamTicketPool) && <span style={{fontSize: '14px', color: '#6c757d', fontWeight: 'normal'}}>(Your Team&apos;s Tickets)</span>}
              </BlockTitle>
              <div className="filter-inputs" style={{display: 'flex', gap: '10px'}}>
                {!isTechnician && <div className="filter-button">
                  <Button 
                    className="btn btn-outline-primary" 
                    onClick={handleCreateTicket}
                  >
                    Create ticket
                  </Button>
                </div>}
                <div className="filter-button">
                  <Button 
                    className={`btn btn-outline-dark btn-icon ${loading ? 'disabled' : ''}`} 
                    onClick={handleRefresh}
                    disabled={loading}
                    title="Refresh Dashboard"
                  >
                    <Icon name={loading ? "loader" : "reload"} className={loading ? "spinning" : ""} />
                  </Button>
                </div>
                <div className="filter-info" style={{fontSize: '12px', color: '#6c757d'}}>
                  Last updated: {lastRefresh.toLocaleTimeString()}
                </div>
              </div>
            </div>
          </BlockHeadContent>
        </BlockHead>
        <Block>
          {/* Top Status Cards - Using finance dashboard style */}
          <Row className="g-gs dashboard-top">
            <Col sm="6" md="3" className="dashboards-top-block-item">
              <Card>
                <div className="card-inner p-0">
                  <div className="dashboards-top-block-item-title">
                    <span className="icon-wrap">
                      <DocumentBulletList24Regular />
                    </span>
                    <span className="text">New</span>
                  </div>
                  <div className="dashboards-top-block-item-bottom">
                    <span className="view">Tickets</span>
                    <span className="count">{loading ? '...' : data.newTickets}</span>
                  </div>
                  <Link to={`${process.env.PUBLIC_URL}/admin/tickets/list?status=new&filter=all`} className="dashboards-top-block-item-link-absolute action-click" />
                </div>
              </Card>
            </Col>

            <Col sm="6" md="3" className="dashboards-top-block-item">
              <Card>
                <div className="card-inner p-0">
                  <div className="dashboards-top-block-item-title">
                    <span className="icon-wrap">
                      <Settings24Regular />
                    </span>
                    <span className="text">Work in Progress</span>
                  </div>
                  <div className="dashboards-top-block-item-bottom">
                    <span className="view">Tickets</span>
                    <span className="count">{loading ? '...' : data.workInProgress}</span>
                  </div>
                  <Link to={`${process.env.PUBLIC_URL}/admin/tickets/list?status=open&filter=all`} className="dashboards-top-block-item-link-absolute action-click" />
                </div>
              </Card>
            </Col>

            <Col sm="6" md="3" className="dashboards-top-block-item">
              <Card>
                <div className="card-inner p-0" style={isTechnician ? { cursor: 'default' } : {}}>
                  <div className="dashboards-top-block-item-title">
                    <span className="icon-wrap">
                      <CheckmarkCircle24Regular />
                    </span>
                    <span className="text">Resolved</span>
                  </div>
                  <div className="dashboards-top-block-item-bottom">
                    <span className="view">Tickets</span>
                    <span className="count">{loading ? '...' : data.resolved}</span>
                  </div>
                  {!isTechnician && (
                    <Link to={`${process.env.PUBLIC_URL}/admin/tickets/closed`} className="dashboards-top-block-item-link-absolute action-click" />
                  )}
                </div>
              </Card>
            </Col>

            {!isTechnician && <Col sm="6" md="3" className="dashboards-top-block-item">
              <Card>
                <div className="card-inner p-0">
                  <div className="dashboards-top-block-item-title">
                    <span className="icon-wrap">
                      <Wrench24Regular />
                    </span>
                    <span className="text">Installation</span>
                  </div>
                  <div className="dashboards-top-block-item-bottom">
                    <span className="view">Tickets</span>
                    <span className="count">{loading ? '...' : installationTickets}</span>
                  </div>
                  <Link to={`${process.env.PUBLIC_URL}/admin/tickets/installations`} className="dashboards-top-block-item-link-absolute action-click" />
                </div>
              </Card>
            </Col>}

            {!isTechnician && <Col sm="6" md="3" className="dashboards-top-block-item">
              <Card>
                <div className="card-inner p-0">
                  <div className="dashboards-top-block-item-title">
                    <span className="icon-wrap">
                      <Person24Regular />
                    </span>
                    <span className="text">Unassigned</span>
                  </div>
                  <div className="dashboards-top-block-item-bottom">
                    <span className="view">Tickets</span>
                    <span className="count">{loading ? '...' : unassignedTickets}</span>
                  </div>
                  <Link to={`${process.env.PUBLIC_URL}/admin/tickets/list?filter=unassigned&status=all`} className="dashboards-top-block-item-link-absolute action-click" />
                </div>
              </Card>
            </Col>}

            {/* Bonus cards disabled */}
          </Row>
        </Block>

        <Block>
          <Row>
            <Col lg="6" md="12" className="mb-20">
              <Card>
                <div className="card-header">
                  <span className="icon-wrap">
                    <Icon name="ticket" aria-hidden="true" />
                  </span>
                  <strong>Ticket statistics</strong>
                  <div className="pull-right">
                    <div className="btn-group btn-group-xs" data-bs-toggle="buttons">
                      <Button 
                        className={`btn btn-outline-dark btn-icon ${chartType === 'resolved' ? 'active' : ''}`}
                        title="Resolved"
                        onClick={() => setChartType('resolved')}
                        size="sm"
                      >
                        <Icon name="bar-chart" />
                      </Button>
                      <Button 
                        className={`btn btn-outline-dark btn-icon ${chartType === 'agentPerformance' ? 'active' : ''}`}
                        title="Performance of top 10 agents"
                        onClick={() => setChartType('agentPerformance')}
                        size="sm"
                      >
                        <Icon name="user" />
                      </Button>
                    </div>
                  </div>
                </div>
                
                <div className="card-body ps-16 pe-16 pb-16" data-test-selector="chart" style={{minHeight: '548px'}}>
                  {chartType === 'resolved' ? (
                    <>
                      <div style={{height: '400px'}} className="ps-12 pe-12 pb-12">
                        <BarChartExample className="w-100 h-100" data={getFilteredChartData()} stacked={false} />
                      </div>
                      <div className="row chart-bar-statistics-tools mt-12" style={{borderTop: '1px solid #f1f3f4', paddingTop: '15px'}}>
                        <div className="col-md-8">
                          <h4 className="mb-8 ms-4">Select data range</h4>
                          <div className="row">
                            <div className="col-md-12">
                              <DateRangePicker
                                initialSettings={{
                                  startDate: dateRange.start,
                                  endDate: dateRange.end,
                                  ranges: {
                                    'Today': [moment(), moment()],
                                    'Yesterday': [moment().subtract(1, 'days'), moment().subtract(1, 'days')],
                                    'Last 7 Days': [moment().subtract(6, 'days'), moment()],
                                    'Last 30 Days': [moment().subtract(29, 'days'), moment()],
                                    'This Month': [moment().startOf('month'), moment().endOf('month')],
                                    'Last Month': [moment().subtract(1, 'month').startOf('month'), moment().subtract(1, 'month').endOf('month')]
                                  }
                                }}
                                onApply={handleDateRangeChange}
                              >
                                <input 
                                  type="text" 
                                  value={dateRangeString}
                                  className="ms-4 input-date-range form-control input-sm" 
                                  placeholder="Enter date here..."
                                  style={{cursor: 'pointer'}}
                                  readOnly
                                />
                              </DateRangePicker>
                            </div>
                          </div>
                        </div>
                        <div className="col-md-12 legends without-border mt-8">
                          <h4>Legend</h4>
                          <div className="mt-4">
                            <ul style={{listStyle: 'none', padding: 0, display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
                              {chartData.datasets.map((dataset, index) => {
                                const isVisible = datasetVisibility[dataset.label];
                                return (
                                  <li 
                                    key={index}
                                    data-index={index}
                                    onClick={() => handleLegendClick(dataset.label)}
                                    className="chart-legend-label-text"
                                    style={{
                                      background: isVisible ? dataset.backgroundColor : '#ccc',
                                      display: 'inline-block', 
                                      padding: '6px 12px', 
                                      margin: '2px', 
                                      borderRadius: '4px', 
                                      fontSize: '12px', 
                                      color: 'white', 
                                      cursor: 'pointer',
                                      opacity: isVisible ? 1 : 0.5,
                                      transition: 'all 0.3s ease',
                                      border: isVisible ? 'none' : '2px solid ' + dataset.backgroundColor,
                                      position: 'relative',
                                      userSelect: 'none'
                                    }}
                                    onMouseEnter={(e) => {
                                      e.target.style.transform = 'scale(1.05)';
                                      e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.target.style.transform = 'scale(1)';
                                      e.target.style.boxShadow = 'none';
                                    }}
                                    title={`Click to ${isVisible ? 'hide' : 'show'} ${dataset.label} data`}
                                  >
                                    {!isVisible && <span style={{textDecoration: 'line-through'}}>✕ </span>}
                                    {dataset.label}
                                    {isVisible && <span style={{marginLeft: '4px', fontSize: '10px'}}>●</span>}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <h4 className="text-center">Performance of top 10 agents</h4>
                      <div className="table-wrapper-with-overflow scroll-x">
                        <table className="table table-striped">
                          <thead>
                            <tr>
                              <th>Agent name</th>
                              <th>Tickets assigned</th>
                              <th data-type="created">Answers</th>
                              <th>Reassign</th>
                              <th data-type="resolved">Resolves</th>
                              <th data-type="reopened">Reopens</th>
                            </tr>
                          </thead>
                          <tbody>
                            {recentActivities.length === 0 ? (
                              <tr>
                                <td colSpan="6" className="text-muted text-center">No data available</td>
                              </tr>
                            ) : (
                              Object.values(recentActivities.reduce((acc, act) => {
                                const name = act.agent.name;
                                if (!acc[name]) acc[name] = { name, assigned: 0, answers: 0, reassign: 0, resolves: 0, reopens: 0 };
                                acc[name].assigned += 1;
                                if ((act.details||'').toLowerCase().includes('resolved')) acc[name].resolves += 1;
                                return acc;
                              }, {})).map((agent, index) => (
                                <tr key={index}>
                                  <td>{agent.name}</td>
                                  <td>{agent.assigned}</td>
                                  <td data-type="created">{agent.answers}</td>
                                  <td>{agent.reassign}</td>
                                  <td data-type="resolved">{agent.resolves}</td>
                                  <td data-type="reopened">{agent.reopens}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div className="row chart-bar-statistics-tools mt-12">
                        <div className="col-md-8">
                          <h4>Select data range</h4>
                          <div className="mt-4">
                            <DateRangePicker
                              initialSettings={{
                                startDate: dateRange.start,
                                endDate: dateRange.end,
                                ranges: {
                                  'Today': [moment(), moment()],
                                  'Yesterday': [moment().subtract(1, 'days'), moment().subtract(1, 'days')],
                                  'Last 7 Days': [moment().subtract(6, 'days'), moment()],
                                  'Last 30 Days': [moment().subtract(29, 'days'), moment()],
                                  'This Month': [moment().startOf('month'), moment().endOf('month')],
                                  'Last Month': [moment().subtract(1, 'month').startOf('month'), moment().subtract(1, 'month').endOf('month')]
                                }
                              }}
                              onApply={handleDateRangeChange}
                            >
                              <input 
                                type="text" 
                                value={dateRangeString}
                                className="input-date-range form-control input-sm" 
                                placeholder="Enter date here..."
                                style={{cursor: 'pointer'}}
                                readOnly
                              />
                            </DateRangePicker>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </Card>
            </Col>

            <Col lg="6" md="12" className="mb-20">
              <Card id="admin_support_tickets_dashboard_recent_activities_panel" data-test-selector="admin_support_tickets_dashboard_recent_activities_panel">
                <div className="card-header dropup">
                  <h4>Recent activities</h4>
                  <div className="pull-right">
                    <span className="close-card-btn icon-wrap">
                      <Icon name="chevron-up" aria-hidden="true" />
                    </span>
                  </div>
                </div>
                <div className="card-body ps-16 pe-16 pb-16" style={{height: '550px', maxHeight: '550px', display: 'flex', flexDirection: 'column'}}>
                  <div className="common-activity-wrapper" style={{height: '502px', maxHeight: '502px', overflowY: 'auto', flex: 1}}>
                      {activitiesLoading ? (
                        <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px', padding: '16px'}}>
                          <Icon name="loader" className="spinning" style={{fontSize: '24px', color: '#6c757d'}} />
                        </div>
                      ) : recentActivities.length === 0 ? (
                        <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px', color: '#6c757d', padding: '16px'}}>
                          <div style={{textAlign: 'center'}}>
                            <Icon name="inbox" style={{fontSize: '48px', marginBottom: '10px'}} />
                            <p>No recent activities</p>
                          </div>
                        </div>
                      ) : (
                        <div className="common-activity-list">
                          {recentActivities.map((activity, index) => (
                            <div key={activity.id} data-test-selector="activity-item" className="common-activity-item">
                              <div className="common-activity-heading">
                                <div className="common-activity-heading-left">
                                  <div className="common-activity-avatar">
                                    {activity.agent.avatar ? (
                                      <img 
                                        src={activity.agent.avatar}
                                        alt={activity.agent.name}
                                        data-test-selector="avatar-image"
                                        style={{width: '40px', height: '40px', borderRadius: '50%'}}
                                      />
                                    ) : (
                                      <div 
                                        data-test-selector="avatar-letter" 
                                        className="avatar-admin"
                                        style={{
                                          width: '40px',
                                          height: '40px',
                                          borderRadius: '50%',
                                          background: activity.agent.color || '#e9ecef',
                                          color: '#1b2124',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          fontSize: '12px',
                                          fontWeight: '600'
                                        }}
                                      >
                                        {activity.agent.initials}
                                      </div>
                                    )}
                                  </div>
                                  <div className="common-activity-author">
                                    <div className="common-activity-author-info">
                                      <span data-test-selector="author-name" className="common-activity-author-name">
                                        {activity.agent.name}
                                      </span>
                                      <span data-test-selector="activity-action" style={{marginLeft: '8px'}}>
                                        {activity.type === 'status_change' ? 'Status changed' : 'Created'}&nbsp;
                                        <a 
                                          href={`/admin/tickets/view/${activity.ticket.id}`}
                                          onClick={(e) => {
                                            e.preventDefault();
                                            navigate(`/admin/tickets/view/${activity.ticket.id}`);
                                          }}
                                          style={{color: '#357bf2', textDecoration: 'none', cursor: 'pointer'}}
                                        >
                                          {activity.ticket.title}
                                        </a>
                                      </span>
                                    </div>
                                    <div className="common-activity-time">
                                      <time 
                                        dateTime={activity.timestamp.toISOString()} 
                                        className="timeago" 
                                        title={activity.timestamp.toLocaleString()}
                                      >
                                        {getTimeAgo(activity.timestamp)}
                                      </time>
                                      <time style={{marginLeft: '8px', fontSize: '12px', color: '#6c757d'}}>
                                        ({activity.timestamp.toLocaleString()})
                                      </time>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div data-test-selector="activity-body" className="common-activity-body">
                                {activity.details || activity.message}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                </div>
              </Card>
            </Col>
          </Row>
        </Block>

        <Block>
          <Row>
            <Col md="6" className="mb-4">
              <Card style={{border: '1px solid #e5e9f2', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)'}}>
                <div className="card-header" style={{background: '#f8f9fa', borderBottom: '1px solid #e5e9f2', padding: '15px 20px'}}>
                  <strong style={{fontSize: '16px', color: '#364a63'}}>Assigned to me</strong>
                </div>
                <div className="card-body" style={{padding: '20px'}}>
                  {(() => {
                    const filtered = assignedToMeTickets;
                    const grouped = {};
                    filtered.forEach(t => {
                      const status = t.status || 'Unknown';
                      if (!grouped[status]) grouped[status] = 0;
                      grouped[status]++;
                    });
                    const total = filtered.length;
                    const statuses = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
                    
                    return (
                      <table className="table table-striped" style={{width: '100%', marginBottom: 0}}>
                        <thead>
                          <tr>
                            <th>Status</th>
                            <th>Count</th>
                            <th>Percentage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {statuses.length > 0 ? (
                            statuses.map(([status, count]) => {
                              const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
                              return (
                                <tr key={status}>
                                  <td>
                                    <span className="badge" style={{backgroundColor: getStatusColor(status)}}>
                                      {status}
                                    </span>
                                  </td>
                                  <td>{count}</td>
                                  <td>
                                    <div style={{display: 'inline-block', width: '70%'}}>
                                      <div style={{backgroundColor: '#f1f3f4', borderRadius: '4px', height: '8px', position: 'relative', overflow: 'hidden'}}>
                                        <span style={{backgroundColor: getStatusColor(status), height: '100%', borderRadius: '4px', transition: 'width 0.3s ease', width: `${percentage}%`, display: 'block'}}></span>
                                      </div>
                                    </div>
                                    <div style={{display: 'inline-block', width: '25%', textAlign: 'right', whiteSpace: 'nowrap'}}>{percentage}&nbsp;%</div>
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan="3" className="text-center text-muted">No tickets assigned to you</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              </Card>
            </Col>

            {!isTechnician && <Col md="6" className="mb-4">
              <Card style={{border: '1px solid #e5e9f2', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)'}}>
                <div className="card-header" style={{background: '#f8f9fa', borderBottom: '1px solid #e5e9f2', padding: '15px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                  <strong style={{fontSize: '16px', color: '#364a63'}}>Assigned to administrators</strong>
                  <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                    <label style={{fontSize: '13px', color: '#6c757d', margin: 0}}>Status</label>
                    <div>
                      <select 
                        value={adminStatusFilter}
                        onChange={(e) => setAdminStatusFilter(e.target.value)}
                        style={{padding: '4px 8px', border: '1px solid #e5e9f2', borderRadius: '4px', fontSize: '12px', width: '120px'}}
                      >
                        <option value="all">All</option>
                        <option value="new">New</option>
                        <option value="work in progress">Work in progress</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="card-body" style={{padding: '20px'}}>
                  {(() => {
                    const filtered = getFilteredAdminTickets();
                    const grouped = {};
                    filtered.forEach(t => {
                      const assignee = formatAssignedToName(t.assignedTo);
                      if (!grouped[assignee]) grouped[assignee] = 0;
                      grouped[assignee]++;
                    });
                    const total = filtered.length;
                    const assignees = Object.entries(grouped)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 5);
                    
                    return (
                      <table className="table table-striped" style={{width: '100%', marginBottom: 0}}>
                        <thead>
                          <tr>
                            <th>Assignee</th>
                            <th>Count</th>
                            <th>Percentage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {assignees.length > 0 ? (
                            assignees.map(([assignee, count]) => {
                              const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
                              return (
                                <tr key={assignee}>
                                  <td><button style={{background: 'none', border: 'none', color: '#357bf2', cursor: 'pointer', padding: 0, font: 'inherit'}}>{assignee}</button></td>
                                  <td>{count}</td>
                                  <td>
                                    <div style={{display: 'inline-block', width: '70%'}}>
                                      <div style={{backgroundColor: '#f1f3f4', borderRadius: '4px', height: '8px', position: 'relative', overflow: 'hidden'}}>
                                        <span style={{backgroundColor: '#357bf2', height: '100%', borderRadius: '4px', transition: 'width 0.3s ease', width: `${percentage}%`, display: 'block'}}></span>
                                      </div>
                                    </div>
                                    <div style={{display: 'inline-block', width: '25%', textAlign: 'right', whiteSpace: 'nowrap'}}>{percentage}&nbsp;%</div>
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan="3" className="text-center text-muted">No tickets assigned to administrators</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              </Card>
            </Col>}
          </Row>

          <div className="clearfix"></div>
        </Block>
      </Content>
    </React.Fragment>
  );
};

const mapStateToProps = (state) => ({
  user: state.auth.currentUser,
});

export default connect(mapStateToProps)(TicketsDashboard);
