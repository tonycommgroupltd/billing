/**
 * Closed Tickets Page - Updated Version
 * Fetches closed/resolved tickets from API and displays in table format matching List.js
 * Version: 2.1 - Complete rewrite with API integration
 * Last Updated: 2026-01-07 01:04:12
 */
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { connect } from "react-redux";
import Content from "../../layout/content/Content";
import Head from "../../layout/head/Head";
import { Badge } from "reactstrap";
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
import TicketsAPI from "../../helpers/TicketsAPI";
import { formatTicketDateVeryShort } from "../../utils/dateUtils";
import { showSuccess, showError } from "../../utils/notifications";

const CLOSED_FILTER_KEY = 'tickets_closed_filters_v1';
const defaultClosedFilters = {
  search: '',
  priority: 'all',
  group: 'all',
  type: 'all',
  assignedTo: 'all'
};

const ClosedTickets = ({ user }) => {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTickets, setSelectedTickets] = useState([]);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  
  // Debug: Log component mount
  useEffect(() => {
    console.log('🔵 ClosedTickets Component MOUNTED - Version 2.0');
  }, []);
  const [filters, setFilters] = useState(() => {
    try {
      const saved = sessionStorage.getItem(CLOSED_FILTER_KEY);
      return saved ? { ...defaultClosedFilters, ...JSON.parse(saved) } : defaultClosedFilters;
    } catch { return defaultClosedFilters; }
  });
  useEffect(() => {
    try { sessionStorage.setItem(CLOSED_FILTER_KEY, JSON.stringify(filters)); } catch {}
  }, [filters]);
  const [sort, setSort] = useState({ field: 'updated_at', direction: 'desc' });
  const [pagination, setPagination] = useState({
    currentPage: 1,
    itemsPerPage: 50,
    totalItems: 0
  });

  // Fetch closed/resolved tickets from API
  const fetchClosedTickets = async () => {
    setLoading(true);
    setRefreshing(true);
    try {
      const response = await TicketsAPI.getAll();
      console.log('Closed Tickets - API Response:', response);
      
      // Handle response structure - match List.js exactly
      // TicketsAPI.getAll() returns response.data from axios
      // API response: { success: true, data: [...], pagination: {...} }
      // So response.data is the array of tickets
      let tickets = response.data || [];
      
      if (!Array.isArray(tickets)) {
        console.warn('Closed Tickets - Expected array but got:', typeof tickets, tickets);
        tickets = [];
      }
      
      console.log('Closed Tickets - All tickets loaded:', tickets.length);
      
      // Filter for closed or resolved tickets (case-insensitive)
      const closedTickets = tickets.filter(
        ticket => {
          if (!ticket || !ticket.status) return false;
          const status = ticket.status.toString().toLowerCase();
          return status === 'closed' || status === 'resolved';
        }
      );
      
      console.log('Closed Tickets - Filtered closed/resolved:', closedTickets.length);
      setData(closedTickets);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Error fetching closed tickets:', error);
      console.error('Error details:', error.response || error);
      showError('Failed to load closed tickets. Please check console for details.');
      setData([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    console.log('Closed Tickets - Component mounted, fetching tickets...');
    fetchClosedTickets();
  }, []);

  // Helper function to format assignedTo name
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

  // Helper to safely access customer properties
  const getCustomerProperty = (ticket, property) => {
    // Try nested customer object first
    if (ticket.customer && ticket.customer[property]) {
      return ticket.customer[property];
    }
    // Fall back to direct property on ticket
    const directProperty = `customer_${property}`;
    if (ticket[directProperty]) {
      return ticket[directProperty];
    }
    // Return default values with smart fallbacks
    if (property === 'name') {
      // If no name but we have phone, use phone as fallback
      if (ticket.customer_phone || (ticket.customer && ticket.customer.phone)) {
        const phone = ticket.customer_phone || (ticket.customer && ticket.customer.phone);
        return `Phone: ${phone}`;
      }
      return 'Unknown Customer';
    }
    if (property === 'initial') {
      // Generate initial from phone if name not available
      if (ticket.customer_phone || (ticket.customer && ticket.customer.phone)) {
        return 'P';
      }
      return 'UC';
    }
    if (property === 'avatar') return null;
    if (property === 'phone') return null;
    return null;
  };

  const getAssignedToName = (name) => {
    if (!name || name === 'Unknown Customer') return 'Unassigned';
    return name;
  };

  const getPriorityBadge = (priority) => {
    const badges = {
      'urgent': 'bg-danger',
      'high': 'bg-warning',
      'medium': 'bg-info',
      'low': 'bg-secondary'
    };
    return badges[priority?.toLowerCase()] || 'bg-secondary';
  };

  const getStatusBadge = (status) => {
    const badges = {
      'closed': 'bg-success',
      'resolved': 'bg-success',
      'open': 'bg-primary',
      'pending': 'bg-warning',
      'in-progress': 'bg-info',
      'new': 'bg-primary'
    };
    return badges[status?.toLowerCase()] || 'bg-secondary';
  };

  const statusLabels = {
    'closed': 'Closed',
    'resolved': 'Resolved',
    'open': 'Open',
    'pending': 'Pending',
    'in-progress': 'In Progress',
    'new': 'New'
  };

  // Apply filters
  const applyFilters = () => {
    let filtered = Array.isArray(data) ? [...data] : [];

    // Priority filter
    if (filters.priority && filters.priority !== 'all') {
      filtered = filtered.filter((ticket) => ticket.priority?.toLowerCase() === filters.priority.toLowerCase());
    }

    // Group filter
    if (filters.group && filters.group !== 'all') {
      filtered = filtered.filter((ticket) => ticket.group === filters.group);
    }

    // Type filter
    if (filters.type && filters.type !== 'all') {
      filtered = filtered.filter((ticket) => ticket.type?.toLowerCase() === filters.type.toLowerCase());
    }

    // AssignedTo filter
    if (filters.assignedTo && filters.assignedTo !== 'all') {
      if (filters.assignedTo === 'unassigned') {
        filtered = filtered.filter((ticket) => !ticket.assignedTo || ticket.assignedTo === '0' || ticket.assignedTo === '-');
      } else {
        const selected = filters.assignedTo.toLowerCase();
        filtered = filtered.filter((ticket) => {
          const label = formatAssignedToName(ticket.assignedTo).toLowerCase();
          return label === selected || (ticket.assignedTo || "").toString().toLowerCase().includes(selected);
        });
      }
    }

    // Text search
    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      const normalizePhone = (p) => {
        const d = (p || '').replace(/\D/g, '');
        if (d.startsWith('254') && d.length > 9) return d.slice(3);
        if (d.startsWith('0') && d.length > 1) return d.slice(1);
        return d;
      };
      const qPhone = normalizePhone(q);
      filtered = filtered.filter((t) => {
        const number = (t.number ?? '').toString().toLowerCase();
        const subject = (t.subject ?? '').toString().toLowerCase();
        const customerName = (t.customer?.name ?? t.customer_name ?? '').toString().toLowerCase();
        const assignedTo = (t.assignedTo ?? '').toString().toLowerCase();
        const rawPhone = (t.customer_phone || t.customer?.phone || t.customerPhone || '').toString();
        const phoneMatch = rawPhone.toLowerCase().includes(q) ||
          (qPhone.length >= 4 && normalizePhone(rawPhone).includes(qPhone));
        return number.includes(q) || subject.includes(q) || customerName.includes(q) || assignedTo.includes(q) || phoneMatch;
      });
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal = a?.[sort.field];
      let bVal = b?.[sort.field];

      if (sort.field === 'created_at' || sort.field === 'updated_at') {
        aVal = new Date(aVal || 0);
        bVal = new Date(bVal || 0);
      } else {
        aVal = (aVal ?? '').toString().toLowerCase();
        bVal = (bVal ?? '').toString().toLowerCase();
      }

      if (sort.direction === 'asc') {
        return aVal > bVal ? 1 : -1;
      }
      return aVal < bVal ? 1 : -1;
    });

    setFilteredData(filtered);
    setPagination((prev) => ({
      ...prev,
      totalItems: filtered.length,
      currentPage: 1,
    }));
  };

  useEffect(() => {
    applyFilters();
  }, [data, filters, sort]);

  const getPaginatedData = () => {
    const start = (pagination.currentPage - 1) * pagination.itemsPerPage;
    const end = start + pagination.itemsPerPage;
    return filteredData.slice(start, end);
  };

  const handleSelectTicket = (ticketId, checked) => {
    if (checked) {
      setSelectedTickets([...selectedTickets, ticketId]);
    } else {
      setSelectedTickets(selectedTickets.filter(id => id !== ticketId));
    }
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedTickets(getPaginatedData().map(t => t.id));
    } else {
      setSelectedTickets([]);
    }
  };

  const handleViewTicket = (ticket) => {
    navigate(`/admin/tickets/view/${ticket.id}`);
  };

  const handleReopen = async (ticketId) => {
    try {
      await TicketsAPI.update(ticketId, { status: 'open' });
      showSuccess('Ticket reopened successfully');
      fetchClosedTickets();
    } catch (error) {
      console.error('Error reopening ticket:', error);
      showError('Failed to reopen ticket');
    }
  };

  const handleRefresh = () => {
    fetchClosedTickets();
  };

  // Get unique values for filters
  const priorities = useMemo(() => {
    const unique = [...new Set(data.map(t => t.priority).filter(Boolean))];
    return unique.sort();
  }, [data]);

  const groups = useMemo(() => {
    const unique = [...new Set(data.map(t => t.group).filter(Boolean))];
    return unique.sort();
  }, [data]);

  const types = useMemo(() => {
    const unique = [...new Set(data.map(t => t.type).filter(Boolean))];
    return unique.sort();
  }, [data]);

  const assignedToOptions = useMemo(() => {
    const byLabel = new Map();
    data.forEach((ticket) => {
      const raw = (ticket.assignedTo ?? "").toString().trim();
      if (!raw || raw === "0" || raw === "-") return;
      const label = formatAssignedToName(raw);
      if (!label || label === "Unassigned") return;
      const id = label.toLowerCase();
      if (!byLabel.has(id)) {
        byLabel.set(id, { id, label, value: id });
      }
    });
    return Array.from(byLabel.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [data]);

  const totalPages = Math.ceil(pagination.totalItems / pagination.itemsPerPage);

  return (
    <React.Fragment>
      <Head title="Closed Tickets" />
      <Content>
        <BlockHead size="sm" className="tickets-list-header">
          <BlockBetween className="tickets-list-header-between" style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            gap: '0',
            flexWrap: 'nowrap',
            width: '100%',
            marginBottom: '24px',
            paddingBottom: '16px',
            borderBottom: '1px solid #e5e9f2'
          }}>
            <BlockHeadContent className="tickets-list-header-title" style={{
              flex: '0 0 auto',
              marginRight: 'auto',
              paddingRight: '0'
            }}>
              <BlockTitle tag="h3" page style={{ marginBottom: 0 }}>
                Closed Tickets ({pagination.totalItems})
              </BlockTitle>
            </BlockHeadContent>
            <BlockHeadContent className="tickets-list-header-filters" style={{
              flex: '0 0 auto',
              marginLeft: 'auto',
              paddingLeft: '0',
              minWidth: 'fit-content',
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: '10px'
            }}>
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="Search tickets..."
                value={filters.search}
                onChange={(e) => setFilters({...filters, search: e.target.value})}
                style={{ width: '200px' }}
              />
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
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>

        {/* Filters Row */}
        <div style={{ 
          marginBottom: '20px', 
          padding: '12px 16px', 
          backgroundColor: '#f8f9fb', 
          borderRadius: '6px',
          display: 'flex',
          gap: '12px',
          flexWrap: 'wrap',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#526484', minWidth: '70px' }}>Priority:</label>
            <select
              className="form-control form-control-sm"
              style={{ width: '120px' }}
              value={filters.priority}
              onChange={(e) => setFilters({...filters, priority: e.target.value})}
            >
              <option value="all">All</option>
              {priorities.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#526484', minWidth: '70px' }}>Group:</label>
            <select
              className="form-control form-control-sm"
              style={{ width: '120px' }}
              value={filters.group}
              onChange={(e) => setFilters({...filters, group: e.target.value})}
            >
              <option value="all">All</option>
              {groups.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#526484', minWidth: '70px' }}>Type:</label>
            <select
              className="form-control form-control-sm"
              style={{ width: '120px' }}
              value={filters.type}
              onChange={(e) => setFilters({...filters, type: e.target.value})}
            >
              <option value="all">All</option>
              {types.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#526484', minWidth: '70px' }}>Assigned:</label>
            <select
              className="form-control form-control-sm"
              style={{ width: '150px' }}
              value={filters.assignedTo}
              onChange={(e) => setFilters({...filters, assignedTo: e.target.value})}
            >
              <option value="all">All</option>
              <option value="unassigned">Unassigned</option>
              {assignedToOptions.map((a) => (
                <option key={a.id} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Block>
          <PreviewCard>
            {/* Debug info - remove in production */}
            {process.env.NODE_ENV === 'development' && (
              <div style={{ padding: '10px', backgroundColor: '#fff3cd', marginBottom: '10px', fontSize: '12px', borderRadius: '4px' }}>
                <strong>Debug:</strong> Total Data: {data.length} | Filtered: {filteredData.length} | Loading: {loading ? 'Yes' : 'No'} | Page: {pagination.currentPage}/{totalPages}
              </div>
            )}
            
            {loading && !data.length ? (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <Icon name="loader" className="spinning" style={{ fontSize: '24px', color: '#8094ae' }} />
                <p style={{ marginTop: '10px', color: '#8094ae' }}>Loading closed tickets...</p>
              </div>
            ) : filteredData.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <Icon name="file-text" style={{ fontSize: '48px', color: '#8094ae', marginBottom: '16px' }} />
                <p style={{ color: '#8094ae', fontSize: '16px', marginBottom: '10px' }}>
                  {data.length === 0 
                    ? 'No closed/resolved tickets found. Make sure you have tickets with status "closed" or "resolved" in the database.' 
                    : `No tickets match your filters (${filteredData.length} of ${data.length} shown). Try adjusting your search criteria.`}
                </p>
                <Button 
                  className="btn btn-primary btn-sm mt-2" 
                  onClick={handleRefresh}
                >
                  <Icon name="reload" className="me-1" />
                  Refresh Data
                </Button>
              </div>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8f9fb', borderBottom: '2px solid #e5e9f2' }}>
                        <th style={{
                          padding: '14px 16px 14px 20px', 
                          fontSize: '11px', 
                          fontWeight: '600', 
                          color: '#374151', 
                          width: '45px',
                          textAlign: 'center'
                        }}>
                          <input 
                            type="checkbox" 
                            checked={selectedTickets.length === getPaginatedData().length && getPaginatedData().length > 0}
                            onChange={(e) => handleSelectAll(e.target.checked)}
                            style={{
                              transform: 'scale(1.1)',
                              cursor: 'pointer',
                              accentColor: '#357bf2'
                            }} 
                          />
                        </th>
                        <th style={{
                          padding: '14px 10px', 
                          fontSize: '13px', 
                          fontWeight: '600', 
                          color: '#374151', 
                          width: '85px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          cursor: 'pointer'
                        }}
                        onClick={() => setSort({ field: 'number', direction: sort.field === 'number' && sort.direction === 'asc' ? 'desc' : 'asc' })}
                        >
                          Number {sort.field === 'number' && (sort.direction === 'asc' ? '↑' : '↓')}
                        </th>
                        <th style={{
                          padding: '14px 10px', 
                          fontSize: '13px', 
                          fontWeight: '600', 
                          color: '#374151', 
                          width: '230px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px'
                        }}>Subject</th>
                        <th style={{
                          padding: '14px 10px', 
                          fontSize: '13px', 
                          fontWeight: '600', 
                          color: '#374151', 
                          width: '150px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px'
                        }}>Customer</th>
                        <th style={{
                          padding: '14px 10px', 
                          fontSize: '13px', 
                          fontWeight: '600', 
                          color: '#374151', 
                          width: '100px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          textAlign: 'center'
                        }}>Priority</th>
                        <th style={{
                          padding: '14px 10px', 
                          fontSize: '13px', 
                          fontWeight: '600', 
                          color: '#374151', 
                          width: '125px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          textAlign: 'left'
                        }}>Status</th>
                        <th style={{
                          padding: '14px 10px', 
                          fontSize: '13px', 
                          fontWeight: '600', 
                          color: '#374151', 
                          width: '80px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          textAlign: 'right'
                        }}>Group</th>
                        <th style={{
                          padding: '14px 10px', 
                          fontSize: '13px', 
                          fontWeight: '600', 
                          color: '#374151', 
                          width: '100px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px'
                        }}>Type</th>
                        <th style={{
                          padding: '14px 10px', 
                          fontSize: '11px', 
                          fontWeight: '600', 
                          color: '#374151', 
                          width: '120px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px'
                        }}>Assigned</th>
                        <th style={{
                          padding: '14px 20px 14px 10px', 
                          fontSize: '11px', 
                          fontWeight: '600', 
                          color: '#374151', 
                          width: '90px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          textAlign: 'center'
                        }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getPaginatedData().map((ticket) => (
                        <tr 
                          key={ticket.id} 
                          style={{
                            borderBottom: '1px solid #e5e9f2',
                            backgroundColor: selectedTickets.includes(ticket.id) ? '#f0f8ff' : '#fff',
                            transition: 'background-color 0.15s'
                          }}
                          onMouseEnter={(e) => {
                            if (!selectedTickets.includes(ticket.id)) {
                              e.currentTarget.style.backgroundColor = '#f8f9fb';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!selectedTickets.includes(ticket.id)) {
                              e.currentTarget.style.backgroundColor = '#fff';
                            }
                          }}
                        >
                          <td style={{
                            padding: '14px 16px 14px 20px', 
                            width: '45px',
                            textAlign: 'center',
                            verticalAlign: 'middle'
                          }}>
                            <input 
                              type="checkbox" 
                              checked={selectedTickets.includes(ticket.id)}
                              onChange={(e) => handleSelectTicket(ticket.id, e.target.checked)}
                              style={{
                                transform: 'scale(1.1)',
                                cursor: 'pointer',
                                accentColor: '#357bf2'
                              }} 
                            />
                          </td>
                          <td style={{
                            padding: '14px 10px', 
                            width: '85px',
                            verticalAlign: 'middle'
                          }}>
                            <span style={{fontWeight: '600', color: '#374151', fontSize: '14px'}}>
                              <span 
                                onClick={() => handleViewTicket(ticket)}
                                style={{
                                  cursor: 'pointer',
                                  color: '#357bf2',
                                  textDecoration: 'none',
                                  transition: 'color 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                  e.target.style.textDecoration = 'underline';
                                  e.target.style.color = '#2563eb';
                                }}
                                onMouseLeave={(e) => {
                                  e.target.style.textDecoration = 'none';
                                  e.target.style.color = '#357bf2';
                                }}
                              >
                                {ticket.number}
                              </span>
                            </span>
                          </td>
                          <td style={{
                            padding: '14px 10px', 
                            width: '230px',
                            verticalAlign: 'middle'
                          }}>
                            <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
                              <span 
                                onClick={() => handleViewTicket(ticket)}
                                style={{
                                  color: '#357bf2', 
                                  textDecoration: 'none', 
                                  fontSize: '14px',
                                  fontWeight: '500',
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden',
                                  lineHeight: '1.4',
                                  cursor: 'pointer',
                                  transition: 'color 0.2s',
                                  wordBreak: 'break-word'
                                }}
                                onMouseEnter={(e) => {
                                  e.target.style.textDecoration = 'underline';
                                  e.target.style.color = '#2563eb';
                                }}
                                onMouseLeave={(e) => {
                                  e.target.style.textDecoration = 'none';
                                  e.target.style.color = '#357bf2';
                                }}
                                title={ticket.subject}
                              >
                                {ticket.subject}
                              </span>
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                flexWrap: 'wrap'
                              }}>
                                <div style={{
                                  fontSize: '10px', 
                                  color: '#8094ae',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '3px'
                                }}>
                                  <Icon name="clock" style={{fontSize: '9px'}} />
                                  <span style={{whiteSpace: 'nowrap'}}>
                                    {ticket.created_at ? formatTicketDateVeryShort(ticket.created_at) : 'N/A'}
                                  </span>
                                </div>
                                {getCustomerProperty(ticket, 'phone') && (
                                  <a
                                    href={`tel:${getCustomerProperty(ticket, 'phone')}`}
                                    onClick={(e) => e.stopPropagation()}
                                    style={{
                                      fontSize: '10px',
                                      color: '#28a745',
                                      textDecoration: 'none',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      fontWeight: '600',
                                      transition: 'color 0.2s'
                                    }}
                                    onMouseEnter={(e) => {
                                      e.target.style.color = '#1e7e34';
                                      e.target.style.textDecoration = 'underline';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.target.style.color = '#28a745';
                                      e.target.style.textDecoration = 'none';
                                    }}
                                    title="Click to call"
                                  >
                                    <Icon name="call" style={{fontSize: '10px'}} />
                                    {getCustomerProperty(ticket, 'phone')}
                                  </a>
                                )}
                              </div>
                            </div>
                          </td>
                          <td style={{
                            padding: '14px 10px', 
                            width: '150px',
                            verticalAlign: 'middle'
                          }}>
                            <div style={{display: 'flex', alignItems: 'flex-start', gap: '8px'}}>
                              <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                backgroundColor: getCustomerProperty(ticket, 'avatar') ? 'transparent' : '#526484',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#fff',
                                fontSize: '11px',
                                fontWeight: '600',
                                flexShrink: 0,
                                marginTop: '2px'
                              }}>
                                {getCustomerProperty(ticket, 'avatar') ? (
                                  <img src={getCustomerProperty(ticket, 'avatar')} alt="" style={{width: '100%', height: '100%', borderRadius: '50%'}} />
                                ) : (
                                  getCustomerProperty(ticket, 'initial')
                                )}
                              </div>
                              <div style={{minWidth: 0, flex: 1}}>
                                <div style={{
                                  fontSize: '13px', 
                                  fontWeight: '500', 
                                  color: '#374151',
                                  lineHeight: '1.3',
                                  wordBreak: 'break-word',
                                  marginBottom: '2px'
                                }}>
                                  {getAssignedToName(getCustomerProperty(ticket, 'name'))}
                                </div>
                                <div style={{
                                  fontSize: '11px', 
                                  color: '#8094ae',
                                  lineHeight: '1.3',
                                  wordBreak: 'break-all'
                                }}>
                                  {getCustomerProperty(ticket, 'phone') || 'No phone'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td style={{
                            padding: '14px 10px', 
                            width: '100px',
                            verticalAlign: 'middle',
                            textAlign: 'center'
                          }}>
                            <Badge className={getPriorityBadge(ticket.priority)} style={{
                              textTransform: 'capitalize',
                              fontSize: '11px',
                              padding: '4px 8px',
                              fontWeight: '600'
                            }}>
                              {ticket.priority}
                            </Badge>
                          </td>
                          <td style={{
                            padding: '14px 10px', 
                            width: '125px', 
                            verticalAlign: 'middle',
                            textAlign: 'left'
                          }}>
                            <Badge className={getStatusBadge(ticket.status)} style={{
                              textTransform: 'none',
                              fontSize: '11px',
                              padding: '4px 8px',
                              fontWeight: '500',
                              whiteSpace: 'nowrap'
                            }}>
                              {statusLabels[ticket.status] || ticket.status}
                            </Badge>
                          </td>
                          <td style={{
                            padding: '14px 10px', 
                            fontSize: '12px', 
                            color: '#374151', 
                            width: '80px', 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis', 
                            whiteSpace: 'nowrap',
                            verticalAlign: 'middle',
                            textAlign: 'right'
                          }}>
                            {ticket.group || 'Any'}
                          </td>
                          <td style={{
                            padding: '14px 10px', 
                            fontSize: '14px', 
                            color: '#374151', 
                            width: '100px',
                            verticalAlign: 'middle',
                            wordBreak: 'break-word',
                            whiteSpace: 'normal',
                            lineHeight: '1.4',
                            textTransform: 'capitalize'
                          }}>
                            {ticket.typeLabel || ticket.type}
                          </td>
                          <td style={{
                            padding: '14px 10px', 
                            fontSize: '14px', 
                            color: '#374151', 
                            width: '120px', 
                            verticalAlign: 'middle',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {formatAssignedToName(ticket.assignedTo)}
                          </td>
                          <td style={{
                            padding: '14px 20px 14px 10px', 
                            width: '90px',
                            verticalAlign: 'middle',
                            textAlign: 'center'
                          }}>
                            <div className="dropdown">
                              <Button 
                                color="transparent" 
                                className="btn btn-icon btn-trigger" 
                                data-toggle="dropdown"
                                style={{ padding: '4px 8px' }}
                              >
                                <Icon name="more-h" style={{ fontSize: '18px', color: '#8094ae' }} />
                              </Button>
                              <div className="dropdown-menu dropdown-menu-right">
                                <ul className="link-list-opt no-bdr">
                                  <li>
                                    <a href="#view" onClick={(e) => { e.preventDefault(); handleViewTicket(ticket); }}>
                                      <Icon name="eye"></Icon>
                                      <span>View Details</span>
                                    </a>
                                  </li>
                                  <li>
                                    <a href="#reopen" onClick={(e) => { e.preventDefault(); handleReopen(ticket.id); }}>
                                      <Icon name="reload"></Icon>
                                      <span>Reopen</span>
                                    </a>
                                  </li>
                                </ul>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px 20px',
                    borderTop: '1px solid #e5e9f2',
                    backgroundColor: '#f8f9fb'
                  }}>
                    <div style={{ fontSize: '13px', color: '#526484' }}>
                      Showing {((pagination.currentPage - 1) * pagination.itemsPerPage) + 1} to {Math.min(pagination.currentPage * pagination.itemsPerPage, pagination.totalItems)} of {pagination.totalItems} tickets
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <Button
                        className="btn btn-sm btn-outline-light"
                        onClick={() => setPagination({...pagination, currentPage: Math.max(1, pagination.currentPage - 1)})}
                        disabled={pagination.currentPage === 1}
                      >
                        <Icon name="chevron-left" />
                      </Button>
                      <span style={{ fontSize: '13px', color: '#526484', minWidth: '80px', textAlign: 'center' }}>
                        Page {pagination.currentPage} of {totalPages}
                      </span>
                      <Button
                        className="btn btn-sm btn-outline-light"
                        onClick={() => setPagination({...pagination, currentPage: Math.min(totalPages, pagination.currentPage + 1)})}
                        disabled={pagination.currentPage === totalPages}
                      >
                        <Icon name="chevron-right" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </PreviewCard>
        </Block>
      </Content>
    </React.Fragment>
  );
};

const mapStateToProps = (state) => ({
  user: state.auth.currentUser
});

export default connect(mapStateToProps)(ClosedTickets);
