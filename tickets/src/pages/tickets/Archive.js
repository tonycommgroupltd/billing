import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { connect } from "react-redux";
import Content from "../../layout/content/Content";
import Head from "../../layout/head/Head";
import { Card, Row, Col, Badge, Dropdown, DropdownToggle, DropdownMenu, DropdownItem, Input, Table } from "reactstrap";
import {
  Block,
  BlockHead,
  BlockBetween,
  BlockHeadContent,
  BlockTitle,
  PreviewCard,
  Button,
  Icon,
} from "../../components/Component";
import { getTypeLabels, getTypeIdByLabel, getTypeLabelById } from "../../config/ticketTypes";

// Helper function to format assignedTo name (extract username from "Name (email)" format)
const formatAssignedToName = (assignedTo) => {
  if (!assignedTo || assignedTo === '0' || assignedTo === '-') return 'Unassigned';
  
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

const ARCHIVE_FILTER_KEY = 'tickets_archive_filters_v1';
const defaultArchiveFilters = {
  quickAccess: 'all',
  status: 'all',
  entries: 100,
  search: '',
  assignedTo: '',
  dateRange: 'last90days',
  archiveReason: 'all'
};

const ArchivesList = ({ user }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTickets, setSelectedTickets] = useState([]);
  const [currentView, setCurrentView] = useState('table'); // 'table' or 'card'
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [visibleColumns, setVisibleColumns] = useState({
    checkbox: true,
    number: true,
    subject: true,
    customer: true,
    priority: true,
    status: true,
    group: true,
    type: true,
    assignedTo: true,
    archivedDate: true,
    actions: true
  });
  const [filters, setFilters] = useState(() => {
    try {
      const saved = sessionStorage.getItem(ARCHIVE_FILTER_KEY);
      return saved ? { ...defaultArchiveFilters, ...JSON.parse(saved) } : defaultArchiveFilters;
    } catch { return defaultArchiveFilters; }
  });
  useEffect(() => {
    try { sessionStorage.setItem(ARCHIVE_FILTER_KEY, JSON.stringify(filters)); } catch {}
  }, [filters]);

  const isTechnician = user?.all_roles?.includes('technician');
  const currentUserId = user?.id;
  const currentUserName = user?.name || user?.username;

  // Enhanced pagination state
  const [pagination, setPagination] = useState({
    currentPage: 1,
    itemsPerPage: 10,
    totalItems: 0
  });
  
  // Sort state
  const [sort, setSort] = useState({
    field: 'archived_at',
    direction: 'desc'
  });
  
  // Bulk actions state
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [bulkAction, setBulkAction] = useState('');

  const typeOptions = getTypeLabels();

  useEffect(() => {
    const loadArchivedTickets = async () => {
      setLoading(true);
      try {
        let tickets = [];

        // Always load from API first - this is the source of truth
        try {
          const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
          const response = await TicketsAPI.getArchived({ per_page: 0 }); // 0 = no limit, return all
          tickets = response.data || [];
          console.log('Archived tickets from API:', tickets.length);
        } catch (apiError) {
          console.warn('API call failed, falling back to localStorage:', apiError);
          // Fall back to localStorage only if API is unreachable
          const ticketsStore = JSON.parse(localStorage.getItem('tickets_store_v1') || '{}');
          tickets = ticketsStore.archived || [];
          console.log('Archived tickets from localStorage fallback:', tickets.length);
        }
        
        console.log('Current user:', { name: currentUserName, id: currentUserId, roles: user?.all_roles });
        console.log('Is technician?', isTechnician);
        
        // DON'T filter by technician for archived tickets - show all archived tickets regardless of role
        // Technicians can still view archived tickets to see full history
        
        console.log('Tickets before structure mapping:', tickets.length, tickets);
        
        // Ensure all tickets have proper structure
        tickets = tickets.map(ticket => ({
          ...ticket,
          number: ticket.number || `#${ticket.id}`,
          customer: ticket.customer || { name: 'Unknown', initial: 'U', avatar: null },
          created_at: ticket.created_at || new Date().toISOString(),
          archived_at: ticket.archived_at || new Date().toISOString(),
          typeLabel: ticket.typeLabel || ticket.type || 'Support'
        }));
        
        console.log('Final tickets to be set in state:', tickets.length, tickets);
        
        setData(tickets);
        setFilteredData(tickets);
        setPagination(prev => ({
          ...prev,
          totalItems: tickets.length
        }));
        
        console.log('=== Archive.js Loading Complete ===');
      } catch (error) {
        console.error('Error fetching archived tickets:', error);
        setData([]);
        setFilteredData([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    };

    loadArchivedTickets();
  }, [currentUserId, currentUserName, isTechnician]);

  // Auto-refresh when page becomes visible (user returns to tab)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('Archive page became visible - refreshing data');
        handleRefresh();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Filter and search logic
  useEffect(() => {
    let filtered = [...data];

    // Apply search filter
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const normalizePhone = (p) => {
        const d = (p || '').replace(/\D/g, '');
        if (d.startsWith('254') && d.length > 9) return d.slice(3);
        if (d.startsWith('0') && d.length > 1) return d.slice(1);
        return d;
      };
      const qPhone = normalizePhone(q);
      filtered = filtered.filter(ticket => {
        const rawPhone = (ticket.customer_phone || ticket.customer?.phone || ticket.customerPhone || '').toString();
        const phoneMatch = rawPhone.toLowerCase().includes(q) ||
          (qPhone.length >= 4 && normalizePhone(rawPhone).includes(qPhone));
        return (ticket.subject || '').toLowerCase().includes(q) ||
          (ticket.number || '').toString().toLowerCase().includes(q) ||
          (ticket.customer?.name || ticket.customer_name || '').toLowerCase().includes(q) ||
          formatAssignedToName(ticket.assignedTo).toLowerCase().includes(q) ||
          phoneMatch;
      });
    }

    // Apply status filter
    if (filters.status !== 'all') {
      filtered = filtered.filter(ticket => ticket.status === filters.status);
    }

    // Apply assigned to filter
    if (filters.assignedTo) {
      filtered = filtered.filter(ticket => 
        formatAssignedToName(ticket.assignedTo).toLowerCase().includes(filters.assignedTo.toLowerCase())
      );
    }

    setFilteredData(filtered);
    setPagination(prev => ({ ...prev, totalItems: filtered.length, currentPage: 1 }));
  }, [data, filters]);

  const handleRefresh = () => {
    setRefreshing(true);
    // Reload archived tickets from localStorage
    const ticketsStore = JSON.parse(localStorage.getItem('tickets_store_v1') || '{}');
    let tickets = ticketsStore.archived || [];
    
    // DON'T filter by technician for archived tickets - show all archived tickets
    
    // Ensure proper structure
    tickets = tickets.map(ticket => ({
      ...ticket,
      number: ticket.number || `#${ticket.id}`,
      customer: ticket.customer || { name: 'Unknown', initial: 'U', avatar: null },
      created_at: ticket.created_at || new Date().toISOString(),
      archived_at: ticket.archived_at || new Date().toISOString(),
      typeLabel: ticket.typeLabel || ticket.type || 'Support'
    }));
    
    setData(tickets);
    setFilteredData(tickets);
    setPagination(prev => ({ ...prev, totalItems: tickets.length }));
    setLastRefresh(new Date());
    setRefreshing(false);
  };

  const handleSelectTicket = (ticketId, checked) => {
    if (checked) {
      setSelectedTickets(prev => [...prev, ticketId]);
    } else {
      setSelectedTickets(prev => prev.filter(id => id !== ticketId));
    }
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      const allIds = getPaginatedData().map(ticket => ticket.id);
      setSelectedTickets(allIds);
    } else {
      setSelectedTickets([]);
    }
  };

  const getPaginatedData = () => {
    const start = (pagination.currentPage - 1) * pagination.itemsPerPage;
    const end = start + pagination.itemsPerPage;
    return filteredData.slice(start, end);
  };

  const getTotalPages = () => {
    return Math.ceil(filteredData.length / pagination.itemsPerPage);
  };

  const handlePageChange = (page) => {
    setPagination(prev => ({ ...prev, currentPage: page }));
  };

  const handleViewTicket = (ticket) => {
    navigate(`/admin/tickets/view/${ticket.id}`, { state: { ticket } });
  };

  const handleRestoreTicket = async (ticketId) => {
    if (window.confirm('Are you sure you want to restore this ticket?')) {
      try {
        setLoading(true);
        
        // Import TicketsAPI dynamically
        const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
        
        try {
          // Try API call first
          await TicketsAPI.restore(ticketId);
        } catch (apiError) {
          console.warn('API restore call failed, using local storage fallback:', apiError);
          
          // Fallback: Use localStorage to manage restore
          const ticketsStore = JSON.parse(localStorage.getItem('tickets_store_v1') || '{}');
          
          // Find and remove from archived
          let restoredTicket = null;
          if (ticketsStore.archived) {
            restoredTicket = ticketsStore.archived.find(t => t.id === ticketId);
            ticketsStore.archived = ticketsStore.archived.filter(t => t.id !== ticketId);
          }
          
          // Add back to active tickets
          if (restoredTicket) {
            if (!ticketsStore.tickets) {
              ticketsStore.tickets = [];
            }
            delete restoredTicket.archived_at;
            delete restoredTicket.archive_reason;
            ticketsStore.tickets.push(restoredTicket);
          }
          
          localStorage.setItem('tickets_store_v1', JSON.stringify(ticketsStore));
        }
        
        // Remove from archive list (it's now back in active tickets)
        setData(prev => prev.filter(ticket => ticket.id !== ticketId));
        setFilteredData(prev => prev.filter(ticket => ticket.id !== ticketId));
        setSelectedTickets(prev => prev.filter(id => id !== ticketId));
        
        alert('Ticket restored successfully and moved back to active tickets list');
      } catch (error) {
        console.error('Error restoring ticket:', error);
        alert('Error restoring ticket. Please try again.');
      } finally {
        setLoading(false);
      }
    }
  };

  const handlePermanentDelete = async (ticketId) => {
    if (window.confirm('Are you sure you want to permanently delete this ticket? This action cannot be undone.')) {
      try {
        setLoading(true);
        
        // Import TicketsAPI dynamically
        const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
        
        // Call API to permanently delete the ticket
        await TicketsAPI.permanentDelete(ticketId);
        
        // Remove from archive list
        setData(prev => prev.filter(ticket => ticket.id !== ticketId));
        setFilteredData(prev => prev.filter(ticket => ticket.id !== ticketId));
        setSelectedTickets(prev => prev.filter(id => id !== ticketId));
        
        alert('Ticket permanently deleted successfully');
      } catch (error) {
        console.error('Error deleting ticket:', error);
        alert('Error permanently deleting ticket. Please try again.');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleBulkAction = (action) => {
    switch (action) {
      case 'restore':
        handleBulkRestore();
        break;
      case 'delete':
        handleBulkDelete();
        break;
      case 'export':
        handleBulkExport();
        break;
      default:
        console.log('Unknown bulk action:', action);
    }
  };

  const handleBulkRestore = async () => {
    if (window.confirm(`Are you sure you want to restore ${selectedTickets.length} ticket(s)?`)) {
      try {
        setLoading(true);
        
        // Import TicketsAPI dynamically
        const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
        
        // Restore each selected ticket
        const restorePromises = selectedTickets.map(ticketId => 
          TicketsAPI.restore(ticketId)
        );
        
        await Promise.all(restorePromises);
        
        // Remove tickets from archive (they're now back in active list)
        setData(prev => prev.filter(ticket => !selectedTickets.includes(ticket.id)));
        setFilteredData(prev => prev.filter(ticket => !selectedTickets.includes(ticket.id)));
        setSelectedTickets([]);
        
        alert(`Successfully restored ${selectedTickets.length} ticket(s). They are now back in the active tickets list.`);
      } catch (error) {
        console.error('Error restoring tickets:', error);
        alert('Error restoring some tickets. Please try again.');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleBulkDelete = async () => {
    if (window.confirm(`Are you sure you want to permanently delete ${selectedTickets.length} ticket(s)? This action cannot be undone.`)) {
      try {
        setLoading(true);
        
        // Import TicketsAPI dynamically
        const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
        
        // Delete each selected ticket permanently
        const deletePromises = selectedTickets.map(ticketId => 
          TicketsAPI.permanentDelete(ticketId)
        );
        
        await Promise.all(deletePromises);
        
        // Remove tickets from archive list
        setData(prev => prev.filter(ticket => !selectedTickets.includes(ticket.id)));
        setFilteredData(prev => prev.filter(ticket => !selectedTickets.includes(ticket.id)));
        setSelectedTickets([]);
        
        alert(`Successfully permanently deleted ${selectedTickets.length} ticket(s).`);
      } catch (error) {
        console.error('Error deleting tickets:', error);
        alert('Error deleting some tickets. Please try again.');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleBulkExport = () => {
    console.log('Exporting selected tickets:', selectedTickets);
    alert(`Exporting ${selectedTickets.length} ticket(s) to CSV`);
  };

  const getPriorityBadge = (priority) => {
    const badges = {
      low: 'bg-success',
      medium: 'bg-info',
      high: 'bg-warning',
      urgent: 'bg-danger'
    };
    return badges[priority] || 'bg-secondary';
  };

  const getStatusBadge = (status) => {
    const badges = {
      new: 'bg-info',
      open: 'bg-success',
      pending: 'bg-warning',
      solved: 'bg-default',
      closed: 'bg-dark',
      resolved: 'bg-default',
      'installation complete': 'bg-success',
      waiting_customer: 'bg-warning',
      waiting_agent: 'bg-info',
      waiting_power: 'bg-warning',
      customer_unreachable: 'bg-warning',
      booked_later: 'bg-info',
      out_of_range: 'bg-warning',
      installed_elsewhere: 'bg-default',
      long_distance: 'bg-info',
      pole_needed: 'bg-warning'
    };
    return badges[status] || 'bg-secondary';
  };

  const statusLabels = {
    new: 'New',
    open: 'Work in progress',
    pending: 'Pending',
    solved: 'Solved',
    closed: 'Closed',
    resolved: 'Resolved',
    'installation complete': 'Installation complete',
    waiting_customer: 'Waiting on customer',
    waiting_agent: 'Waiting on agent',
    waiting_power: 'Waiting on power',
    customer_unreachable: 'Customer unreachable',
    booked_later: 'Booked to a further date',
    out_of_range: 'Customer out of range',
    installed_elsewhere: 'Already installed by another provider',
    long_distance: 'Long distance',
    pole_needed: 'Pole needed'
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  return (
    <React.Fragment>
      <Head title="Archived Tickets"></Head>
      <Content>
        <BlockHead size="sm">
          <BlockBetween>
            <BlockHeadContent>
              <BlockTitle page tag="h3">
                Archived Tickets
              </BlockTitle>
              <div style={{fontSize: '14px', color: '#6c757d', marginTop: '5px'}}>
                Last updated: {lastRefresh.toLocaleTimeString()}
              </div>
            </BlockHeadContent>
            <BlockHeadContent>
              <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                <Button 
                  className={`btn btn-outline-dark btn-icon ${refreshing ? 'disabled' : ''}`}
                  onClick={handleRefresh}
                  disabled={refreshing}
                  title="Refresh"
                >
                  <Icon name={refreshing ? "loader" : "reload"} className={refreshing ? "spinning" : ""} />
                </Button>

                <Button 
                  className="btn btn-primary" 
                  onClick={() => navigate('/admin/tickets/create')}
                >
                  Create ticket
                </Button>
              </div>
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>

        <Block>
          <PreviewCard>
            {/* Header with filters and controls */}
            <div style={{
              backgroundColor: '#fff',
              borderBottom: '1px solid #e5e9f2',
              padding: '16px 20px'
            }}>
              {/* Top Row: Quick Access and Search */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px'
              }}>
                {/* Left: Quick Access */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {[
                    { key: 'all', label: 'All', count: data.length },
                    { key: 'resolved', label: 'Resolved', count: data.filter(t => t.status === 'resolved').length },
                    { key: 'installation complete', label: 'Completed', count: data.filter(t => t.status === 'installation complete').length }
                  ].map((item) => (
                    <button
                      key={item.key}
                      onClick={() => setFilters(prev => ({ ...prev, quickAccess: item.key, status: item.key === 'all' ? 'all' : item.key }))}
                      style={{
                        background: filters.quickAccess === item.key ? '#357bf2' : 'transparent',
                        color: filters.quickAccess === item.key ? '#fff' : '#8094ae',
                        border: '1px solid ' + (filters.quickAccess === item.key ? '#357bf2' : '#e5e9f2'),
                        borderRadius: '20px',
                        padding: '6px 12px',
                        fontSize: '12px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {item.label}
                      <span style={{
                        backgroundColor: filters.quickAccess === item.key ? 'rgba(255,255,255,0.2)' : '#e5e9f2',
                        color: filters.quickAccess === item.key ? '#fff' : '#8094ae',
                        borderRadius: '10px',
                        padding: '1px 6px',
                        fontSize: '11px',
                        fontWeight: '600',
                        minWidth: '18px',
                        textAlign: 'center'
                      }}>
                        {item.count}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Right: Archive-specific filters */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <select 
                    className="form-control input-sm"
                    value={filters.dateRange}
                    onChange={(e) => setFilters({...filters, dateRange: e.target.value})}
                    style={{
                      border: '1px solid #e5e9f2',
                      borderRadius: '4px',
                      padding: '6px 8px',
                      fontSize: '13px',
                      backgroundColor: '#fff',
                      width: '150px',
                      color: '#8094ae'
                    }}
                  >
                    <option value="last30days">Last 30 Days</option>
                    <option value="last90days">Last 90 Days</option>
                    <option value="last6months">Last 6 Months</option>
                    <option value="lastyear">Last Year</option>
                    <option value="all">All Time</option>
                  </select>

                  <button
                    onClick={() => setShowAdvancedSearch(!showAdvancedSearch)}
                    style={{
                      background: showAdvancedSearch ? '#357bf2' : 'transparent',
                      color: showAdvancedSearch ? '#fff' : '#8094ae',
                      border: '1px solid ' + (showAdvancedSearch ? '#357bf2' : '#e5e9f2'),
                      borderRadius: '4px',
                      padding: '6px 10px',
                      fontSize: '12px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Icon name="filter" />
                    Advanced
                  </button>
                </div>
              </div>

              {/* Advanced Search Panel */}
              {showAdvancedSearch && (
                <div style={{
                  backgroundColor: '#f8f9fb',
                  borderRadius: '6px',
                  padding: '16px',
                  marginBottom: '16px'
                }}>
                  <Row>
                    <Col md={3}>
                      <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>Status</label>
                      <select
                        className="form-control input-sm"
                        value={filters.status}
                        onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                        style={{
                          border: '1px solid #e5e9f2',
                          borderRadius: '4px',
                          padding: '6px 8px',
                          fontSize: '13px',
                          width: '100%'
                        }}
                      >
                        <option value="all">All Statuses</option>
                        <option value="resolved">Resolved</option>
                        <option value="installation complete">Installation Complete</option>
                        <option value="closed">Closed</option>
                      </select>
                    </Col>
                    <Col md={3}>
                      <label style={{ fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>Assigned To</label>
                      <input
                        type="text"
                        className="form-control input-sm"
                        placeholder="Enter assignee name"
                        value={filters.assignedTo}
                        onChange={(e) => setFilters(prev => ({ ...prev, assignedTo: e.target.value }))}
                        style={{
                          border: '1px solid #e5e9f2',
                          borderRadius: '4px',
                          padding: '6px 8px',
                          fontSize: '13px',
                          width: '100%'
                        }}
                      />
                    </Col>
                  </Row>
                </div>
              )}

              {/* Bottom Row: Actions and Controls */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                {/* Left: Bulk Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {selectedTickets.length > 0 && (
                    <Dropdown isOpen={showBulkActions} toggle={() => setShowBulkActions(!showBulkActions)}>
                      <DropdownToggle 
                        className="btn btn-outline-primary btn-sm"
                        style={{
                          fontSize: '13px',
                          fontWeight: '500',
                          padding: '6px 12px'
                        }}
                      >
                        Actions
                      </DropdownToggle>
                      <DropdownMenu>
                        <DropdownItem onClick={() => handleBulkAction('restore')}>
                          Restore <span className="count">({selectedTickets.length})</span>
                        </DropdownItem>
                        <DropdownItem onClick={() => handleBulkAction('export')}>
                          Export <span className="count">({selectedTickets.length})</span>
                        </DropdownItem>
                        <DropdownItem divider />
                        <DropdownItem onClick={() => handleBulkAction('delete')} className="text-danger">
                          Delete permanently <span className="count">({selectedTickets.length})</span>
                        </DropdownItem>
                      </DropdownMenu>
                    </Dropdown>
                  )}

                  {/* Show Entries */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#8094ae' }}>
                    <span>Show</span>
                    <select 
                      name="archive_list_length"
                      className="form-control input-sm"
                      value={pagination.itemsPerPage}
                      onChange={(e) => setPagination(prev => ({ ...prev, itemsPerPage: Number(e.target.value), currentPage: 1 }))}
                      style={{
                        border: '1px solid #e5e9f2',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '13px',
                        backgroundColor: '#fff',
                        width: '60px',
                        color: '#8094ae'
                      }}
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={75}>75</option>
                      <option value={100}>100</option>
                    </select>
                    <span>entries</span>
                  </div>
                </div>

                {/* Right: Search and Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {/* Search */}
                  <div style={{ position: 'relative' }}>
                    <input 
                      type="search" 
                      className="form-control input-sm" 
                      placeholder="Search archive"
                      value={filters.search}
                      onChange={(e) => setFilters(prev => ({...prev, search: e.target.value}))}
                      style={{
                        border: '1px solid #e5e9f2',
                        borderRadius: '4px',
                        padding: '6px 32px 6px 12px',
                        fontSize: '13px',
                        backgroundColor: '#fff',
                        width: '200px',
                        color: '#8094ae'
                      }}
                    />
                    <button className="search-icon" style={{
                      position: 'absolute',
                      right: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: '#8094ae',
                      cursor: 'pointer',
                      padding: '4px'
                    }}>
                      <Icon name="search" />
                    </button>
                  </div>

                  {/* View Toggle */}
                  <div style={{
                    display: 'flex',
                    border: '1px solid #e5e9f2',
                    borderRadius: '4px',
                    overflow: 'hidden'
                  }}>
                    <button
                      onClick={() => setCurrentView('table')}
                      style={{
                        background: currentView === 'table' ? '#357bf2' : '#fff',
                        color: currentView === 'table' ? '#fff' : '#8094ae',
                        border: 'none',
                        padding: '6px 10px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        borderRight: '1px solid #e5e9f2'
                      }}
                    >
                      <Icon name="list" />
                    </button>
                    <button
                      onClick={() => setCurrentView('card')}
                      style={{
                        background: currentView === 'card' ? '#357bf2' : '#fff',
                        color: currentView === 'card' ? '#fff' : '#8094ae',
                        border: 'none',
                        padding: '6px 10px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      <Icon name="grid" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Empty State */}
            {filteredData.length === 0 && (
              <div style={{
                backgroundColor: '#fff',
                padding: '40px 20px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '14px', color: '#8094ae', marginBottom: '10px' }}>
                  <Icon name="inbox" style={{ fontSize: '32px', marginBottom: '10px', display: 'block' }} />
                </div>
                <p style={{ color: '#8094ae', fontSize: '14px', margin: 0 }}>
                  No archived tickets found
                </p>
                <p style={{ color: '#b8c1cc', fontSize: '12px', margin: '5px 0 0 0' }}>
                  Archive completed tickets to see them here
                </p>
              </div>
            )}

            {/* Table View */}
            {currentView === 'table' && filteredData.length > 0 && (
            <Table className="table-striped table-bordered" style={{
              marginBottom: 0,
              backgroundColor: '#fff',
              fontSize: '13px',
              color: '#374151'
            }}>
              <thead>
                <tr style={{
                  backgroundColor: '#f8f9fb',
                  borderBottom: '1px solid #e5e9f2'
                }}>
                  <th style={{padding: '12px', width: '40px', borderRight: '1px solid #e5e9f2'}}>
                    <input 
                      type="checkbox" 
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      checked={selectedTickets.length === getPaginatedData().length && getPaginatedData().length > 0}
                      style={{
                        width: '14px',
                        height: '14px',
                        accentColor: '#357bf2'
                      }}
                    />
                  </th>
                  <th style={{padding: '12px', borderRight: '1px solid #e5e9f2', fontWeight: '600', fontSize: '12px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px'}}>
                    Number
                  </th>
                  <th style={{padding: '12px', borderRight: '1px solid #e5e9f2', fontWeight: '600', fontSize: '12px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px'}}>
                    Subject
                  </th>
                  <th style={{padding: '12px', borderRight: '1px solid #e5e9f2', fontWeight: '600', fontSize: '12px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px'}}>
                    Customer
                  </th>
                  <th style={{padding: '12px', borderRight: '1px solid #e5e9f2', fontWeight: '600', fontSize: '12px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px'}}>
                    Priority
                  </th>
                  <th style={{padding: '12px', borderRight: '1px solid #e5e9f2', fontWeight: '600', fontSize: '12px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px'}}>
                    Status
                  </th>
                  <th style={{padding: '12px', borderRight: '1px solid #e5e9f2', fontWeight: '600', fontSize: '12px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px'}}>
                    Group
                  </th>
                  <th style={{padding: '12px', borderRight: '1px solid #e5e9f2', fontWeight: '600', fontSize: '12px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px'}}>
                    Type
                  </th>
                  <th style={{padding: '12px', borderRight: '1px solid #e5e9f2', fontWeight: '600', fontSize: '12px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px'}}>
                    Assigned To
                  </th>
                  <th style={{padding: '12px', borderRight: '1px solid #e5e9f2', fontWeight: '600', fontSize: '12px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px'}}>
                    Archived
                  </th>
                  <th style={{padding: '12px', fontWeight: '600', fontSize: '12px', color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px'}}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {getPaginatedData().map((ticket) => (
                  <tr key={ticket.id} onClick={() => handleViewTicket(ticket)} style={{
                    borderBottom: '1px solid #e5e9f2',
                    backgroundColor: selectedTickets.includes(ticket.id) ? '#f0f8ff' : '#fff',
                    cursor: 'pointer'
                  }}>
                    <td style={{padding: '8px 12px', borderRight: '1px solid #e5e9f2'}} onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        checked={selectedTickets.includes(ticket.id)}
                        onChange={(e) => handleSelectTicket(ticket.id, e.target.checked)}
                        style={{
                          width: '14px',
                          height: '14px',
                          accentColor: '#357bf2'
                        }}
                      />
                    </td>
                    <td style={{padding: '8px 12px', borderRight: '1px solid #e5e9f2', width: '90px'}}>
                      <span style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
                        <span 
                          onClick={() => handleViewTicket(ticket)}
                          style={{
                            cursor: 'pointer',
                            color: '#357bf2',
                            textDecoration: 'none'
                          }}
                          onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
                          onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
                        >
                          {ticket.number}
                        </span>
                      </span>
                    </td>
                    <td style={{padding: '8px 12px', width: '180px', borderRight: '1px solid #e5e9f2'}}>
                      <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
                        <span 
                          onClick={() => handleViewTicket(ticket)}
                          style={{
                            color: '#357bf2', 
                            textDecoration: 'none', 
                            fontSize: '13px',
                            fontWeight: '500',
                            display: 'block',
                            whiteSpace: 'normal',
                            wordBreak: 'break-word',
                            cursor: 'pointer'
                          }}
                          onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
                          onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
                          title={ticket.subject}
                        >
                          {ticket.subject}
                        </span>
                        <div style={{fontSize: '11px', color: '#8094ae', fontStyle: 'italic'}}>
                          Created: {formatDate(ticket.created_at)}
                        </div>
                      </div>
                    </td>
                    <td style={{padding: '8px 12px', width: '140px', borderRight: '1px solid #e5e9f2'}}>
                      <div style={{display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden'}}>
                        <div style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          backgroundColor: ticket.customer.avatar ? 'transparent' : '#526484',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontSize: '11px',
                          fontWeight: '600',
                          flexShrink: 0
                        }}>
                          {ticket.customer.avatar ? (
                            <img src={ticket.customer.avatar} alt="" style={{width: '100%', height: '100%', borderRadius: '50%'}} />
                          ) : (
                            ticket.customer.initial
                          )}
                        </div>
                        <div style={{minWidth: 0, overflow: 'hidden'}}>
                          <div style={{fontSize: '13px', fontWeight: '500', color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                            {ticket.customer.name}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{padding: '8px 12px', width: '90px', borderRight: '1px solid #e5e9f2'}}>
                      <Badge className={getPriorityBadge(ticket.priority)} style={{
                        textTransform: 'capitalize',
                        fontSize: '11px',
                        padding: '2px 6px'
                      }}>
                        {ticket.priority}
                      </Badge>
                    </td>
                    <td style={{padding: '8px 12px', width: '120px', whiteSpace: 'normal', wordBreak: 'break-word', borderRight: '1px solid #e5e9f2'}}>
                      <Badge className={getStatusBadge(ticket.status)} style={{
                        textTransform: 'none',
                        fontSize: '11px',
                        padding: '2px 6px'
                      }}>
                        {statusLabels[ticket.status] || ticket.status}
                      </Badge>
                    </td>
                    <td style={{padding: '8px 12px', fontSize: '13px', color: '#374151', width: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderRight: '1px solid #e5e9f2'}}>
                      {ticket.group}
                    </td>
                    <td style={{padding: '8px 12px', fontSize: '13px', color: '#374151', width: '90px', borderRight: '1px solid #e5e9f2'}}>
                      <span style={{ textTransform: 'capitalize', fontSize: '13px' }}>
                        {ticket.typeLabel || ticket.type}
                      </span>
                    </td>
                    <td style={{padding: '8px 12px', fontSize: '13px', color: '#374151', width: '90px', whiteSpace: 'normal', wordBreak: 'break-word', borderRight: '1px solid #e5e9f2'}}>
                      {formatAssignedToName(ticket.assignedTo)}
                    </td>
                    <td style={{padding: '8px 12px', fontSize: '11px', color: '#8094ae', width: '120px', borderRight: '1px solid #e5e9f2'}}>
                      {formatDate(ticket.archived_at)}
                    </td>
                    <td style={{padding: '8px 12px', width: '100px'}} onClick={(e) => e.stopPropagation()}>
                      <div style={{display: 'flex', gap: '8px'}}>
                        <button 
                          onClick={() => handleViewTicket(ticket)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#357bf2',
                            cursor: 'pointer',
                            padding: '4px'
                          }}
                          title="View ticket"
                        >
                          <Icon name="eye" />
                        </button>
                        <button 
                          onClick={() => handleRestoreTicket(ticket.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#28a745',
                            cursor: 'pointer',
                            padding: '4px'
                          }}
                          title="Restore ticket"
                        >
                          <Icon name="undo" />
                        </button>
                        <button 
                          onClick={() => handlePermanentDelete(ticket.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#eb5757',
                            cursor: 'pointer',
                            padding: '4px'
                          }}
                          title="Delete permanently"
                        >
                          <Icon name="trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            )}

            {/* Card View */}
            {currentView === 'card' && filteredData.length > 0 && (
              <div style={{ backgroundColor: '#fff' }}>
                {getPaginatedData().map((ticket) => (
                  <div key={ticket.id} className="tickets-card d-flex flex-wrap py-12 px-16" style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #e5e9f2',
                    display: 'flex',
                    flexWrap: 'wrap',
                    backgroundColor: selectedTickets.includes(ticket.id) ? '#f0f8ff' : '#fff'
                  }}>
                    {/* Mass Actions Checkbox */}
                    <div className="mass-actions col-auto align-self-center pe-16" style={{
                      paddingRight: '16px'
                    }}>
                      <div className="form-check">
                        <input 
                          id={`archive_ticket_card_view_check_${ticket.id}`}
                          type="checkbox" 
                          className="form-check-input"
                          checked={selectedTickets.includes(ticket.id)}
                          onChange={(e) => handleSelectTicket(ticket.id, e.target.checked)}
                        />
                        <label 
                          htmlFor={`archive_ticket_card_view_check_${ticket.id}`} 
                          className="form-check-label"
                        ></label>
                      </div>
                    </div>

                    {/* Ticket Details */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div>
                          <span 
                            onClick={() => handleViewTicket(ticket)}
                            style={{
                              color: '#357bf2',
                              fontSize: '14px',
                              fontWeight: '600',
                              cursor: 'pointer',
                              textDecoration: 'none'
                            }}
                            onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
                            onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
                          >
                            {ticket.number} - {ticket.subject}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <Badge className={getStatusBadge(ticket.status)} style={{
                            fontSize: '11px',
                            padding: '2px 6px'
                          }}>
                            {statusLabels[ticket.status] || ticket.status}
                          </Badge>
                          <Badge className={getPriorityBadge(ticket.priority)} style={{
                            fontSize: '11px',
                            padding: '2px 6px'
                          }}>
                            {ticket.priority}
                          </Badge>
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#8094ae' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                          <span>Customer: <strong>{ticket.customer.name}</strong></span>
                          <span>Type: <strong>{ticket.typeLabel || ticket.type}</strong></span>
                          <span>Group: <strong>{ticket.group}</strong></span>
                          <span>Assigned to: <strong>{formatAssignedToName(ticket.assignedTo)}</strong></span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button 
                            onClick={() => handleViewTicket(ticket)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#357bf2',
                              cursor: 'pointer',
                              padding: '4px'
                            }}
                            title="View ticket"
                          >
                            <Icon name="eye" />
                          </button>
                          <button 
                            onClick={() => handleRestoreTicket(ticket.id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#28a745',
                              cursor: 'pointer',
                              padding: '4px'
                            }}
                            title="Restore ticket"
                          >
                            <Icon name="undo" />
                          </button>
                          <button 
                            onClick={() => handlePermanentDelete(ticket.id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#eb5757',
                              cursor: 'pointer',
                              padding: '4px'
                            }}
                            title="Delete permanently"
                          >
                            <Icon name="trash" />
                          </button>
                        </div>
                      </div>
                      
                      <div style={{ fontSize: '11px', color: '#8094ae', marginTop: '4px' }}>
                        Archived: {formatDate(ticket.archived_at)} • Created: {formatDate(ticket.created_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {getTotalPages() > 1 && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 20px',
                borderTop: '1px solid #e5e9f2',
                backgroundColor: '#f8f9fb'
              }}>
                <div style={{ fontSize: '13px', color: '#8094ae' }}>
                  Showing {((pagination.currentPage - 1) * pagination.itemsPerPage) + 1} to {Math.min(pagination.currentPage * pagination.itemsPerPage, filteredData.length)} of {filteredData.length} entries
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {Array.from({ length: getTotalPages() }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => handlePageChange(page)}
                      style={{
                        background: page === pagination.currentPage ? '#357bf2' : '#fff',
                        color: page === pagination.currentPage ? '#fff' : '#8094ae',
                        border: '1px solid #e5e9f2',
                        borderRadius: '4px',
                        padding: '6px 10px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        minWidth: '32px'
                      }}
                    >
                      {page}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </PreviewCard>
        </Block>
      </Content>
    </React.Fragment>
  );
};

export default connect((state) => ({
  user: state.auth.currentUser,
}))(ArchivesList);