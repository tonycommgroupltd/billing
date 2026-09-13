import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { connect } from "react-redux";
import Content from "../../layout/content/Content";
import Head from "../../layout/head/Head";
import { Card, Row, Col, Badge, Dropdown, DropdownToggle, DropdownMenu, DropdownItem, Input, Table, Toast, ToastHeader, ToastBody } from "reactstrap";
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
import { getTypeLabels, getTypeIdByLabel, getTypeLabelById, isInstallationMenuType } from "../../config/ticketTypes";
import { formatTicketDateVeryShort, formatTicketTime, getTimeAgo } from "../../utils/dateUtils";
import { isTicketUnassigned } from "../../utils/ticketDashboardStats";

// Helper function to format assignedTo name (extract username from "Name (email)" format)
// Handles both single string and JSON array of emails
const formatAssignedToName = (assignedTo) => {
  if (!assignedTo || assignedTo === '0' || assignedTo === '-') return 'Unassigned';
  
  const assignedStr = assignedTo.toString().trim();
  
  // Check if it's a JSON array
  if (assignedStr.startsWith('[')) {
    try {
      const arr = JSON.parse(assignedStr);
      if (Array.isArray(arr) && arr.length > 0) {
        // Parse multiple assignees - show count or abbreviated names
        return arr.length === 1 
          ? formatSingleName(arr[0]) 
          : `${arr.length} assigned`;
      }
    } catch (e) {
      // JSON parse failed, treat as string
    }
  }
  
  // Single value - parse as before
  return formatSingleName(assignedStr);
};

const formatSingleName = (nameStr) => {
  // If it contains parentheses, extract the name part before them
  const match = nameStr.match(/^(.+?)\s*\(/);
  if (match) {
    return match[1].trim();
  }
  
  // If it looks like an email (contains @), extract the part before @ and format it
  if (nameStr.includes('@')) {
    const emailName = nameStr.split('@')[0];
    return emailName
      .split(/[._-]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  
  // Otherwise return as-is (it's already a username/name)
  return nameStr;
};

const LIST_TABLE_KEY = 'tickets_list_table_v1';
const defaultListTable = {
  sort: { field: 'updated_at', direction: 'desc' },
  itemsPerPage: 10,
  currentPage: 1,
  currentView: null,
  visibleColumns: {
    checkbox: true, number: true, subject: true, customer: true,
    priority: true, status: true, group: true, type: true,
    assignedTo: true, watching: true, actions: true
  }
};
const getSavedTable = () => {
  try {
    const s = sessionStorage.getItem(LIST_TABLE_KEY);
    return s ? { ...defaultListTable, ...JSON.parse(s) } : defaultListTable;
  } catch { return defaultListTable; }
};

const LIST_FILTER_KEY = 'tickets_list_filters_v1';
const defaultListFilters = {
  quickAccess: 'all',
  status: 'all',
  entries: 100,
  search: '',
  assignedTo: '',
  dateRange: 'all',
  dateFrom: '',
  dateTo: '',
  type: '',
  group: '',
  priority: '',
};

const TicketsList = ({ user }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isTechnician = user?.all_roles?.some((role) => (role || '').toLowerCase() === 'technician') &&
    !user?.all_roles?.some((role) => (role || '').toLowerCase() === 'administrator') &&
    !user?.all_roles?.some((role) => (role || '').toLowerCase() === 'super-administrator') &&
    !user?.all_roles?.some((role) => (role || '').toLowerCase() === 'manager');
  const currentUserId = user?.id;
  const currentUserName = user?.name || user?.username;
  const mountedRef = useRef(true);
  const loadGenRef = useRef(0);
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTickets, setSelectedTickets] = useState([]);
  const _savedTable = useRef(getSavedTable());
  const savedPageRef = useRef(_savedTable.current.currentPage || 1);
  const isFirstApply = useRef(true);

  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });
  const [currentView, setCurrentView] = useState(() => {
    const saved = _savedTable.current.currentView;
    if (saved) return saved;
    if (typeof window === 'undefined') return 'table';
    return window.innerWidth < 768 ? 'card' : 'table';
  }); // 'table' or 'card'
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [visibleColumns, setVisibleColumns] = useState(() => _savedTable.current.visibleColumns);
  const [filters, setFilters] = useState(() => {
    try {
      const saved = sessionStorage.getItem(LIST_FILTER_KEY);
      return saved ? { ...defaultListFilters, ...JSON.parse(saved) } : defaultListFilters;
    } catch { return defaultListFilters; }
  });
  // Track mount so async fetches never setState after unmount (nav away mid-load).
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem(LIST_FILTER_KEY, JSON.stringify(filters)); } catch {}
  }, [filters]);

  // Keep filters in sync with URL query params.
  // For report links (type=...), default status to "new" unless status is explicitly provided.
  // Dashboard deep-links always reset conflicting session filters.
  // Customer view deep-links use ?search=phone (and optional status=all).
  useEffect(() => {
    const typeParam = (searchParams.get('type') || '').trim();
    const statusParam = (searchParams.get('status') || '').trim();
    const filterParam = (searchParams.get('filter') || '').trim();
    const searchParam = (searchParams.get('search') || searchParams.get('q') || '').trim();

    if (!typeParam && !statusParam && !filterParam && !searchParam) return;

    setFilters((prev) => {
      const next = { ...prev };

      if (searchParam && !typeParam && !filterParam) {
        // From customer view: show this customer's tickets only
        next.search = searchParam;
        next.status = statusParam || 'all';
        next.type = '';
        next.quickAccess = 'all';
        next.assignedTo = '';
        next.dateRange = 'all';
        next.dateFrom = '';
        next.dateTo = '';
        next.group = '';
        next.priority = '';
      } else if (typeParam) {
        next.type = typeParam;
        next.status = statusParam || 'new';
        next.quickAccess = 'all';
        next.assignedTo = '';
        next.search = '';
        next.dateRange = 'all';
        next.dateFrom = '';
        next.dateTo = '';
      } else {
        // Explicit dashboard / list deep-link: clear leftover report/search filters
        next.type = '';
        next.search = searchParam || '';
        next.assignedTo = '';
        next.dateRange = 'all';
        next.dateFrom = '';
        next.dateTo = '';
        next.group = '';
        next.priority = '';

        if (statusParam) {
          next.status = statusParam;
        } else if (filterParam) {
          next.status = 'all';
        }

        if (filterParam === 'unassigned' && !isTechnician) {
          next.quickAccess = 'unassigned';
        } else if (filterParam === 'all' || !filterParam) {
          next.quickAccess = 'all';
        } else if (filterParam && !isTechnician) {
          next.quickAccess = filterParam;
        }
      }

      try {
        sessionStorage.setItem(LIST_FILTER_KEY, JSON.stringify(next));
      } catch {}

      return next;
    });
  }, [searchParams, isTechnician]);

  // Helper for quick date presets
  const applyDatePreset = (preset) => {
    const today = new Date().toISOString().split('T')[0];
    switch (preset) {
      case 'today':
        setFilters(prev => ({ ...prev, dateRange: 'today', dateFrom: today, dateTo: today }));
        break;
      case 'yesterday': {
        const y = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        setFilters(prev => ({ ...prev, dateRange: 'yesterday', dateFrom: y, dateTo: y }));
        break;
      }
      case 'this_week': {
        const now = new Date();
        const dow = now.getDay();
        const mon = new Date(now);
        mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
        setFilters(prev => ({ ...prev, dateRange: 'this_week', dateFrom: mon.toISOString().split('T')[0], dateTo: today }));
        break;
      }
      case 'last_week': {
        const now = new Date();
        const dow = now.getDay();
        const lm = new Date(now);
        lm.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1) - 7);
        const ls = new Date(lm);
        ls.setDate(lm.getDate() + 6);
        setFilters(prev => ({ ...prev, dateRange: 'last_week', dateFrom: lm.toISOString().split('T')[0], dateTo: ls.toISOString().split('T')[0] }));
        break;
      }
      case 'this_month': {
        const now = new Date();
        const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        setFilters(prev => ({ ...prev, dateRange: 'this_month', dateFrom: first, dateTo: today }));
        break;
      }
      case 'last_month': {
        const now = new Date();
        const first = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
        const last = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
        setFilters(prev => ({ ...prev, dateRange: 'last_month', dateFrom: first, dateTo: last }));
        break;
      }
      case 'custom':
        setFilters(prev => ({ ...prev, dateRange: 'custom' }));
        break;
      case 'all':
      default:
        setFilters(prev => ({ ...prev, dateRange: 'all', dateFrom: '', dateTo: '' }));
        break;
    }
  };

  const agentNames = useMemo(() => {
    const list = Array.isArray(data) ? data : [];
    const seen = new Set();
    for (const ticket of list) {
      const name = (ticket?.assignedTo ?? '').toString().trim();
      if (!name) continue;
      const lower = name.toLowerCase();
      if (lower === '0' || lower === '-' || lower === 'unassigned') continue;
      
      // Split names if multiple technicians are assigned (comma-separated)
      const names = name.split(',').map(n => n.trim()).filter(n => n.length > 0);
      names.forEach(individualName => {
        if (individualName) {
          seen.add(individualName);
        }
      });
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [data]);

  // Helper to decide if a ticket belongs to the current technician (matches common identifiers)
  const isTicketAssignedToCurrentTechnician = (ticket) => {
    const assigned = (ticket.assignedTo || '').toString().trim().toLowerCase();
    if (!assigned) return false;

    const candidates = [currentUserName, user?.username, user?.email]
      .filter(Boolean)
      .map((v) => v.toString().trim().toLowerCase());

    const idMatch = ticket.assignedToId && currentUserId && String(ticket.assignedToId) === String(currentUserId);
    const nameMatch = candidates.some((val) => assigned === val || assigned.includes(val));

    return idMatch || nameMatch;
  };

  // Load all available technicians and engineers for assignment
  const loadAllTechnicians = async () => {
    try {
      const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
      const technicians = await TicketsAPI.getAssignmentOptions();
      if (!mountedRef.current) return;
      if (technicians && technicians.length > 0) {
        setAllTechnicians(technicians);
      } else {
        // Fallback: try to load users and filter for technicians/engineers
        const { default: UsersAPI } = await import('../../helpers/UsersAPI');
        const usersResponse = await UsersAPI.getAll();
        if (!mountedRef.current) return;
        if (usersResponse && usersResponse.data) {
          const techEngineers = usersResponse.data.filter(user => {
            if (!user.all_roles || !Array.isArray(user.all_roles)) return false;
            return user.all_roles.some(role => {
              const roleName = (role || '').toLowerCase();
              return roleName === 'technician' || roleName === 'engineer' ||
                     roleName.includes('technician') || roleName.includes('engineer');
            });
          });
          
          const formattedOptions = techEngineers.map(user => ({
            value: user.name || user.username,
            label: user.name || user.username
          }));
          
          setAllTechnicians(formattedOptions);
        }
      }
    } catch (error) {
      console.error('Error loading technicians:', error);
    }
  };

  // Enhanced pagination state
  const [pagination, setPagination] = useState({
    currentPage: 1,
    itemsPerPage: _savedTable.current.itemsPerPage || 10,
    totalItems: 0
  });
  
  // Sort state
  const [sort, setSort] = useState(_savedTable.current.sort || {
    field: 'updated_at',
    direction: 'desc'
  });

  // Persist table state (sort, page, itemsPerPage, view, columns) to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(LIST_TABLE_KEY, JSON.stringify({
        sort,
        itemsPerPage: pagination.itemsPerPage,
        currentPage: pagination.currentPage,
        currentView,
        visibleColumns
      }));
    } catch {}
  }, [sort, pagination.currentPage, pagination.itemsPerPage, currentView, visibleColumns]);
  
  // Bulk actions state
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [bulkAction, setBulkAction] = useState('');
  const [openDropdown, setOpenDropdown] = useState(null);

  // Toast notification state
  const [toastConfig, setToastConfig] = useState({
    show: false,
    message: '',
    type: 'success', // 'success', 'info', 'warning', 'danger'
    icon: 'check-circle'
  });

  // Pull-to-refresh state
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);

  const typeOptions = getTypeLabels();
  const groupOptions = useMemo(() => {
    const names = (data || [])
      .map((t) => (t.group || '').toString().trim())
      .filter(Boolean);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [data]);
  const [showMoreSidebarFilters, setShowMoreSidebarFilters] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const mobileNow = window.innerWidth < 768;
      setIsMobile(mobileNow);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize);
      handleResize();
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', handleResize);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Shared helper: normalize and role-filter a raw ticket array
    const processTickets = (rawTickets) => {
      let tickets = rawTickets.map(t => {
        const formattedName = formatAssignedToName(t.assignedTo);
        return {
          ...t,
          assignedTo: formattedName === 'Unassigned' ? t.assignedTo : formattedName,
          assignedToDisplay: formattedName
        };
      });

      if (isTechnician) {
        tickets = tickets.filter(isTicketAssignedToCurrentTechnician);
        const hiddenStatuses = ['resolved', 'installation_complete', 'installation complete'];
        tickets = tickets.filter((ticket) => {
          const status = (ticket.status || '').toLowerCase().replace(/[\s-]+/g, '_');
          return !hiddenStatuses.includes(status);
        });
      }
      return tickets;
    };

    const loadTickets = async () => {
      const gen = ++loadGenRef.current;
      // --- Phase 1: Show cached data instantly ---
      const { getCachedTickets, setCachedTickets, getCachedLastModified } = await import('../../helpers/ticketCache');
      if (cancelled || !mountedRef.current || gen !== loadGenRef.current) return;
      const cached = getCachedTickets('active');
      const cachedArchived = getCachedTickets('archived');

      if (cached && cached.tickets.length > 0) {
        const archivedTagged = (cachedArchived?.tickets || []).map(t => ({ ...t, _archived: true }));
        const combined = [...cached.tickets, ...archivedTagged];
        const processed = processTickets(combined);
        if (cancelled || !mountedRef.current || gen !== loadGenRef.current) return;
        setData(processed);
        setPagination(prev => ({ ...prev, totalItems: processed.length }));
        // Don't set loading=true when we have cache — the user sees data immediately
      } else {
        if (cancelled || !mountedRef.current || gen !== loadGenRef.current) return;
        setLoading(true);
      }

      // --- Phase 2: Fetch fresh data in background ---
      try {
        const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
        const lastMod = getCachedLastModified('active');

        // Use slim endpoint (no description) with conditional request
        const [activeResult, archivedResp] = await Promise.allSettled([
          TicketsAPI.getAllSlim({ per_page: 0 }, lastMod),
          TicketsAPI.getArchived({ per_page: 0 })
        ]);

        if (cancelled || !mountedRef.current || gen !== loadGenRef.current) return;

        let activeTickets;
        if (activeResult.status === 'fulfilled' && activeResult.value.notModified) {
          // 304: data unchanged, keep using cached
          activeTickets = cached?.tickets || [];
        } else if (activeResult.status === 'fulfilled') {
          const payload = activeResult.value.data;
          activeTickets = Array.isArray(payload?.data)
            ? payload.data
            : (Array.isArray(payload) ? payload : []);
          // Update cache with fresh data
          setCachedTickets(activeTickets, 'active', activeResult.value.lastModified);
        } else {
          // Network error — fall back to whatever cache we have
          activeTickets = cached?.tickets || [];
        }

        let archivedTickets = cachedArchived?.tickets || [];
        if (archivedResp.status === 'fulfilled') {
          const archPayload = archivedResp.value?.data;
          const freshArchived = Array.isArray(archPayload?.data)
            ? archPayload.data
            : (Array.isArray(archPayload) ? archPayload : null);
          if (freshArchived) {
            archivedTickets = freshArchived;
            if (archivedTickets.length > 0) {
              setCachedTickets(archivedTickets, 'archived');
            }
          }
        }

        const archivedTagged = archivedTickets.map(t => ({ ...t, _archived: true }));
        const tickets = processTickets([...activeTickets, ...archivedTagged]);

        if (cancelled || !mountedRef.current || gen !== loadGenRef.current) return;
        setData(tickets);
        setPagination(prev => ({ ...prev, totalItems: tickets.length }));

      } catch (error) {
        console.error('Error loading tickets:', error);
        // If we have cached data, we already showed it — no blank screen
      } finally {
        if (!cancelled && mountedRef.current && gen === loadGenRef.current) {
          setLoading(false);
        }
      }
    };

    // Load tickets and technicians
    loadTickets();
    loadAllTechnicians();

    return () => {
      cancelled = true;
    };
  }, [searchParams, isTechnician, currentUserId, currentUserName]);

  // Auto-refresh tickets when user returns to the page
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Page is now visible, refresh data silently (applyFilters will re-apply filters)
        console.log('Page became visible, refreshing tickets...');
        handleRefresh();
      }
    };

    // Listen for page visibility changes only (not window focus - too aggressive)
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isTechnician, currentUserName]);

  const headerTitleContainerStyle = isMobile
    ? { flexShrink: 0, width: '100%' }
    : { flexShrink: 0, minWidth: 'fit-content', flex: '0 0 auto' };

  const headerToolsContainerStyle = isMobile
    ? { flexShrink: 0, width: '100%', marginTop: '8px' }
    : { 
        marginLeft: 'auto', 
        flexShrink: 0, 
        display: 'flex', 
        alignItems: 'center', 
        gap: '12px',
        flex: '0 0 auto',
        justifyContent: 'flex-end'
      };

  const mobileFilterFieldStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    width: '100%'
  };

  const mobileFilterLabelStyle = { margin: 0, fontSize: '11px', color: '#526484' };

  const getQuickAccessSelectValue = () => {
    if (filters.quickAccess === 'unassigned') return '0';
    if (filters.quickAccess === 'all') return '-1';
    return filters.quickAccess;
  };

  const handleQuickAccessChange = (value) => {
    if (value === '-1') {
      setFilters((prev) => ({ ...prev, quickAccess: 'all', assignedTo: '' }));
      return;
    }
    if (value === '0') {
      setFilters((prev) => ({ ...prev, quickAccess: 'unassigned', assignedTo: '' }));
      return;
    }
    setFilters((prev) => ({ ...prev, quickAccess: value, assignedTo: '' }));
  };

  const applyFilters = () => {
    let filtered = Array.isArray(data) ? [...data] : [];
    
    console.log('🔍 Applying filters - Starting with:', filtered.length, 'tickets');
    console.log('🔍 Active filters:', filters);

    // Hide archived tickets unless user is actively searching by phone/text OR filtering by type.
    // For report-driven type navigation (e.g., Installation), archived rows must be included.
    const searchHasInput = filters.search && filters.search.trim().length > 0;
    const hasTypeFilter = filters.type && filters.type.trim().length > 0;
    if (!searchHasInput && !hasTypeFilter) {
      filtered = filtered.filter(t => !t._archived);
    }

    // FOR TECHNICIANS ONLY: Hide resolved / installation_complete tickets
    // All other statuses stay visible so technicians can track their work
    if (isTechnician) {
      const hiddenStatuses = ['resolved', 'installation_complete', 'installation complete'];
      filtered = filtered.filter((ticket) => {
        const status = (ticket.status || '').toLowerCase().replace(/[\s-]+/g, '_');
        return !hiddenStatuses.includes(status);
      });
      console.log('🔍 Technician filter: Hiding resolved/complete, showing:', filtered.length);
    }

    // Quick access filter
    if (filters.quickAccess && filters.quickAccess !== 'all') {
      const beforeQuickAccess = filtered.length;

      if (filters.quickAccess === 'me') {
        filtered = filtered.filter(isTicketAssignedToCurrentTechnician);
      } else if (filters.quickAccess === 'watched') {
        filtered = filtered.filter((t) => (t.watching === 'Yes' || t.watching === true));
      } else if (filters.quickAccess === 'unassigned') {
        filtered = filtered.filter((t) => isTicketUnassigned(t));
      } else {
        // Treat as assignee name
        const q = filters.quickAccess.toString().trim().toLowerCase();
        filtered = filtered.filter((t) => (t.assignedTo || '').toString().toLowerCase().includes(q));
      }

      console.log('After quick access filter:', { before: beforeQuickAccess, after: filtered.length, value: filters.quickAccess });
    }

    const normalizeStatusKey = (v) =>
      (v || '').toString().trim().toLowerCase().replace(/[\s-]+/g, '_');

    // Status filter - case-insensitive; open ↔ work in progress aliases
    if (filters.status && filters.status !== 'all') {
      const filterKey = normalizeStatusKey(filters.status);
      filtered = filtered.filter((ticket) => {
        const ticketKey = normalizeStatusKey(ticket.status);
        if (filterKey === 'closed') {
          return ticketKey === 'closed' || ticketKey === 'resolved';
        }
        if (filterKey === 'open' || filterKey === 'work_in_progress') {
          return ticketKey === 'open' || ticketKey === 'work_in_progress' || ticketKey === 'wip';
        }
        if (filterKey === 'waiting_customer' || filterKey === 'waiting_on_customer') {
          return ticketKey === 'waiting_customer' || ticketKey === 'waiting_on_customer';
        }
        if (filterKey === 'waiting_agent' || filterKey === 'waiting_on_agent') {
          return ticketKey === 'waiting_agent' || ticketKey === 'waiting_on_agent';
        }
        if (filterKey === 'waiting_power' || filterKey === 'waiting_on_power') {
          return ticketKey === 'waiting_power' || ticketKey === 'waiting_on_power';
        }
        return ticketKey === filterKey;
      });
    }

    // Type filter
    if (filters.type && filters.type.trim()) {
      const normalizeType = (v) => (v || '').toString().trim().toLowerCase();
      const filterType = normalizeType(filters.type);
      const filterTypeId = getTypeIdByLabel(filters.type);

      filtered = filtered.filter((ticket) => {
        const ticketTypeRaw = (ticket.type ?? '').toString();
        const ticketTypeLabel = (ticket.typeLabel ?? '').toString();
        const mappedLabelFromId = getTypeLabelById(ticketTypeRaw);

        const candidates = new Set([
          normalizeType(ticketTypeRaw),
          normalizeType(ticketTypeLabel),
          normalizeType(mappedLabelFromId === 'Unknown' ? '' : mappedLabelFromId),
        ]);

        const matchesByLabel = candidates.has(filterType);
        const matchesById = filterTypeId && normalizeType(ticketTypeRaw) === normalizeType(filterTypeId);
        let isMatch = matchesByLabel || matchesById;
        if (filterType === 'installation') {
          isMatch = isMatch || Array.from(candidates).some((c) => isInstallationMenuType(c));
        }
        return isMatch;
      });
    }

    // Group filter
    if (filters.group && filters.group.trim()) {
      const g = filters.group.toString().trim().toLowerCase();
      filtered = filtered.filter((t) => (t.group || '').toString().trim().toLowerCase() === g);
    }

    // Priority filter
    if (filters.priority && filters.priority.trim() && filters.priority !== 'all') {
      const p = filters.priority.toString().trim().toLowerCase();
      filtered = filtered.filter((t) => (t.priority || '').toString().trim().toLowerCase() === p);
    }

    // Text search
    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      // Normalize phone for cross-format matching (0712... / 254712... / +254712...)
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

    // Assigned-to filter (from sidebar)
    if (filters.assignedTo && filters.assignedTo.trim()) {
      if (filters.assignedTo === 'unassigned') {
        filtered = filtered.filter((t) => isTicketUnassigned(t));
      } else {
        const q = filters.assignedTo.toString().trim().toLowerCase();
        filtered = filtered.filter((t) => (t.assignedTo || '').toString().toLowerCase().includes(q));
      }
    }

    // Date filter
    if (filters.dateFrom || filters.dateTo) {
      filtered = filtered.filter((t) => {
        const ticketDate = (t.created_at || t.createdAt || '').toString().split('T')[0].split(' ')[0];
        if (!ticketDate) return true;
        if (filters.dateFrom && ticketDate < filters.dateFrom) return false;
        if (filters.dateTo && ticketDate > filters.dateTo) return false;
        return true;
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
    setPagination((prev) => {
      const page = isFirstApply.current ? savedPageRef.current : 1;
      isFirstApply.current = false;
      return { ...prev, totalItems: filtered.length, currentPage: page };
    });
  };

  const hasActiveListFilters = () => {
    if ((filters.search || '').trim()) return true;
    if (filters.status && filters.status !== 'all') return true;
    if ((filters.type || '').trim()) return true;
    if ((filters.group || '').trim()) return true;
    if ((filters.priority || '').trim() && filters.priority !== 'all') return true;
    if ((filters.assignedTo || '').trim()) return true;
    if (filters.quickAccess && filters.quickAccess !== 'all') return true;
    if (filters.dateRange && filters.dateRange !== 'all') return true;
    if (filters.dateFrom || filters.dateTo) return true;
    return false;
  };

  const clearListFilters = () => {
    setFilters({ ...defaultListFilters });
  };

  useEffect(() => {
    applyFilters();
  }, [data, filters, sort]);

  const getPaginatedData = () => {
    const start = (pagination.currentPage - 1) * pagination.itemsPerPage;
    const end = start + pagination.itemsPerPage;
    return filteredData.slice(start, end);
  };

  const totalPages = Math.ceil(pagination.totalItems / pagination.itemsPerPage);
  
  // Selection helpers
  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedTickets(getPaginatedData().map(ticket => ticket.id));
    } else {
      setSelectedTickets([]);
    }
  };
  
  const handleSelectTicket = (ticketId, checked) => {
    if (checked) {
      setSelectedTickets(prev => [...prev, ticketId]);
    } else {
      setSelectedTickets(prev => prev.filter(id => id !== ticketId));
    }
  };
  
  // Bulk actions
  const handleBulkAction = (action) => {
    if (selectedTickets.length === 0) {
      alert('Please select tickets first');
      return;
    }
    
    switch (action) {
      case 'close':
        handleBulkCloseTickets();
        break;
      case 'archive':
        handleBulkArchiveTickets();
        break;
      case 'change':
        handleBulkChangeTickets();
        break;
      case 'labels':
        handleBulkLabelsTickets();
        break;
      case 'add_watchers':
        handleBulkAddWatchers();
        break;
      case 'remove_watchers':
        handleBulkRemoveWatchers();
        break;
      default:
        console.log('Unknown bulk action:', action);
    }
  };

  const handleBulkCloseTickets = () => {
    if (window.confirm(`Are you sure you want to close ${selectedTickets.length} ticket(s)?`)) {
      // Update tickets to closed status
      const updatedData = data.map(ticket => 
        selectedTickets.includes(ticket.id) 
          ? { ...ticket, status: 'closed' }
          : ticket
      );
      setData(updatedData);
      setSelectedTickets([]);
      alert(`Successfully closed ${selectedTickets.length} ticket(s)`);
    }
  };

  const handleBulkArchiveTickets = async () => {
    if (window.confirm(`Are you sure you want to archive ${selectedTickets.length} ticket(s)?`)) {
      try {
        setLoading(true);
        
        // Import TicketsAPI dynamically
        const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
        
        // Archive each selected ticket
        const archivePromises = selectedTickets.map(ticketId => 
          TicketsAPI.archive(ticketId, 'Bulk archive action')
        );
        
        await Promise.all(archivePromises);
        
        if (!mountedRef.current) return;

        // Remove tickets from current list (they're now in archive)
        const updatedData = data.filter(ticket => !selectedTickets.includes(ticket.id));
        setData(updatedData);
        setFilteredData(prev => prev.filter(ticket => !selectedTickets.includes(ticket.id)));
        setSelectedTickets([]);
        
        alert(`Successfully archived ${selectedTickets.length} ticket(s). They can now be found in the Archive section.`);
      } catch (error) {
        console.error('Error archiving tickets:', error);
        alert('Error archiving some tickets. Please try again.');
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    }
  };

  const handleBulkChangeTickets = () => {
    const newStatus = prompt('Enter new status (open/pending/solved/closed):');
    if (newStatus && ['open', 'pending', 'solved', 'closed'].includes(newStatus.toLowerCase())) {
      const updatedData = data.map(ticket => 
        selectedTickets.includes(ticket.id) 
          ? { ...ticket, status: newStatus.toLowerCase() }
          : ticket
      );
      setData(updatedData);
      setSelectedTickets([]);
      alert(`Successfully changed status of ${selectedTickets.length} ticket(s) to ${newStatus}`);
    } else if (newStatus) {
      alert('Invalid status. Please use: open, pending, solved, or closed');
    }
  };

  const handleBulkLabelsTickets = () => {
    const label = prompt('Enter label to add:');
    if (label) {
      // Add label logic here
      alert(`Successfully added label "${label}" to ${selectedTickets.length} ticket(s)`);
      setSelectedTickets([]);
    }
  };

  const handleBulkAddWatchers = () => {
    const watcher = prompt('Enter email of user to add as watcher:');
    if (watcher) {
      // Add watcher logic here
      alert(`Successfully added ${watcher} as watcher to ${selectedTickets.length} ticket(s)`);
      setSelectedTickets([]);
    }
  };

  const handleBulkRemoveWatchers = () => {
    const watcher = prompt('Enter email of user to remove as watcher:');
    if (watcher) {
      // Remove watcher logic here
      alert(`Successfully removed ${watcher} from ${selectedTickets.length} ticket(s)`);
      setSelectedTickets([]);
    }
  };

  // Individual ticket actions
  const handleViewTicket = (ticket) => {
    // Pass normalized fields so view can render without gaps
    const mapped = {
      id: ticket.id,
      number: ticket.number,
      subject: ticket.subject,
      status: ticket.status,
      customer: ticket.customer, // object {name, email}
      customer_name: ticket.customer?.name || ticket.customer_name,
      customer_email: ticket.customer?.email || ticket.customer_email,
      email: ticket.customer?.email,
      assignedTo: ticket.assignedTo || ticket.assigned_to,
      assigned_to: ticket.assigned_to || ticket.assignedTo,
      group: ticket.group,
      type: ticket.type,
      typeLabel: ticket.typeLabel || ticket.type,
      priority: ticket.priority,
      created_at: ticket.created_at,
      updated_at: ticket.updated_at,
      description: ticket.description,
      address: ticket.address,
      watched_by: ticket.watched_by || ticket.watchedBy,
    };
    navigate(`/admin/tickets/view/${ticket.id}`, {
      state: { ticket: mapped },
    });
  };

  const handleWatchTicket = (ticketId) => {
    const ticket = data.find(t => t.id === ticketId);
    const isCurrentlyWatching = ticket.watching === 'Yes';
    const updatedData = data.map(t => 
      t.id === ticketId 
        ? { ...t, watching: isCurrentlyWatching ? 'No' : 'Yes' }
        : t
    );
    setData(updatedData);
    
    // Show toast notification
    setToastConfig({
      show: true,
      message: `You are ${isCurrentlyWatching ? 'no longer' : 'now'} watching ticket #${ticket.number}`,
      type: isCurrentlyWatching ? 'info' : 'success',
      icon: isCurrentlyWatching ? 'eye-off' : 'eye-fill'
    });
    
    // Auto-hide toast after 3 seconds
    setTimeout(() => {
      setToastConfig(prev => ({ ...prev, show: false }));
    }, 3000);
  };

  const handleDeleteTicket = async (ticketId) => {
    const ticket = data.find(t => t.id === ticketId);
    if (window.confirm(`Are you sure you want to delete ticket #${ticket.number}?`)) {
      try {
        // Call the API to delete the ticket from the database
        const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
        await TicketsAPI.delete(ticketId);
        
        // Remove from local state after successful deletion
        const updatedData = data.filter(t => t.id !== ticketId);
        setData(updatedData);
        setFilteredData(prevFiltered => prevFiltered.filter(t => t.id !== ticketId));
        
        // Show toast notification
        setToastConfig({
          show: true,
          message: `Successfully deleted ticket #${ticket.number}`,
          type: 'success',
          icon: 'check-circle'
        });
        
        // Auto-hide toast after 3 seconds
        setTimeout(() => {
          setToastConfig(prev => ({ ...prev, show: false }));
        }, 3000);
      } catch (error) {
        console.error('Error deleting ticket:', error);
        // Show error toast notification
        setToastConfig({
          show: true,
          message: `Failed to delete ticket #${ticket.number}. Please try again.`,
          type: 'error',
          icon: 'alert-circle'
        });
        
        // Auto-hide toast after 3 seconds
        setTimeout(() => {
          setToastConfig(prev => ({ ...prev, show: false }));
        }, 3000);
      }
    }
  };

  // Priority/Status/Type update handlers
  const handleUpdatePriority = (ticketId, newPriority) => {
    const updatedData = data.map(ticket => 
      ticket.id === ticketId 
        ? { ...ticket, priority: newPriority }
        : ticket
    );
    setData(updatedData);
    const ticket = data.find(t => t.id === ticketId);
    alert(`Updated ticket #${ticket.number} priority to ${newPriority}`);
  };

  const handleUpdateStatus = (ticketId, newStatus) => {
    const updatedData = data.map(ticket => 
      ticket.id === ticketId 
        ? { ...ticket, status: newStatus }
        : ticket
    );
    setData(updatedData);
    const ticket = data.find(t => t.id === ticketId);
    alert(`Updated ticket #${ticket.number} status to ${statusLabels[newStatus] || newStatus}`);
  };

  const handleUpdateType = (ticketId, newType) => {
    const updatedData = data.map(ticket => 
      ticket.id === ticketId 
        ? { ...ticket, type: newType }
        : ticket
    );
    setData(updatedData);
    const ticket = data.find(t => t.id === ticketId);
    alert(`Updated ticket #${ticket.number} type to ${newType}`);
  };

  // Table control actions
  // Pull-to-refresh handlers
  const handleTouchStart = (e) => {
    if (window.scrollY === 0) {
      setTouchStart(e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e) => {
    if (touchStart) {
      setTouchEnd(e.touches[0].clientY);
      const distance = e.touches[0].clientY - touchStart;
      if (distance > 0 && distance < 100) {
        setPullDistance(distance);
      }
    }
  };

  const handleTouchEnd = () => {
    if (pullDistance > 70) {
      handleRefresh();
    }
    setPullDistance(0);
    setTouchStart(0);
    setTouchEnd(0);
  };

  const handleRefresh = async () => {
    if (!mountedRef.current) return;
    const gen = ++loadGenRef.current;
    setRefreshing(true);
    try {
      const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
      const { setCachedTickets, getCachedLastModified, getCachedTickets } = await import('../../helpers/ticketCache');
      const lastMod = getCachedLastModified('active');

      const [activeResult, archivedResp] = await Promise.allSettled([
        TicketsAPI.getAllSlim({ per_page: 0 }, lastMod),
        TicketsAPI.getArchived({ per_page: 0 })
      ]);

      if (!mountedRef.current || gen !== loadGenRef.current) return;

      let activeTickets;
      if (activeResult.status === 'fulfilled' && activeResult.value.notModified) {
        activeTickets = getCachedTickets('active')?.tickets || [];
      } else if (activeResult.status === 'fulfilled') {
        const payload = activeResult.value.data;
        activeTickets = Array.isArray(payload?.data)
          ? payload.data
          : (Array.isArray(payload) ? payload : []);
        setCachedTickets(activeTickets, 'active', activeResult.value.lastModified);
      } else {
        activeTickets = getCachedTickets('active')?.tickets || [];
      }

      let archivedTickets = getCachedTickets('archived')?.tickets || [];
      if (archivedResp.status === 'fulfilled') {
        const archPayload = archivedResp.value?.data;
        const freshArchived = Array.isArray(archPayload?.data)
          ? archPayload.data
          : (Array.isArray(archPayload) ? archPayload : null);
        if (freshArchived) {
          archivedTickets = freshArchived;
          if (archivedTickets.length > 0) {
            setCachedTickets(archivedTickets, 'archived');
          }
        }
      }

      const archivedTagged = archivedTickets.map(t => ({ ...t, _archived: true }));
      let tickets = [...activeTickets, ...archivedTagged];

      // Normalize names
      tickets = tickets.map(t => {
        const formattedName = formatAssignedToName(t.assignedTo);
        return {
          ...t,
          assignedTo: formattedName === 'Unassigned' ? t.assignedTo : formattedName,
          assignedToDisplay: formattedName
        };
      });
      
      if (isTechnician) {
        tickets = tickets.filter(isTicketAssignedToCurrentTechnician);
        const hiddenStatuses = ['resolved', 'installation_complete', 'installation complete'];
        tickets = tickets.filter((ticket) => {
          const status = (ticket.status || '').toLowerCase().replace(/[\s-]+/g, '_');
          return !hiddenStatuses.includes(status);
        });
      }
      
      if (!mountedRef.current || gen !== loadGenRef.current) return;
      setData(tickets);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Error refreshing tickets:', error);
    } finally {
      if (mountedRef.current && gen === loadGenRef.current) {
        setRefreshing(false);
      }
    }
  };

  const handleToggleColorRows = () => {
    // Toggle colored rows functionality
    alert('Color coding toggled for ticket rows');
  };

  const handleShowHideColumns = () => {
    // Render a modal or popover for column visibility
    const columnOptions = [
      { key: 'checkbox', label: 'Checkbox', disabled: true },
      { key: 'number', label: 'Ticket #' },
      { key: 'subject', label: 'Subject' },
      { key: 'customer', label: 'Customer' },
      { key: 'priority', label: 'Priority' },
      { key: 'status', label: 'Status' },
      { key: 'group', label: 'Group' },
      { key: 'type', label: 'Type' },
      { key: 'assignedTo', label: 'Assigned To' },
      { key: 'watching', label: 'Watching' },
      { key: 'actions', label: 'Actions', disabled: true }
    ];
    
    const columnHtml = columnOptions
      .map(col => 
        `<label style="display: block; margin: 8px 0; cursor: pointer;">
          <input type="checkbox" id="col_${col.key}" ${visibleColumns[col.key] ? 'checked' : ''} ${col.disabled ? 'disabled' : ''} style="margin-right: 8px;">
          ${col.label}
        </label>`
      )
      .join('');
    
    // For now, show a simple confirmation dialog with instructions
    alert('Column Visibility:\n\nChecked columns will be displayed:\n' + 
      Object.entries(visibleColumns)
        .filter(([_, visible]) => visible)
        .map(([key]) => key)
        .join(', ') +
      '\n\nTo customize columns, use the checkboxes in the modal.');
  };

  const handleExportData = () => {
    // Export functionality
    const exportData = getPaginatedData().map(ticket => ({
      'Ticket #': ticket.number,
      'Subject': ticket.subject,
      'Customer': getAssignedToName((ticket.customer && ticket.customer.name) || ticket.customer_name || 'N/A'),
      'Priority': ticket.priority,
      'Status': statusLabels[ticket.status] || ticket.status,
      'Group': ticket.group,
      'Type': ticket.typeLabel || ticket.type,
      'Assigned To': getAssignedToName(ticket.assigned_to || ticket.assignedTo),
      'Updated': typeof ticket.updated_at === 'string' ? ticket.updated_at : new Date(ticket.updated_at).toLocaleDateString()
    }));
    
    // Create CSV content
    const headers = Object.keys(exportData[0]);
    const csvContent = [
      headers.join(','),
      ...exportData.map(row => headers.map(header => `"${row[header]}"`).join(','))
    ].join('\n');
    
    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tickets-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    alert('Tickets data exported successfully!');
  };

  const executeBulkAction = () => {
    // TODO: Implement actual bulk action logic
    console.log(`Executing ${bulkAction} on tickets:`, selectedTickets);
    setSelectedTickets([]);
    setShowBulkActions(false);
    setBulkAction('');
  };

  const getPriorityBadge = (priority) => {
    const badges = {
      'urgent': 'bg-danger',    // #eb5757
      'high': 'bg-warning',     // #ffaf14
      'medium': 'bg-info',      // #63b4ff
      'low': 'bg-success'       // #29cc97
    };
    return badges[priority] || 'bg-secondary';
  };

  const getStatusBadge = (status) => {
    const badges = {
      // Core
      new: 'bg-info',
      open: 'bg-success',
      pending: 'bg-warning',
      solved: 'bg-success',
      closed: 'bg-secondary',
      // Extended from popover
      resolved: 'bg-default text-white',
      'installation complete': 'bg-success',
      waiting_customer: 'bg-warning',
      waiting_agent: 'bg-info',
      waiting_power: 'bg-warning',
      power_available: 'bg-success',
      customer_unreachable: 'bg-warning',
      booked_later: 'bg-info',
      out_of_range: 'bg-warning',
      installed_elsewhere: 'bg-default text-white',
      long_distance: 'bg-info',
      pole_needed: 'bg-warning'
    };
    return badges[status] || 'bg-secondary';
  };

  // Helper function to extract name from assignedTo field
  // Handles formats like: "John Doe (email@example.com)", "email@example.com", or "John Doe"
  const getAssignedToName = (assignedTo) => {
    if (!assignedTo || assignedTo === '0' || assignedTo === '-') return 'Unassigned';
    
    const assignedStr = assignedTo.toString().trim();
    // If JSON array, parse and return friendly text
    if (assignedStr.startsWith('[')) {
      try {
        const arr = JSON.parse(assignedStr);
        if (Array.isArray(arr) && arr.length > 0) {
          return arr.length === 1 ? formatSingleName(arr[0]) : `${arr.length} assigned`;
        }
      } catch (e) {
        // ignore parse errors and fall back
      }
    }
    
    // If it contains parentheses, extract the name part before them (e.g., "John Doe (john@email.com)" -> "John Doe")
    const match = assignedStr.match(/^(.+?)\s*\(/);
    if (match) {
      return match[1].trim();
    }
    
    // If it looks like an email (contains @), extract the part before @ and format it
    // This handles legacy data that might still have emails
    if (assignedStr.includes('@')) {
      const emailName = assignedStr.split('@')[0];
      // Convert email format like "john.doe" to "John Doe"
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

  const getTypeBadge = (type) => {
    const badges = {
      'question': 'bg-info',
      'problem': 'bg-danger',
      'incident': 'bg-warning',
      'task': 'bg-success',
      'request': 'bg-primary',
      'bug': 'bg-danger',
      'feature': 'bg-info'
    };
    return badges[type] || 'bg-secondary';
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
    power_available: 'Power available',
    customer_unreachable: 'Customer unreachable',
    booked_later: 'Booked to a further date',
    out_of_range: 'Customer out of range',
    installed_elsewhere: 'Already installed by another provider',
    long_distance: 'Long distance',
    pole_needed: 'Pole needed'
  };

  const POPOVER_WIDTH = 280;
  const POPOVER_CONTENT_MAX_HEIGHT = 280;
  const popoverShellStyle = (top, left) => ({
    position: 'fixed',
    top,
    left,
    display: 'block',
    width: POPOVER_WIDTH,
    zIndex: 1050,
    backgroundColor: '#fff',
    border: '1px solid #e5e9f2',
    borderRadius: '6px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    padding: 0,
    overflow: 'visible',
  });
  const popoverListStyle = { listStyle: 'none', margin: 0, padding: 0, display: 'block', width: '100%' };
  const popoverItemStyle = { display: 'block', float: 'none', clear: 'both', padding: '8px 12px', cursor: 'pointer', lineHeight: 1.4, boxSizing: 'border-box', width: '100%' };
  const popoverBadgeStyle = { fontWeight: 600, display: 'inline-flex', float: 'none', position: 'relative', whiteSpace: 'nowrap', margin: 0, cursor: 'pointer' };

  // Priority Popover state
  const [priorityPopover, setPriorityPopover] = useState({
    open: false,
    ticketId: null,
    top: 0,
    left: 0,
    selected: 'low',
    arrowLeft: 16
  });

  // Status Popover state
  const [statusPopover, setStatusPopover] = useState({
    open: false,
    ticketId: null,
    top: 0,
    left: 0,
    selected: 'new',
    arrowLeft: 16
  });

  // Pre-status-change reminder when moving away from "new"
  const [listReminder, setListReminder] = useState({ open: false, ticketId: null, pendingStatus: null, step: 'ask' });

  // Type Popover state
  const [typePopover, setTypePopover] = useState({
    open: false,
    ticketId: null,
    top: 0,
    left: 0,
    selected: 'support',
    arrowLeft: 16
  });

  // Group Popover state
  const [groupPopover, setGroupPopover] = useState({
    open: false,
    ticketId: null,
    top: 0,
    left: 0,
    selected: 'Any',
    arrowLeft: 16
  });

  // Assigned To Popover state
  const [assignedToPopover, setAssignedToPopover] = useState({
    open: false,
    ticketId: null,
    top: 0,
    left: 0,
    selected: '0',
    arrowLeft: 16
  });

  // State for all available technicians and engineers
  const [allTechnicians, setAllTechnicians] = useState([]);

  // Close all popovers
  const closeAllPopovers = () => {
    setPriorityPopover((prev) => ({ ...prev, open: false }));
    setStatusPopover((prev) => ({ ...prev, open: false }));
    setTypePopover((prev) => ({ ...prev, open: false }));
    setGroupPopover((prev) => ({ ...prev, open: false }));
    setAssignedToPopover((prev) => ({ ...prev, open: false }));
  };

  const openPriorityPopover = (ticket, event) => {
    // Close all other popovers first
    closeAllPopovers();
    
    const rect = event.currentTarget.getBoundingClientRect();
    const selected = (ticket.priority || 'low').toLowerCase();
    const popoverWidth = POPOVER_WIDTH;

    // Use fixed positioning relative to viewport, center under the badge
    const desiredLeft = rect.left + rect.width / 2 - popoverWidth / 2;
    const left = Math.max(8, Math.min(window.innerWidth - popoverWidth - 8, desiredLeft));
    const top = rect.bottom + 10; // margin-top: 10px

    // Arrow points at badge center; clamp within popover bounds
    const anchorCenter = rect.left + rect.width / 2;
    const rawArrowLeft = anchorCenter - left;
    const arrowLeft = Math.max(12, Math.min(popoverWidth - 24, rawArrowLeft));
    setPriorityPopover({
      open: true,
      ticketId: ticket.id,
      top,
      left,
      selected,
      arrowLeft
    });
  };

  const openStatusPopover = (ticket, event) => {
    // Close all other popovers first
    closeAllPopovers();
    
    const rect = event.currentTarget.getBoundingClientRect();
    const selected = (ticket.status || 'new').toLowerCase();
    const popoverWidth = POPOVER_WIDTH;

    const desiredLeft = rect.left + rect.width / 2 - popoverWidth / 2;
    const left = Math.max(8, Math.min(window.innerWidth - popoverWidth - 8, desiredLeft));
    const top = rect.bottom + 10;

    const anchorCenter = rect.left + rect.width / 2;
    const rawArrowLeft = anchorCenter - left;
    const arrowLeft = Math.max(12, Math.min(popoverWidth - 24, rawArrowLeft));

    setStatusPopover({
      open: true,
      ticketId: ticket.id,
      top,
      left,
      selected,
      arrowLeft
    });
  };

  const openTypePopover = (ticket, event) => {
    // Technicians are not allowed to change ticket type
    if (isTechnician) return;
    // Close all other popovers first
    closeAllPopovers();
    
    const rect = event.currentTarget.getBoundingClientRect();
    const selected = (ticket.typeLabel || ticket.type || 'support').toLowerCase();
    const popoverWidth = POPOVER_WIDTH;

    const desiredLeft = rect.left + rect.width / 2 - popoverWidth / 2;
    const left = Math.max(8, Math.min(window.innerWidth - popoverWidth - 8, desiredLeft));
    const top = rect.bottom + 10;

    const anchorCenter = rect.left + rect.width / 2;
    const rawArrowLeft = anchorCenter - left;
    const arrowLeft = Math.max(12, Math.min(popoverWidth - 24, rawArrowLeft));

    setTypePopover({
      open: true,
      ticketId: ticket.id,
      top,
      left,
      selected,
      arrowLeft
    });
  };

  const closeStatusPopover = () => {
    setStatusPopover((prev) => ({ ...prev, open: false }));
  };

  const doListStatusChange = async (ticketId, value) => {
    try {
      const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
      await TicketsAPI.update(ticketId, { status: value, updated_at: new Date().toISOString() });
      setData((prev) => prev.map((t) => t.id === ticketId ? { ...t, status: value, updated_at: new Date().toISOString() } : t));
      setFilteredData((prev) => prev.map((t) => t.id === ticketId ? { ...t, status: value, updated_at: new Date().toISOString() } : t));
    } catch (e) {
      console.error('Failed to update status', e);
    }
  };

  const selectStatus = async (value) => {
    const ticketId = statusPopover.ticketId;
    const currentTicket = (data || []).find((x) => x.id === ticketId);
    const currentStatus = (currentTicket?.status || '').toLowerCase();

    setStatusPopover((prev) => ({ ...prev, open: false }));

    // Show reminder when moving away from "new"
    if (currentStatus === 'new' && value.toLowerCase() !== 'new') {
      setListReminder({ open: true, ticketId, pendingStatus: value, step: 'ask' });
      return;
    }

    await doListStatusChange(ticketId, value);
  };

  const closePriorityPopover = () => {
    setPriorityPopover((prev) => ({ ...prev, open: false }));
  };

  const closeTypePopover = () => {
    setTypePopover((prev) => ({ ...prev, open: false }));
  };

  const selectPriority = async (value) => {
    try {
      const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
      await TicketsAPI.update(priorityPopover.ticketId, { priority: value, updated_at: new Date().toISOString() });
      setData((prev) => prev.map((t) => t.id === priorityPopover.ticketId ? { ...t, priority: value, updated_at: new Date().toISOString() } : t));
      setFilteredData((prev) => prev.map((t) => t.id === priorityPopover.ticketId ? { ...t, priority: value, updated_at: new Date().toISOString() } : t));
    } catch (e) {
      console.error('Failed to update priority', e);
    } finally {
      setPriorityPopover((prev) => ({ ...prev, open: false }));
    }
  };

  const selectType = async (value) => {
    // Technicians are not allowed to change ticket type
    if (isTechnician) return;
    // Confirm permission request for type changes (non-technicians)
    const ticket = (data || []).find((t) => t.id === typePopover.ticketId);
    const oldType = (ticket?.typeLabel || ticket?.type || '').toString();
    const newType = (value || '').toString();
    if (oldType && newType && oldType.toLowerCase() !== newType.toLowerCase()) {
      const ok = window.confirm(`Are you sure you want to change the ticket type?\n\n${oldType} → ${newType}`);
      if (!ok) {
        setTypePopover((prev) => ({ ...prev, open: false }));
        return;
      }
    }
    try {
      const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
      const typeId = getTypeIdByLabel(value);
      await TicketsAPI.update(typePopover.ticketId, { 
        type: value, 
        type_id: typeId,
        typeLabel: value,
        updated_at: new Date().toISOString() 
      });
      // Add audit note for type change
      try {
        if (oldType && newType && oldType.toLowerCase() !== newType.toLowerCase()) {
          const actor = user?.name || user?.email || 'Unknown user';
          await TicketsAPI.addNote(typePopover.ticketId, {
            message: `Ticket type changed: ${oldType} → ${newType} (by ${actor})`,
            isPrivate: true,
            user_id: user?.id,
            user_name: user?.name,
            user_email: user?.email
          });
        }
      } catch (e) {
        // Don't block UI if note fails
        console.warn('Failed to add audit note for type change', e);
      }
      setData((prev) => prev.map((t) => t.id === typePopover.ticketId ? { 
        ...t, 
        type: value, 
        type_id: typeId,
        typeLabel: value,
        updated_at: new Date().toISOString() 
      } : t));
      setFilteredData((prev) => prev.map((t) => t.id === typePopover.ticketId ? { 
        ...t, 
        type: value, 
        type_id: typeId,
        typeLabel: value,
        updated_at: new Date().toISOString() 
      } : t));
    } catch (e) {
      console.error('Failed to update type', e);
    } finally {
      setTypePopover((prev) => ({ ...prev, open: false }));
    }
  };

  const openGroupPopover = (ticket, event) => {
    // Close all other popovers first
    closeAllPopovers();
    
    const rect = event.currentTarget.getBoundingClientRect();
    const selected = ticket.group || 'Any';
    const popoverWidth = POPOVER_WIDTH;

    const desiredLeft = rect.left + rect.width / 2 - popoverWidth / 2;
    const left = Math.max(8, Math.min(window.innerWidth - popoverWidth - 8, desiredLeft));
    const top = rect.bottom + 10;

    const anchorCenter = rect.left + rect.width / 2;
    const rawArrowLeft = anchorCenter - left;
    const arrowLeft = Math.max(12, Math.min(popoverWidth - 24, rawArrowLeft));

    setGroupPopover({
      open: true,
      ticketId: ticket.id,
      top,
      left,
      selected,
      arrowLeft
    });
  };

  const closeGroupPopover = () => {
    setGroupPopover((prev) => ({ ...prev, open: false }));
  };

  const selectGroup = async (value) => {
    try {
      const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
      await TicketsAPI.update(groupPopover.ticketId, { group: value, updated_at: new Date().toISOString() });
      setData((prev) => prev.map((t) => t.id === groupPopover.ticketId ? { ...t, group: value, updated_at: new Date().toISOString() } : t));
      setFilteredData((prev) => prev.map((t) => t.id === groupPopover.ticketId ? { ...t, group: value, updated_at: new Date().toISOString() } : t));
    } catch (e) {
      console.error('Failed to update group', e);
    } finally {
      setGroupPopover((prev) => ({ ...prev, open: false }));
    }
  };

  const openAssignedToPopover = (ticket, event) => {
    // Technicians are not allowed to change ticket assignment
    if (isTechnician) return;
    // Close all other popovers first
    closeAllPopovers();
    
    const rect = event.currentTarget.getBoundingClientRect();
    const selected = ticket.assignedTo || '0';
    const popoverWidth = POPOVER_WIDTH;

    const desiredLeft = rect.left + rect.width / 2 - popoverWidth / 2;
    const left = Math.max(8, Math.min(window.innerWidth - popoverWidth - 8, desiredLeft));
    const top = rect.bottom + 10;

    const anchorCenter = rect.left + rect.width / 2;
    const rawArrowLeft = anchorCenter - left;
    const arrowLeft = Math.max(12, Math.min(popoverWidth - 24, rawArrowLeft));

    setAssignedToPopover({
      open: true,
      ticketId: ticket.id,
      top,
      left,
      selected,
      arrowLeft
    });
  };

  const closeAssignedToPopover = () => {
    setAssignedToPopover((prev) => ({ ...prev, open: false }));
  };

  const selectAssignedTo = async (value) => {
    // Technicians are not allowed to change ticket assignment
    if (isTechnician) return;
    try {
      const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
      await TicketsAPI.update(assignedToPopover.ticketId, { assignedTo: value, updated_at: new Date().toISOString() });
      setData((prev) => prev.map((t) => t.id === assignedToPopover.ticketId ? { ...t, assignedTo: value, updated_at: new Date().toISOString() } : t));
      setFilteredData((prev) => prev.map((t) => t.id === assignedToPopover.ticketId ? { ...t, assignedTo: value, updated_at: new Date().toISOString() } : t));
    } catch (e) {
      console.error('Failed to update assigned to', e);
    } finally {
      setAssignedToPopover((prev) => ({ ...prev, open: false }));
    }
  };

  useEffect(() => {
    // close on escape or click outside for all popovers
    const onKey = (e) => {
      if (e.key === 'Escape') {
        closeAllPopovers();
      }
    };
    const onClick = (e) => {
      const elPriority = document.querySelector('#webuiPopover35');
      const elStatus = document.querySelector('#webuiPopover40');
      const elType = document.querySelector('#webuiPopover45');
      const elGroup = document.querySelector('#webuiPopover50');
      const elAssignedTo = document.querySelector('#webuiPopover55');
      
      const clickedInsidePriority = elPriority && elPriority.contains(e.target);
      const clickedInsideStatus = elStatus && elStatus.contains(e.target);
      const clickedInsideType = elType && elType.contains(e.target);
      const clickedInsideGroup = elGroup && elGroup.contains(e.target);
      const clickedInsideAssignedTo = elAssignedTo && elAssignedTo.contains(e.target);
      
      const clickedInsideAnyPopover = clickedInsidePriority || clickedInsideStatus || clickedInsideType || clickedInsideGroup || clickedInsideAssignedTo;
      
      if (!clickedInsideAnyPopover) {
        closeAllPopovers();
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [priorityPopover.open, statusPopover.open, typePopover.open, groupPopover.open, assignedToPopover.open]);

  return (
    <React.Fragment>
      <Head title="Tickets List" />
      <Content>
        <BlockHead size="sm" className="tickets-list-header">
          <BlockBetween className="tickets-list-header-between" style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            gap: '0',
            flexWrap: 'nowrap',
            width: '100%',
            marginBottom: '10px',
            paddingBottom: '10px',
            borderBottom: '1px solid #e5e9f2'
          }}>
            <BlockHeadContent className="tickets-list-header-title" style={{
              ...headerTitleContainerStyle,
              flex: '0 0 auto',
              marginRight: 'auto',
              paddingRight: '0'
            }}>
              <BlockTitle tag="h3" page style={{ marginBottom: 0 }}>
                Tickets ({pagination.totalItems})
              </BlockTitle>
              </BlockHeadContent>
            <BlockHeadContent className="tickets-list-header-filters" style={{
              ...headerToolsContainerStyle,
              flex: '0 0 auto',
              marginLeft: 'auto',
              paddingLeft: '0',
              minWidth: 'fit-content',
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center'
            }}>
              {isMobile ? (
                <div 
                  className="mobile-filters" 
                  style={{ 
                    width: '100%',
                    position: 'sticky',
                    top: '60px',
                    zIndex: 10,
                    backgroundColor: '#fff',
                    padding: '12px 16px',
                    marginLeft: '-20px',
                    marginRight: '-20px',
                    paddingLeft: '20px',
                    paddingRight: '20px',
                    borderBottom: '1px solid #e5e9f2',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                  }}
                >
                  {/* Row 1: Quick access */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '14px', color: '#526484', minWidth: '80px' }}>Quick access</span>
                    <select
                      className="form-control form-control-sm"
                      style={{ flex: 1 }}
                      value={getQuickAccessSelectValue()}
                      onChange={(e) => handleQuickAccessChange(e.target.value)}
                    >
                      <option value="me">Assigned to me</option>
                      <option value="watched">My watched tickets</option>
                      <option value="0">Unassigned tickets</option>
                      <option value="-1">All tickets</option>
                      {agentNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                    <span style={{ 
                      backgroundColor: '#6c63ff', 
                      color: 'white', 
                      borderRadius: '50%', 
                      width: '24px', 
                      height: '24px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      fontSize: '12px', 
                      fontWeight: 'bold' 
                    }}>
                      {pagination.totalItems}
                    </span>
                  </div>

                  {/* Row 2: Status, Refresh, Create ticket */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '14px', color: '#526484', minWidth: '50px' }}>Status</span>
                    <select
                      className="form-control form-control-sm"
                      style={{ flex: 1 }}
                      value={filters.status}
                      onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                    >
                      <option value="all">All</option>
                      <option value="new">New</option>
                      <option value="work in progress">Work in progress</option>
                      <option value="pending">Pending</option>
                      <option value="solved">Solved</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                      <option value="installation complete">Installation complete</option>
                      <option value="waiting_customer">Waiting on customer</option>
                      <option value="waiting_agent">Waiting on agent</option>
                      <option value="waiting_power">Waiting on power</option>
                      <option value="power_available">Power available</option>
                      <option value="customer_unreachable">Customer unreachable</option>
                      <option value="booked_later">Booked to a further date</option>
                      <option value="out_of_range">Customer out of range</option>
                      <option value="installed_elsewhere">Already installed by another provider</option>
                      <option value="long_distance">Long distance</option>
                      <option value="pole_needed">Pole needed</option>
                    </select>
                    <Button 
                      className="btn btn-outline-secondary btn-sm" 
                      onClick={handleRefresh} 
                      disabled={refreshing}
                      style={{ padding: '6px 8px', minWidth: '32px' }}
                    >
                      <Icon name="reload" style={{ fontSize: '14px' }} />
                    </Button>
                    <Button 
                      className="btn btn-primary btn-sm" 
                      onClick={() => navigate('/admin/tickets/create')}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      Create ticket
                    </Button>
                  </div>

                  {/* Row 2.5: Date filter */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '14px', color: '#526484', minWidth: '40px' }}>Date</span>
                    <select
                      className="form-control form-control-sm"
                      style={{ flex: 1, minWidth: '120px' }}
                      value={filters.dateRange}
                      onChange={(e) => applyDatePreset(e.target.value)}
                    >
                      <option value="all">All dates</option>
                      <option value="today">Today</option>
                      <option value="yesterday">Yesterday</option>
                      <option value="this_week">This week</option>
                      <option value="last_week">Last week</option>
                      <option value="this_month">This month</option>
                      <option value="last_month">Last month</option>
                      <option value="custom">Date range...</option>
                    </select>
                    {filters.dateRange === 'custom' && (
                      <>
                        <input type="date" value={filters.dateFrom}
                          onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                          className="form-control form-control-sm"
                          style={{ width: '130px' }}
                        />
                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>to</span>
                        <input type="date" value={filters.dateTo}
                          onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                          className="form-control form-control-sm"
                          style={{ width: '130px' }}
                        />
                      </>
                    )}
                  </div>

                  {/* Row 3: View toggles and Filter */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <div style={{ flex: 1 }}></div>
                    <div className="btn-group" style={{ display: 'flex' }}>
                      <Button 
                        className={`btn btn-outline-secondary btn-sm ${currentView === 'table' ? 'active' : ''}`} 
                        onClick={() => setCurrentView('table')}
                        style={{ padding: '6px 12px' }}
                      >
                        <Icon name="list" />
                      </Button>
                      <Button 
                        className={`btn btn-outline-secondary btn-sm ${currentView === 'card' ? 'active' : ''}`} 
                        onClick={() => setCurrentView('card')}
                        style={{ padding: '6px 12px' }}
                      >
                        <Icon name="grid" />
                      </Button>
                    </div>
                    <Button 
                      className={`btn btn-sm ${showAdvancedSearch ? 'btn-primary' : 'btn-outline-secondary'}`} 
                      onClick={() => setShowAdvancedSearch(!showAdvancedSearch)}
                      style={{ position: 'relative' }}
                    >
                      Filter
                      {hasActiveListFilters() && (
                        <span style={{
                          position: 'absolute',
                          top: '-2px',
                          right: '-2px',
                          width: '8px',
                          height: '8px',
                          backgroundColor: '#eb5757',
                          borderRadius: '50%'
                        }}></span>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                /* Desktop layout */
                <div
                  className="filters-nav"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    flexWrap: 'nowrap',
                    justifyContent: 'flex-end',
                    minWidth: 0,
                    marginLeft: 'auto',
                    width: 'auto'
                  }}
                >
                  {/* Quick access */}
                  <div className="filter-input" style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    <label style={{ margin: 0, fontSize: '11px', color: '#526484', flexShrink: 0 }}>Quick access</label>
                    <select
                      id="admin_support_tickets_opened_filter_quick_access"
                      name="quick_access"
                      className="form-control form-control-sm"
                      style={{ width: '118px', flexShrink: 0, fontSize: '12px', height: '30px', padding: '2px 6px' }}
                      value={getQuickAccessSelectValue()}
                      onChange={(e) => handleQuickAccessChange(e.target.value)}
                    >
                      <option value="me">Assigned to me</option>
                      <option value="watched">My watched tickets</option>
                      <option value="0">Unassigned tickets</option>
                      <option value="-1">All tickets</option>
                      {agentNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Status */}
                  <div className="filter-input" style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    <label style={{ margin: 0, fontSize: '11px', color: '#526484', flexShrink: 0 }}>Status</label>
                    <select
                      id="admin_support_tickets_opened_filter_status"
                      name="status_id"
                      className="form-control form-control-sm"
                      style={{ width: '112px', flexShrink: 0, fontSize: '12px', height: '30px', padding: '2px 6px' }}
                      value={filters.status}
                      onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                    >
                      <option value="all">All</option>
                      <option value="new">New</option>
                      <option value="work in progress">Work in progress</option>
                      <option value="pending">Pending</option>
                      <option value="solved">Solved</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                      <option value="installation complete">Installation complete</option>
                      <option value="waiting_customer">Waiting on customer</option>
                      <option value="waiting_agent">Waiting on agent</option>
                      <option value="waiting_power">Waiting on power</option>
                      <option value="power_available">Power available</option>
                      <option value="customer_unreachable">Customer unreachable</option>
                      <option value="booked_later">Booked to a further date</option>
                      <option value="out_of_range">Out of range</option>
                      <option value="installed_elsewhere">Already installed</option>
                      <option value="long_distance">Long distance</option>
                      <option value="pole_needed">Pole needed</option>
                    </select>
                  </div>

                  {/* Date filter */}
                  <div className="filter-input" style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    <label style={{ margin: 0, fontSize: '11px', color: '#526484', flexShrink: 0 }}>Date</label>
                    <select
                      className="form-control form-control-sm"
                      style={{ width: '108px', flexShrink: 0, fontSize: '12px', height: '30px', padding: '2px 6px' }}
                      value={filters.dateRange}
                      onChange={(e) => applyDatePreset(e.target.value)}
                    >
                      <option value="all">All dates</option>
                      <option value="today">Today</option>
                      <option value="yesterday">Yesterday</option>
                      <option value="this_week">This week</option>
                      <option value="last_week">Last week</option>
                      <option value="this_month">This month</option>
                      <option value="last_month">Last month</option>
                      <option value="custom">Date range...</option>
                    </select>
                    {filters.dateRange === 'custom' && (
                      <>
                        <input type="date" value={filters.dateFrom}
                          onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                          className="form-control form-control-sm"
                          style={{ width: '115px', flexShrink: 0, fontSize: '12px', height: '30px', padding: '2px 6px' }}
                        />
                        <span style={{ fontSize: '10px', color: '#94a3b8' }}>to</span>
                        <input type="date" value={filters.dateTo}
                          onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                          className="form-control form-control-sm"
                          style={{ width: '115px', flexShrink: 0, fontSize: '12px', height: '30px', padding: '2px 6px' }}
                        />
                      </>
                    )}
                  </div>

                  {/* Refresh */}
                  <button
                    title="Refresh"
                    onClick={handleRefresh}
                    disabled={refreshing}
                    style={{ flexShrink: 0, height: '30px', width: '30px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #dbdfea', borderRadius: '4px', background: '#fff', cursor: 'pointer', color: '#526484' }}
                  >
                    <Icon name="reload" style={{ fontSize: '14px' }} />
                  </button>

                  {/* Create ticket */}
                  <button
                    onClick={() => navigate('/admin/tickets/create')}
                    style={{ flexShrink: 0, height: '30px', padding: '0 10px', fontSize: '12px', fontWeight: '500', border: '1px solid #357bf2', borderRadius: '4px', background: '#fff', color: '#357bf2', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    Create ticket
                  </button>

                  {/* View toggle */}
                  <div style={{ display: 'flex', flexShrink: 0, border: '1px solid #dbdfea', borderRadius: '4px', overflow: 'hidden' }}>
                    <button title="Table View" onClick={() => setCurrentView('table')} style={{ height: '30px', width: '30px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRight: '1px solid #dbdfea', background: currentView === 'table' ? '#e5e9f2' : '#fff', color: '#526484', cursor: 'pointer' }}>
                      <Icon name="table-view" style={{ fontSize: '14px' }} />
                    </button>
                    <button title="Card View" onClick={() => setCurrentView('card')} style={{ height: '30px', width: '30px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: currentView === 'card' ? '#e5e9f2' : '#fff', color: '#526484', cursor: 'pointer' }}>
                      <Icon name="row-view" style={{ fontSize: '14px' }} />
                    </button>
                  </div>

                  {/* Advanced search toggle */}
                  <button
                    onClick={() => setShowAdvancedSearch(!showAdvancedSearch)}
                    style={{ flexShrink: 0, height: '30px', padding: '0 10px', fontSize: '12px', fontWeight: '500', border: '1px solid #dbdfea', borderRadius: '4px', background: showAdvancedSearch ? '#357bf2' : '#fff', color: showAdvancedSearch ? '#fff' : '#526484', cursor: 'pointer', position: 'relative', whiteSpace: 'nowrap' }}
                  >
                    Filter
                    {hasActiveListFilters() && (
                      <span style={{ position: 'absolute', top: '-3px', right: '-3px', width: '7px', height: '7px', backgroundColor: '#eb5757', borderRadius: '50%' }}></span>
                    )}
                  </button>
                </div>
              )}
            </BlockHeadContent>
          </BlockBetween>
        </BlockHead>

        <Block>
          <div style={{ display: 'flex', position: 'relative' }}>
            {/* Main Content Area */}
            <div style={{ 
              flex: 1, 
              transition: 'margin-right 0.3s ease',
              marginRight: showAdvancedSearch && !isMobile ? '350px' : '0'
            }}>
              <PreviewCard>
            {/* Enhanced Search and Filter Bar */}
            <div style={{
              display: 'none'
            }}>
            </div>

              {/* Enhanced Table */}
            <div className="card-inner" style={{
              padding: !isMobile && currentView === 'table' ? '0' : undefined
            }}>
              {/* Mobile List View - Compact table-like rows */}
              {isMobile && currentView === 'table' ? (
                <div style={{ backgroundColor: '#fff' }}>
                  {getPaginatedData().map((ticket, index) => (
                    <div 
                      key={ticket.id}
                      style={{
                        borderBottom: index < getPaginatedData().length - 1 ? '1px solid #e5e9f2' : 'none',
                        padding: '12px 16px',
                        backgroundColor: selectedTickets.includes(ticket.id) ? '#f0f8ff' : '#fff',
                        transition: 'background-color 0.15s'
                      }}
                    >
                      {/* Main Row - Always Visible */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                        {/* Checkbox */}
                        <input 
                          type="checkbox" 
                          checked={selectedTickets.includes(ticket.id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleSelectTicket(ticket.id, e.target.checked);
                          }}
                          style={{
                            marginTop: '2px',
                            cursor: 'pointer',
                            accentColor: '#357bf2',
                            width: '16px',
                            height: '16px',
                            flexShrink: 0
                          }}
                        />
                        
                        {/* Main Content */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Row 1: Ticket # and Badges */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span 
                              onClick={() => handleViewTicket(ticket)}
                              style={{ 
                                fontWeight: '600', 
                                color: '#357bf2', 
                                fontSize: '13px',
                                cursor: 'pointer'
                              }}
                            >
                              #{ticket.number}
                            </span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openPriorityPopover(ticket, e);
                                }}
                                style={{ cursor: 'pointer' }}
                                title="Click to change priority"
                              >
                                <Badge className={getPriorityBadge(ticket.priority)} style={{
                                  textTransform: 'capitalize',
                                  fontSize: '9px',
                                  padding: '2px 6px',
                                  fontWeight: '600'
                                }}>
                                  {ticket.priority.charAt(0).toUpperCase()}
                                </Badge>
                              </span>
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openStatusPopover(ticket, e);
                                }}
                                style={{ cursor: 'pointer' }}
                                title="Click to change status"
                              >
                                <Badge className={getStatusBadge(ticket.status)} style={{
                                  fontSize: '9px',
                                  padding: '2px 6px',
                                  fontWeight: '500'
                                }}>
                                  {(statusLabels[ticket.status] || ticket.status).substring(0, 4)}
                                </Badge>
                              </span>
                            </div>
                          </div>
                          
                          {/* Row 2: Subject with Phone */}
                          <div style={{ marginBottom: '8px' }}>
                            <div 
                              onClick={() => handleViewTicket(ticket)}
                              style={{ 
                                fontSize: '13px', 
                                fontWeight: '500', 
                                color: '#374151',
                                marginBottom: '4px',
                                lineHeight: '1.3',
                                cursor: 'pointer',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                wordBreak: 'break-word'
                              }}
                            >
                              {ticket.subject}
                            </div>
                            {getCustomerProperty(ticket, 'phone') && (
                              <a
                                href={`tel:${getCustomerProperty(ticket, 'phone')}`}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  fontSize: '11px',
                                  color: '#28a745',
                                  textDecoration: 'none',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontWeight: '600'
                                }}
                                title="Click to call"
                              >
                                <Icon name="call" style={{fontSize: '11px'}} />
                                {getCustomerProperty(ticket, 'phone')}
                              </a>
                            )}
                          </div>
                          
                          {/* Row 3: Meta Info in compact grid */}
                          <div style={{ 
                            display: 'grid', 
                            gridTemplateColumns: 'repeat(2, 1fr)',
                            gap: '6px 12px',
                            fontSize: '11px',
                            color: '#8094ae',
                            marginBottom: '6px'
                          }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Icon name="user" style={{ fontSize: '10px', flexShrink: 0 }} />
                                <span style={{ fontSize: '11px', fontWeight: '500', color: '#374151', lineHeight: '1.3', wordBreak: 'break-word' }}>
                                  {getAssignedToName(getCustomerProperty(ticket, 'name'))}
                                </span>
                              </div>
                              {getCustomerProperty(ticket, 'phone') && (
                                <div style={{ fontSize: '10px', color: '#8094ae', paddingLeft: '14px', wordBreak: 'break-all' }}>
                                  {getCustomerProperty(ticket, 'phone')}
                                </div>
                              )}
                            </div>
                            <div 
                              onClick={isTechnician ? undefined : (e) => {
                                e.stopPropagation();
                                openTypePopover(ticket, e);
                              }}
                              style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '4px',
                                cursor: isTechnician ? 'default' : 'pointer',
                                color: isTechnician ? '#8094ae' : '#357bf2'
                              }}
                              title={isTechnician ? 'Type is locked for technicians' : 'Click to change type'}
                            >
                              <Icon name="tag" style={{ fontSize: '10px' }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'underline dotted' }}>
                                {(ticket.typeLabel || ticket.type).length > 10 ? `${(ticket.typeLabel || ticket.type).slice(0, 10)}...` : (ticket.typeLabel || ticket.type)}
                              </span>
                            </div>
                            <div 
                              style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '4px',
                                color: '#8094ae'
                              }}
                            >
                              <Icon name="users" style={{ fontSize: '10px' }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {getAssignedToName(ticket.assignedTo)}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Icon name="clock" style={{ fontSize: '10px' }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {ticket.updated_at ? formatTicketDateVeryShort(ticket.updated_at) : 'N/A'}
                              </span>
                            </div>
                          </div>
                          
                          {/* Row 4: Actions */}
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewTicket(ticket);
                              }}
                              onTouchStart={(e) => {
                                e.currentTarget.style.backgroundColor = '#2c64cc';
                                e.currentTarget.style.transform = 'scale(0.98)';
                              }}
                              onTouchEnd={(e) => {
                                e.currentTarget.style.backgroundColor = '#357bf2';
                                e.currentTarget.style.transform = 'scale(1)';
                              }}
                              style={{
                                flex: 1,
                                padding: '8px 12px',
                                backgroundColor: '#357bf2',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '5px',
                                transition: 'all 0.2s ease',
                                boxShadow: '0 2px 4px rgba(53, 123, 242, 0.2)'
                              }}
                            >
                              <Icon name="eye" style={{ fontSize: '14px' }} />
                              View
                            </button>
                            <Dropdown 
                              isOpen={openDropdown === ticket.id} 
                              toggle={() => setOpenDropdown(openDropdown === ticket.id ? null : ticket.id)}
                            >
                              <DropdownToggle
                                tag="button"
                                style={{
                                  padding: '8px 12px',
                                  backgroundColor: '#f8f9fb',
                                  color: '#374151',
                                  border: '1px solid #e5e9f2',
                                  borderRadius: '6px',
                                  fontSize: '12px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  transition: 'all 0.2s ease',
                                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                                }}
                              >
                                <Icon name="more-v" style={{ fontSize: '14px' }} />
                              </DropdownToggle>
                              <DropdownMenu end style={{ borderRadius: '8px', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)', border: '1px solid #e5e9f2' }}>
                                <DropdownItem 
                                  onClick={() => handleViewTicket(ticket)}
                                  style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}
                                >
                                  <Icon name="eye" style={{ fontSize: '16px', color: '#357bf2' }} /> 
                                  <span>View Details</span>
                                </DropdownItem>
                                <DropdownItem 
                                  onClick={() => handleWatchTicket(ticket.id)}
                                  style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}
                                >
                                  <Icon name={ticket.watching === 'Yes' ? 'eye-fill' : 'eye-off'} style={{ fontSize: '16px', color: '#28a745' }} /> 
                                  <span>{ticket.watching === 'Yes' ? 'Stop Watching' : 'Watch Ticket'}</span>
                                </DropdownItem>
                                <DropdownItem divider />
                                <DropdownItem 
                                  onClick={() => handleDeleteTicket(ticket.id)}
                                  style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#dc3545' }}
                                >
                                  <Icon name="trash" style={{ fontSize: '16px' }} /> 
                                  <span>Delete</span>
                                </DropdownItem>
                              </DropdownMenu>
                            </Dropdown>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {isMobile && currentView === 'table' ? null : isMobile && (
                /* Mobile: Show entries and Table search */
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e9f2' }}>
                  {/* Row 4: Show entries */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '14px', color: '#8094ae' }}>
                    <span>Show</span>
                    <select 
                      name="admin_support_tickets_opened_list_length"
                      className="form-control form-control-sm"
                      value={pagination.itemsPerPage}
                      onChange={(e) => setPagination(prev => ({ ...prev, itemsPerPage: Number(e.target.value), currentPage: 1 }))}
                      style={{
                        border: '1px solid #e5e9f2',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '14px',
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
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                      <Button 
                        className="btn btn-outline-secondary btn-sm" 
                        onClick={() => console.log('Previous')}
                        style={{ padding: '4px 8px' }}
                      >
                        <Icon name="chevron-left" />
                      </Button>
                      <Button 
                        className="btn btn-outline-secondary btn-sm" 
                        onClick={() => console.log('More')}
                        style={{ padding: '4px 8px' }}
                      >
                        •••
                      </Button>
                      <Button 
                        className="btn btn-outline-secondary btn-sm" 
                        onClick={() => console.log('Next')}
                        style={{ padding: '4px 8px' }}
                      >
                        <Icon name="chevron-right" />
                      </Button>
                    </div>
                  </div>

                  {/* Row 5: Table search */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input 
                      type="search" 
                      className="form-control form-control-sm" 
                      placeholder="Table search"
                      value={filters.search}
                      onChange={(e) => setFilters(prev => ({...prev, search: e.target.value}))}
                      style={{
                        flex: 1,
                        border: '1px solid #e5e9f2',
                        borderRadius: '4px',
                        padding: '8px 12px',
                        fontSize: '14px',
                        backgroundColor: '#fff',
                        color: '#8094ae'
                      }}
                    />
                    <Icon name="search" style={{ color: '#8094ae' }} />
                  </div>
                </div>
              )}
              
              {!isMobile && (
                /* Desktop: DataTable Actions Header */
                <div className="row">
                  <div className="col-md-12">
                    <div className="dt-actions has-mass-actions" style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 16px',
                      backgroundColor: '#fff',
                      borderBottom: '1px solid #e5e9f2'
                    }}>
                      {/* Left: Actions and Show Entries */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        {/* Actions Dropdown */}
                        <Dropdown>
                          <DropdownToggle 
                            tag="button" 
                            className="btn btn-outline-light dropdown-toggle"
                            disabled={selectedTickets.length === 0}
                            style={{ 
                              fontSize: '13px',
                              color: '#8094ae',
                              border: '1px solid #e5e9f2',
                              backgroundColor: '#fff',
                              padding: '6px 12px'
                            }}
                          >
                            Actions
                          </DropdownToggle>
                          <DropdownMenu>
                            <DropdownItem onClick={() => handleBulkAction('close')}>
                              Close tickets <span className="count">({selectedTickets.length})</span>
                            </DropdownItem>
                            <DropdownItem onClick={() => handleBulkAction('archive')}>
                              Move to archive <span className="count">({selectedTickets.length})</span>
                            </DropdownItem>
                            <DropdownItem onClick={() => handleBulkAction('change')}>
                              Change <span className="count">({selectedTickets.length})</span>
                            </DropdownItem>
                            <DropdownItem onClick={() => handleBulkAction('labels')}>
                              Labels <span className="count">({selectedTickets.length})</span>
                            </DropdownItem>
                            <DropdownItem onClick={() => handleBulkAction('add_watchers')}>
                              Add watchers <span className="count">({selectedTickets.length})</span>
                            </DropdownItem>
                            <DropdownItem onClick={() => handleBulkAction('remove_watchers')}>
                              Remove watchers <span className="count">({selectedTickets.length})</span>
                            </DropdownItem>
                          </DropdownMenu>
                        </Dropdown>

                        {/* Show Entries */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#8094ae' }}>
                          <span>Show</span>
                          <select 
                            name="admin_support_tickets_opened_list_length"
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {/* Search */}
                        <div style={{ position: 'relative' }}>
                          <input 
                            type="search" 
                            className="form-control input-sm" 
                            placeholder="Table search"
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

                        {/* Buttons */}
                        <button 
                          type="button" 
                          className="btn btn-outline-secondary btn-icon"
                          title="Toggle colored rows according to status"
                          onClick={handleToggleColorRows}
                          style={{ 
                            width: '32px', 
                            height: '32px', 
                            padding: '0',
                            border: '1px solid #e5e9f2',
                            backgroundColor: '#8094ae',
                            color: '#fff'
                          }}
                        >
                          <Icon name="color-palette" style={{ color: '#fff' }} />
                        </button>
                        
                        <button 
                          className="btn btn-outline-secondary btn-icon" 
                          type="button" 
                          title="Show/hide columns"
                          onClick={handleShowHideColumns}
                          style={{ 
                            width: '32px', 
                            height: '32px', 
                            padding: '0',
                            border: '1px solid #e5e9f2',
                            backgroundColor: '#fff',
                            color: '#8094ae'
                          }}
                        >
                          <Icon name="setting" />
                        </button>
                        
                        <button 
                          className="btn btn-outline-secondary btn-icon" 
                          type="button" 
                          title="Export to"
                          onClick={handleExportData}
                          style={{ 
                            width: '32px', 
                            height: '32px', 
                            padding: '0',
                            border: '1px solid #e5e9f2',
                            backgroundColor: '#fff',
                            color: '#8094ae'
                          }}
                        >
                          <Icon name="arrow-to-down" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Pull-to-refresh indicator */}
              {isMobile && pullDistance > 0 && (
                <div
                  style={{
                    height: `${Math.min(pullDistance, 80)}px`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'height 0.2s',
                    backgroundColor: '#f8f9fb',
                    borderBottom: '1px solid #e5e9f2'
                  }}
                >
                  <Icon 
                    name="reload" 
                    style={{ 
                      fontSize: '20px', 
                      color: '#6c63ff',
                      transform: `rotate(${pullDistance * 3.6}deg)`,
                      transition: 'transform 0.1s'
                    }} 
                  />
                </div>
              )}

              {/* Table View */}
              {currentView === 'table' && !isMobile && (
                <div 
                  style={{ 
                    overflowX: isMobile ? 'auto' : 'visible',
                    WebkitOverflowScrolling: 'touch',
                    marginLeft: isMobile ? '-20px' : '0',
                    marginRight: isMobile ? '-20px' : '0',
                    ...(isMobile && {
                      scrollbarWidth: 'thin',
                      scrollbarColor: '#cbd5e1 #f1f5f9',
                      // Add scroll indicator shadow
                      backgroundImage: 'linear-gradient(to right, white 30%, rgba(255,255,255,0)), linear-gradient(to right, rgba(255,255,255,0), white 70%) 0 100%, radial-gradient(farthest-side at 0% 50%, rgba(0,0,0,.1), rgba(0,0,0,0)), radial-gradient(farthest-side at 100% 50%, rgba(0,0,0,.1), rgba(0,0,0,0)) 0 100%',
                      backgroundPosition: '0 0, 100% 0, 0 0, 100% 0',
                      backgroundRepeat: 'no-repeat',
                      backgroundColor: 'white',
                      backgroundSize: '40px 100%, 40px 100%, 14px 100%, 14px 100%',
                      backgroundAttachment: 'local, local, scroll, scroll'
                    })
                  }}
                  onTouchStart={isMobile ? handleTouchStart : undefined}
                  onTouchMove={isMobile ? handleTouchMove : undefined}
                  onTouchEnd={isMobile ? handleTouchEnd : undefined}
                >
                  <Table 
                    className="table-striped" 
                    style={{
                      backgroundColor: '#fff', 
                      tableLayout: 'fixed', 
                      width: '100%', 
                      borderRadius: '0', 
                      overflow: 'hidden',
                      margin: 0,
                      border: 'none',
                      boxShadow: 'none'
                    }}
                  >
                    <thead style={{
                      backgroundColor: '#f8f9fb', 
                      borderBottom: '2px solid #e5e9f2'
                    }}>
                      <tr>
                        <th style={{
                          padding: '14px 16px 14px 20px', 
                          width: '45px',
                          textAlign: 'center',
                          verticalAlign: 'middle'
                        }}>
                          <input 
                            type="checkbox" 
                            onChange={(e) => handleSelectAll(e.target.checked)}
                            checked={selectedTickets.length === getPaginatedData().length && getPaginatedData().length > 0}
                            style={{
                              transform: 'scale(1.1)',
                              cursor: 'pointer',
                              accentColor: '#357bf2'
                            }} 
                          />
                        </th>
                        <th 
                          style={{
                            padding: '14px 10px', 
                            cursor: 'pointer', 
                            userSelect: 'none', 
                            width: '85px',
                            transition: 'background-color 0.2s'
                          }} 
                          onClick={() => setSort({field: 'number', direction: sort.field === 'number' && sort.direction === 'asc' ? 'desc' : 'asc'})}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#eef1f7'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <span style={{
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '4px', 
                            fontSize: '11px', 
                            fontWeight: '600', 
                            color: '#374151',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>
                            Ticket
                            <Icon name={sort.field === 'number' ? (sort.direction === 'asc' ? 'chevron-up' : 'chevron-down') : 'sort'} style={{fontSize: '10px', opacity: 0.7}} />
                          </span>
                        </th>
                        <th 
                          style={{
                            padding: '14px 10px', 
                            cursor: 'pointer', 
                            userSelect: 'none', 
                            width: '230px',
                            transition: 'background-color 0.2s'
                          }} 
                          onClick={() => setSort({field: 'subject', direction: sort.field === 'subject' && sort.direction === 'asc' ? 'desc' : 'asc'})}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#eef1f7'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <span style={{
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '4px', 
                            fontSize: '13px', 
                            fontWeight: '600', 
                            color: '#374151',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>
                            Subject
                            <Icon name={sort.field === 'subject' ? (sort.direction === 'asc' ? 'chevron-up' : 'chevron-down') : 'sort'} style={{fontSize: '12px', opacity: 0.7}} />
                          </span>
                        </th>
                        <th style={{
                          padding: '14px 10px', 
                          fontSize: '13px', 
                          fontWeight: '600', 
                          color: '#374151', 
                          width: '150px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px'
                        }}>Customer</th>
                        <th 
                          style={{
                            padding: '14px 10px', 
                            cursor: 'pointer', 
                            userSelect: 'none', 
                            width: '100px',
                            transition: 'background-color 0.2s'
                          }} 
                          onClick={() => setSort({field: 'priority', direction: sort.field === 'priority' && sort.direction === 'asc' ? 'desc' : 'asc'})}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#eef1f7'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <span style={{
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '4px', 
                            fontSize: '13px', 
                            fontWeight: '600', 
                            color: '#374151',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>
                            Priority
                            <Icon name={sort.field === 'priority' ? (sort.direction === 'asc' ? 'chevron-up' : 'chevron-down') : 'sort'} style={{fontSize: '12px', opacity: 0.7}} />
                          </span>
                        </th>
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
                          padding: '14px 10px', 
                          fontSize: '11px', 
                          fontWeight: '600', 
                          color: '#374151', 
                          width: '80px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          textAlign: 'center'
                        }}>Watch</th>
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
                        backgroundColor: selectedTickets.includes(ticket.id) ? '#f0f8ff' : ticket._archived ? '#fffbf0' : '#fff',
                        transition: 'background-color 0.15s'
                      }}
                      onMouseEnter={(e) => {
                        if (!selectedTickets.includes(ticket.id)) {
                          e.currentTarget.style.backgroundColor = ticket._archived ? '#fef3c7' : '#f8f9fb';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!selectedTickets.includes(ticket.id)) {
                          e.currentTarget.style.backgroundColor = ticket._archived ? '#fffbf0' : '#fff';
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
                          {ticket._archived && (
                            <span style={{
                              display: 'inline-block',
                              marginTop: '2px',
                              fontSize: '10px',
                              fontWeight: '600',
                              color: '#92400e',
                              backgroundColor: '#fef3c7',
                              border: '1px solid #f59e0b',
                              borderRadius: '3px',
                              padding: '1px 5px'
                            }}>ARCHIVED</span>
                          )}
                        </span>
                      </td>
                      <td style={{
                        padding: '14px 10px', 
                        width: '230px',
                        verticalAlign: 'middle'
                      }}>
                        <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
                          <span style={{
                            fontSize: '10px',
                            color: '#f59e0b',
                            fontWeight: '500',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <Icon name="update" style={{fontSize: '10px'}} />
                            Last update: {ticket.updated_at ? getTimeAgo(ticket.updated_at) : getTimeAgo(ticket.created_at)}
                          </span>
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
                            <span style={{
                              fontSize: '10px',
                              color: '#10b981',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '3px'
                            }}>
                              <Icon name="calendar" style={{fontSize: '9px'}} />
                              Created: {formatTicketDateVeryShort(ticket.created_at)}
                            </span>
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
                        <span
                          onClick={(e) => openPriorityPopover(ticket, e)}
                          style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          title="Click to change priority"
                        >
                          <Badge className={getPriorityBadge(ticket.priority)} style={{
                            textTransform: 'capitalize',
                            fontSize: '11px',
                            padding: '4px 8px',
                            fontWeight: '600'
                          }}>
                            {ticket.priority}
                          </Badge>
                          <Icon name="chevron-down" style={{ fontSize: '12px', color: '#8094ae' }} />
                        </span>
                      </td>
                      <td style={{
                        padding: '14px 10px', 
                        width: '125px', 
                        verticalAlign: 'middle',
                        textAlign: 'left'
                      }}>
                        <span
                          onClick={(e) => openStatusPopover(ticket, e)}
                          style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          title="Click to change status"
                        >
                          <Badge className={getStatusBadge(ticket.status)} style={{
                            textTransform: 'none',
                            fontSize: '11px',
                            padding: '4px 8px',
                            fontWeight: '500',
                            whiteSpace: 'nowrap'
                          }}>
                            {statusLabels[ticket.status] || ticket.status}
                          </Badge>
                          <Icon name="chevron-down" style={{ fontSize: '12px', color: '#8094ae' }} />
                        </span>
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
                        <span
                          onClick={(e) => openGroupPopover(ticket, e)}
                          style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}
                          title="Click to change group"
                        >
                          <span>{ticket.group || 'Any'}</span>
                          <Icon name="chevron-down" style={{ fontSize: '12px', color: '#8094ae' }} />
                        </span>
                      </td>
                      <td style={{
                        padding: '14px 10px', 
                        fontSize: '14px', 
                        color: '#374151', 
                        width: '100px',
                        verticalAlign: 'middle',
                        wordBreak: 'break-word',
                        whiteSpace: 'normal',
                        lineHeight: '1.4'
                      }}>
                        <span
                          onClick={isTechnician ? undefined : (e) => openTypePopover(ticket, e)}
                          style={{ cursor: isTechnician ? 'default' : 'pointer', textTransform: 'capitalize', color: isTechnician ? '#8094ae' : '#357bf2', fontWeight: '500', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          title={isTechnician ? 'Type is locked for technicians' : 'Click to change type'}
                        >
                          <span>{ticket.typeLabel || ticket.type}</span>
                          <Icon name="chevron-down" style={{ fontSize: '12px', color: '#8094ae' }} />
                        </span>
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
                        <span
                          onClick={isTechnician ? undefined : (e) => openAssignedToPopover(ticket, e)}
                          style={{ cursor: isTechnician ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          title={isTechnician ? 'Assignment is locked for technicians' : 'Click to change assigned to'}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {ticket.assignedTo && ticket.assignedTo !== '0' ? getAssignedToName(ticket.assignedTo) : <span style={{color: '#8094ae'}}>Unassigned</span>}
                          </span>
                          <Icon name="chevron-down" style={{ fontSize: '12px', color: '#8094ae', flexShrink: 0 }} />
                        </span>
                      </td>
                      <td style={{
                        padding: '14px 10px', 
                        width: '80px',
                        verticalAlign: 'middle',
                        textAlign: 'center'
                      }}>
                        <div 
                          onClick={() => handleWatchTicket(ticket.id)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '5px',
                            padding: '5px 10px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: '600',
                            color: ticket.watching === 'Yes' ? '#28a745' : '#6c757d',
                            backgroundColor: ticket.watching === 'Yes' ? '#d4edda' : '#f1f3f5',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            border: `1px solid ${ticket.watching === 'Yes' ? '#c3e6cb' : '#e5e9f2'}`
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'scale(1.05)';
                            if (ticket.watching === 'Yes') {
                              e.currentTarget.style.backgroundColor = '#c3e6cb';
                            } else {
                              e.currentTarget.style.backgroundColor = '#e5e9f2';
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                            if (ticket.watching === 'Yes') {
                              e.currentTarget.style.backgroundColor = '#d4edda';
                            } else {
                              e.currentTarget.style.backgroundColor = '#f1f3f5';
                            }
                          }}
                          title={ticket.watching === 'Yes' ? 'Click to stop watching' : 'Click to watch'}
                        >
                          <Icon 
                            name={ticket.watching === 'Yes' ? 'eye-fill' : 'eye-off'} 
                            style={{ fontSize: '14px' }} 
                          />
                          <span>{ticket.watching === 'Yes' ? 'Yes' : 'No'}</span>
                        </div>
                      </td>
                      <td style={{
                        padding: '12px 20px 12px 4px', 
                        width: '90px',
                        verticalAlign: 'middle',
                        textAlign: 'center'
                      }}>
                        <div style={{display: 'flex', gap: '3px', justifyContent: 'center', alignItems: 'center'}}>
                          <button 
                            onClick={() => handleViewTicket(ticket)}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#e8f4fd';
                              e.currentTarget.style.color = '#357bf2';
                              e.currentTarget.style.transform = 'scale(1.08)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = '#f1f3f5';
                              e.currentTarget.style.color = '#6c757d';
                              e.currentTarget.style.transform = 'scale(1)';
                            }}
                            style={{
                              backgroundColor: '#f1f3f5',
                              border: 'none',
                              borderRadius: '5px',
                              color: '#6c757d',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              padding: '4px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '26px',
                              height: '26px'
                            }}
                            title="View ticket details"
                          >
                            <Icon name="eye" style={{ fontSize: '13px' }} />
                          </button>
                          {!isMobile && (
                            <button 
                              onClick={() => handleWatchTicket(ticket.id)}
                              onMouseEnter={(e) => {
                                if (ticket.watching === 'Yes') {
                                  e.currentTarget.style.backgroundColor = '#fff3cd';
                                  e.currentTarget.style.color = '#ffc107';
                                } else {
                                  e.currentTarget.style.backgroundColor = '#d4edda';
                                  e.currentTarget.style.color = '#28a745';
                                }
                                e.currentTarget.style.transform = 'scale(1.08)';
                              }}
                              onMouseLeave={(e) => {
                                if (ticket.watching === 'Yes') {
                                  e.currentTarget.style.backgroundColor = '#d4edda';
                                  e.currentTarget.style.color = '#28a745';
                                } else {
                                  e.currentTarget.style.backgroundColor = '#f1f3f5';
                                  e.currentTarget.style.color = '#6c757d';
                                }
                                e.currentTarget.style.transform = 'scale(1)';
                              }}
                              style={{
                                backgroundColor: ticket.watching === 'Yes' ? '#d4edda' : '#f1f3f5',
                                border: 'none',
                                borderRadius: '5px',
                                color: ticket.watching === 'Yes' ? '#28a745' : '#6c757d',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                padding: '4px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '26px',
                                height: '26px'
                              }}
                              title={ticket.watching === 'Yes' ? 'Stop watching' : 'Watch ticket'}
                            >
                              <Icon name={ticket.watching === 'Yes' ? 'eye-fill' : 'eye-off'} style={{ fontSize: '13px' }} />
                            </button>
                          )}
                          {!isMobile && (
                            <button 
                              onClick={() => handleDeleteTicket(ticket.id)}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#f8d7da';
                                e.currentTarget.style.color = '#dc3545';
                                e.currentTarget.style.transform = 'scale(1.08)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = '#f1f3f5';
                                e.currentTarget.style.color = '#6c757d';
                                e.currentTarget.style.transform = 'scale(1)';
                              }}
                              style={{
                                backgroundColor: '#f1f3f5',
                                border: 'none',
                                borderRadius: '5px',
                                color: '#6c757d',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                padding: '4px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '26px',
                                height: '26px'
                              }}
                              title="Delete ticket"
                            >
                              <Icon name="trash" style={{ fontSize: '13px' }} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {getPaginatedData().length === 0 && (
                    <tr>
                      <td colSpan={20} style={{ textAlign: 'center', padding: '40px 20px', color: '#8094ae' }}>
                        <Icon name="inbox" style={{ fontSize: '32px', color: '#cbd5e1', marginBottom: '10px', display: 'block', margin: '0 auto 10px' }} />
                        <div style={{ fontWeight: '600', color: '#374151', marginBottom: '6px' }}>No tickets found</div>
                        {filters.search && (
                          <div style={{ fontSize: '13px' }}>
                            Archived tickets won't appear here.{' '}
                            <span
                              onClick={() => navigate('/admin/tickets/archive')}
                              style={{ color: '#357bf2', cursor: 'pointer', textDecoration: 'underline' }}
                            >
                              Search in Archive
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
                </Table>
              </div>
              )}

              {/* Card View - Reference Design */}
              {currentView === 'card' && (
                <div 
                  style={{ 
                    backgroundColor: '#f8f9fb', 
                    padding: isMobile ? '8px' : '16px',
                    minHeight: '100vh'
                  }}
                  onTouchStart={isMobile ? handleTouchStart : undefined}
                  onTouchMove={isMobile ? handleTouchMove : undefined}
                  onTouchEnd={isMobile ? handleTouchEnd : undefined}
                >
                  {getPaginatedData().map((ticket) => (
                    <div 
                      key={ticket.id} 
                      style={{
                        backgroundColor: '#fff',
                        borderRadius: '8px',
                        padding: '16px',
                        marginBottom: '12px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        border: '1px solid #e5e9f2',
                        display: 'flex',
                        gap: '20px',
                        alignItems: 'flex-start'
                      }}
                    >
                      {/* Left Column: Checkbox, Avatar, Ticket Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Checkbox and Avatar Row */}
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'flex-start', 
                          gap: '12px',
                          marginBottom: '12px'
                        }}>
                          <input 
                            type="checkbox" 
                            checked={selectedTickets.includes(ticket.id)}
                            onChange={(e) => handleSelectTicket(ticket.id, e.target.checked)}
                            style={{ 
                              transform: 'scale(1.2)',
                              cursor: 'pointer',
                              marginTop: '2px',
                              accentColor: '#357bf2'
                            }}
                          />
                          
                          {/* Avatar */}
                          <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            backgroundColor: getCustomerProperty(ticket, 'avatar') ? 'transparent' : '#526484',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontSize: '16px',
                            fontWeight: '600',
                            flexShrink: 0
                          }}>
                            {getCustomerProperty(ticket, 'avatar') ? (
                              <img 
                                src={getCustomerProperty(ticket, 'avatar')} 
                                alt="" 
                                style={{width: '100%', height: '100%', borderRadius: '50%'}} 
                              />
                            ) : (
                              getCustomerProperty(ticket, 'initial') || 'C'
                            )}
                          </div>

                          {/* Ticket Title with ID */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div 
                              onClick={() => handleViewTicket(ticket)}
                              style={{
                                fontSize: '15px',
                                fontWeight: '500',
                                color: '#364a63',
                                lineHeight: '1.4',
                                cursor: 'pointer',
                                wordBreak: 'break-word',
                                marginBottom: '8px'
                              }}
                              onMouseEnter={(e) => {
                                e.target.style.color = '#357bf2';
                                e.target.style.textDecoration = 'underline';
                              }}
                              onMouseLeave={(e) => {
                                e.target.style.color = '#364a63';
                                e.target.style.textDecoration = 'none';
                              }}
                            >
                              {ticket.subject} #{ticket.number}
                            </div>

                            {/* Customer */}
                            <div style={{ 
                              fontSize: '13px', 
                              color: '#526484',
                              marginBottom: '4px',
                              lineHeight: '1.5'
                            }}>
                              <span style={{ fontWeight: '500' }}>Customer:</span>{' '}
                              {getCustomerProperty(ticket, 'phone') ? (
                                <a
                                  href={`tel:${getCustomerProperty(ticket, 'phone')}`}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    color: '#28a745',
                                    textDecoration: 'none',
                                    fontWeight: '500',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
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
                                  <Icon name="call" style={{ fontSize: '12px' }} />
                                  {getCustomerProperty(ticket, 'name') || getCustomerProperty(ticket, 'phone')}
                                </a>
                              ) : (
                                <span style={{ color: '#364a63' }}>
                                  {getCustomerProperty(ticket, 'name') || 'N/A'}
                                </span>
                              )}
                            </div>

                            {/* Assign to */}
                            <div style={{ 
                              fontSize: '13px', 
                              color: '#526484',
                              marginBottom: '4px',
                              lineHeight: '1.5'
                            }}>
                              <span style={{ fontWeight: '500' }}>Assign to:</span>{' '}
                              <span style={{ color: '#364a63' }}>
                                {getAssignedToName(ticket.assignedTo)}
                              </span>
                            </div>

                            {/* Group */}
                            <div style={{ 
                              fontSize: '13px', 
                              color: '#526484',
                              marginBottom: '4px',
                              lineHeight: '1.5',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              <span style={{ fontWeight: '500' }}>Group:</span>{' '}
                              <span 
                                style={{ 
                                  color: '#364a63',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                onClick={(e) => openGroupPopover(ticket, e)}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.color = '#357bf2';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.color = '#364a63';
                                }}
                              >
                                {ticket.group || 'Any'}
                                <Icon name="chevron-down" style={{ fontSize: '12px', color: '#8094ae' }} />
                              </span>
                            </div>

                            {/* Type */}
                            <div style={{ 
                              fontSize: '13px', 
                              color: '#526484',
                              lineHeight: '1.5',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              <span style={{ fontWeight: '500' }}>Type:</span>{' '}
                              <span 
                                style={{ 
                                  color: '#364a63',
                                  textTransform: 'capitalize',
                                  cursor: isTechnician ? 'default' : 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                onClick={isTechnician ? undefined : (e) => openTypePopover(ticket, e)}
                                onMouseEnter={isTechnician ? undefined : (e) => {
                                  e.currentTarget.style.color = '#357bf2';
                                }}
                                onMouseLeave={isTechnician ? undefined : (e) => {
                                  e.currentTarget.style.color = '#364a63';
                                }}
                              >
                                {ticket.typeLabel || ticket.type}
                                <Icon name="chevron-down" style={{ fontSize: '12px', color: '#8094ae' }} />
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right Column: Last Updated, Priority, Status, Actions */}
                      <div style={{ 
                        display: 'flex', 
                        flexDirection: 'column',
                        alignItems: 'flex-end',
                        gap: '8px',
                        minWidth: '140px',
                        flexShrink: 0
                      }}>
                        {/* Last Updated */}
                        <div style={{ 
                          fontSize: '13px', 
                          color: '#526484',
                          marginBottom: '4px',
                          textAlign: 'right'
                        }}>
                          <span style={{ fontWeight: '500' }}>Last updated:</span>{' '}
                          <span style={{ color: '#364a63' }}>
                            {ticket.updated_at ? getTimeAgo(new Date(ticket.updated_at)) : 'N/A'}
                          </span>
                        </div>

                        {/* Priority */}
                        <div style={{ 
                          fontSize: '13px', 
                          color: '#526484',
                          marginBottom: '4px',
                          textAlign: 'right',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          justifyContent: 'flex-end'
                        }}>
                          <span style={{ fontWeight: '500' }}>Priority:</span>{' '}
                          <span
                            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            onClick={(e) => openPriorityPopover(ticket, e)}
                          >
                            <Badge 
                              className={getPriorityBadge(ticket.priority)} 
                              style={{
                                textTransform: 'capitalize',
                                fontSize: '11px',
                                padding: '4px 8px',
                                fontWeight: '500'
                              }}
                            >
                              {ticket.priority}
                            </Badge>
                            <Icon name="chevron-down" style={{ fontSize: '12px', color: '#8094ae' }} />
                          </span>
                        </div>

                        {/* Status */}
                        <div style={{ 
                          fontSize: '13px', 
                          color: '#526484',
                          marginBottom: '4px',
                          textAlign: 'right',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          justifyContent: 'flex-end'
                        }}>
                          <span style={{ fontWeight: '500' }}>Status:</span>{' '}
                          <span
                            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            onClick={(e) => openStatusPopover(ticket, e)}
                          >
                            <Badge 
                              className={getStatusBadge(ticket.status)} 
                              style={{
                                fontSize: '11px',
                                padding: '4px 8px',
                                fontWeight: '500'
                              }}
                            >
                              {statusLabels[ticket.status] || ticket.status}
                            </Badge>
                            <Icon name="chevron-down" style={{ fontSize: '12px', color: '#8094ae' }} />
                          </span>
                        </div>

                        {/* Actions Dropdown */}
                        <div className="dropdown" style={{ marginTop: '4px' }}>
                          <Button 
                            color="transparent" 
                            className="btn btn-icon btn-trigger" 
                            data-toggle="dropdown"
                            style={{ 
                              padding: '4px 8px',
                              border: 'none',
                              backgroundColor: 'transparent'
                            }}
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
                                <a href="#watch" onClick={(e) => { e.preventDefault(); handleWatchTicket(ticket.id); }}>
                                  <Icon name={ticket.watching === 'Yes' ? 'eye-fill' : 'eye-off'}></Icon>
                                  <span>{ticket.watching === 'Yes' ? 'Stop Watching' : 'Watch'}</span>
                                </a>
                              </li>
                              <li>
                                <a href="#delete" onClick={(e) => { e.preventDefault(); handleDeleteTicket(ticket.id); }}>
                                  <Icon name="trash"></Icon>
                                  <span>Delete</span>
                                </a>
                              </li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* No tickets message for card view */}
                  {getPaginatedData().length === 0 && (
                    <div style={{ 
                      textAlign: 'center', 
                      padding: '60px 20px',
                      backgroundColor: '#fff',
                      borderRadius: '12px',
                      marginTop: '12px'
                    }}>
                      <Icon name="inbox" style={{ fontSize: '48px', color: '#cbd5e1', marginBottom: '16px' }} />
                      <h5 style={{ color: '#374151', marginBottom: '8px', fontSize: '18px' }}>No tickets found</h5>
                      <p style={{ color: '#8094ae', fontSize: '14px' }}>
                        Try adjusting your filters or create a new ticket.
                      </p>
                      {filters.search && (
                        <p style={{ color: '#8094ae', fontSize: '13px', marginTop: '4px' }}>
                          Archived tickets won't appear here.{' '}
                          <span
                            onClick={() => navigate('/admin/tickets/archive')}
                            style={{ color: '#357bf2', cursor: 'pointer', textDecoration: 'underline' }}
                          >
                            Search in Archive
                          </span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
              
              {/* Enhanced Pagination */}
              <div style={{
                padding: isMobile ? '12px 16px' : '15px 20px',
                backgroundColor: '#fff',
                borderTop: '1px solid #e5e9f2'
              }}>
                {isMobile ? (
                  // Mobile pagination
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Info row */}
                    <div style={{
                      fontSize: '13px',
                      color: '#526484',
                      textAlign: 'center'
                    }}>
                      Page {pagination.currentPage} of {totalPages} ({pagination.totalItems} tickets)
                    </div>
                    
                    {/* Controls row */}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button
                        onClick={() => setPagination(prev => ({...prev, currentPage: Math.max(1, prev.currentPage - 1)}))}
                        disabled={pagination.currentPage === 1}
                        style={{
                          flex: 1,
                          padding: '12px',
                          backgroundColor: pagination.currentPage === 1 ? '#f8f9fb' : '#6c63ff',
                          color: pagination.currentPage === 1 ? '#ccc' : '#fff',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: '500',
                          cursor: pagination.currentPage === 1 ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        <Icon name="chevron-left" />
                        Previous
                      </button>
                      
                      <select 
                        value={pagination.itemsPerPage} 
                        onChange={(e) => setPagination(prev => ({ 
                          ...prev, 
                          itemsPerPage: Number(e.target.value), 
                          currentPage: 1 
                        }))}
                        style={{
                          padding: '12px',
                          border: '1px solid #e5e9f2',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: '500',
                          minWidth: '70px',
                          cursor: 'pointer',
                          backgroundColor: '#fff'
                        }}
                      >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                      </select>
                      
                      <button
                        onClick={() => setPagination(prev => ({...prev, currentPage: Math.min(totalPages, prev.currentPage + 1)}))}
                        disabled={pagination.currentPage === totalPages}
                        style={{
                          flex: 1,
                          padding: '12px',
                          backgroundColor: pagination.currentPage === totalPages ? '#f8f9fb' : '#6c63ff',
                          color: pagination.currentPage === totalPages ? '#ccc' : '#fff',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: '500',
                          cursor: pagination.currentPage === totalPages ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        Next
                        <Icon name="chevron-right" />
                      </button>
                    </div>
                  </div>
                ) : (
                  // Desktop pagination
                  <div className="row justify-content-between align-items-center">
                    <div className="col-md-6">
                      <div className="dataTables_info" role="status" aria-live="polite" style={{
                        fontSize: '14px',
                        color: '#526484'
                      }}>
                        Showing {pagination.currentPage === 1 ? 1 : ((pagination.currentPage - 1) * pagination.itemsPerPage) + 1} to {Math.min(pagination.currentPage * pagination.itemsPerPage, pagination.totalItems)} of {pagination.totalItems} entries
                        {filters.search && ` (filtered from ${data.length} total entries)`}
                      </div>
                    </div>
                    <div className="col-md-6 d-flex justify-content-end align-items-center gap-3">
                      <div className="d-flex align-items-center gap-2">
                        <span style={{fontSize: '14px', color: '#526484'}}>Show:</span>
                        <select 
                          value={pagination.itemsPerPage} 
                          onChange={(e) => setPagination(prev => ({ ...prev, itemsPerPage: Number(e.target.value), currentPage: 1 }))}
                          style={{
                            border: '1px solid #e5e9f2',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '14px'
                          }}
                        >
                          <option value={5}>5</option>
                          <option value={10}>10</option>
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                        </select>
                      </div>
                      
                      {totalPages > 1 && (
                    <div className="dataTables_paginate paging_full_numbers">
                      <ul className="pagination" style={{
                        display: 'flex',
                        listStyle: 'none',
                        margin: 0,
                        padding: 0,
                        gap: '2px'
                      }}>
                        <li className={`paginate_button first ${pagination.currentPage === 1 ? 'disabled' : ''}`}>
                          <a 
                            href="#" 
                            onClick={(e) => { e.preventDefault(); if (pagination.currentPage > 1) setPagination(prev => ({...prev, currentPage: 1})); }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '32px',
                              height: '32px',
                              border: '1px solid #e5e9f2',
                              borderRadius: '4px',
                              color: pagination.currentPage === 1 ? '#ccc' : '#8094ae',
                              textDecoration: 'none',
                              backgroundColor: '#fff',
                              cursor: pagination.currentPage === 1 ? 'not-allowed' : 'pointer'
                            }} 
                          >
                            <Icon name="arrow-left" />
                          </a>
                        </li>
                        <li className={`paginate_button previous ${pagination.currentPage === 1 ? 'disabled' : ''}`}>
                          <a 
                            href="#" 
                            onClick={(e) => { e.preventDefault(); if (pagination.currentPage > 1) setPagination(prev => ({...prev, currentPage: prev.currentPage - 1})); }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '32px',
                              height: '32px',
                              border: '1px solid #e5e9f2',
                              borderRadius: '4px',
                              color: pagination.currentPage === 1 ? '#ccc' : '#8094ae',
                              textDecoration: 'none',
                              backgroundColor: '#fff',
                              cursor: pagination.currentPage === 1 ? 'not-allowed' : 'pointer'
                            }}
                          >
                            <Icon name="chevron-left" />
                          </a>
                        </li>
                        
                        {/* Page numbers */}
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (pagination.currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (pagination.currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = pagination.currentPage - 2 + i;
                          }
                          
                          return (
                            <li key={pageNum} className={`paginate_button ${pageNum === pagination.currentPage ? 'active' : ''}`}>
                              <a 
                                href="#" 
                                onClick={(e) => { e.preventDefault(); setPagination(prev => ({...prev, currentPage: pageNum})); }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: '32px',
                                  height: '32px',
                                  border: `1px solid ${pageNum === pagination.currentPage ? '#357bf2' : '#e5e9f2'}`,
                                  borderRadius: '4px',
                                  color: pageNum === pagination.currentPage ? '#fff' : '#8094ae',
                                  textDecoration: 'none',
                                  backgroundColor: pageNum === pagination.currentPage ? '#357bf2' : '#fff',
                                  fontWeight: pageNum === pagination.currentPage ? '500' : 'normal',
                                  cursor: 'pointer'
                                }}
                              >
                                {pageNum}
                              </a>
                            </li>
                          );
                        })}
                        
                        <li className={`paginate_button next ${pagination.currentPage === totalPages ? 'disabled' : ''}`}>
                          <a 
                            href="#" 
                            onClick={(e) => { e.preventDefault(); if (pagination.currentPage < totalPages) setPagination(prev => ({...prev, currentPage: prev.currentPage + 1})); }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '32px',
                              height: '32px',
                              border: '1px solid #e5e9f2',
                              borderRadius: '4px',
                              color: pagination.currentPage === totalPages ? '#ccc' : '#8094ae',
                              textDecoration: 'none',
                              backgroundColor: '#fff',
                              cursor: pagination.currentPage === totalPages ? 'not-allowed' : 'pointer'
                            }}
                          >
                            <Icon name="chevron-right" />
                          </a>
                        </li>
                        <li className={`paginate_button last ${pagination.currentPage === totalPages ? 'disabled' : ''}`}>
                          <a 
                            href="#" 
                            onClick={(e) => { e.preventDefault(); if (pagination.currentPage < totalPages) setPagination(prev => ({...prev, currentPage: totalPages})); }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '32px',
                              height: '32px',
                              border: '1px solid #e5e9f2',
                              borderRadius: '4px',
                              color: pagination.currentPage === totalPages ? '#ccc' : '#8094ae',
                              textDecoration: 'none',
                              backgroundColor: '#fff',
                              cursor: pagination.currentPage === totalPages ? 'not-allowed' : 'pointer'
                            }}
                          >
                            <Icon name="arrow-right" />
                          </a>
                        </li>
                      </ul>
                    </div>
                  )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </PreviewCard>
            </div>

            {/* Filter Sidebar */}
            <div style={{
              position: 'fixed',
              top: isMobile ? '0' : '120px',
              bottom: 0,
              right: showAdvancedSearch ? '0' : (isMobile ? '-100vw' : '-350px'),
              width: isMobile ? '100vw' : '350px',
              backgroundColor: '#fff',
              borderLeft: '1px solid #e5e9f2',
              zIndex: 2000,
              transition: 'right 0.3s ease',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: showAdvancedSearch ? '-2px 0 8px rgba(0,0,0,0.1)' : 'none'
            }}>
              <div style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                padding: '24px',
                paddingTop: isMobile ? '80px' : '24px'
              }}>
                {/* Header */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  marginBottom: '24px',
                  paddingBottom: '16px',
                  borderBottom: '1px solid #e5e9f2'
                }}>
                  <h5 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#364a63' }}>
                    Filters
                  </h5>
                  <button 
                    onClick={() => setShowAdvancedSearch(false)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#8094ae',
                      cursor: 'pointer',
                      padding: '4px',
                      borderRadius: '4px'
                    }}
                  >
                    <Icon name="cross" />
                  </button>
                </div>

                {/* Filter Fields */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Condition */}
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#364a63', marginBottom: '8px' }}>
                      Condition
                    </label>
                    <select 
                      className="form-control"
                      value={filters.status === 'open' ? 'work in progress' : filters.status}
                      onChange={(e) => setFilters(prev => ({...prev, status: e.target.value}))}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e9f2', borderRadius: '4px', fontSize: '13px', backgroundColor: '#fff' }}
                    >
                      <option value="all">All statuses</option>
                      <option value="new">New</option>
                      <option value="work in progress">Work in progress</option>
                      <option value="pending">Pending</option>
                      <option value="solved">Solved</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                      <option value="installation complete">Installation complete</option>
                      <option value="waiting_customer">Waiting on customer</option>
                      <option value="waiting_agent">Waiting on agent</option>
                      <option value="waiting_power">Waiting on power</option>
                      <option value="power_available">Power available</option>
                      <option value="customer_unreachable">Customer unreachable</option>
                      <option value="booked_later">Booked to a further date</option>
                      <option value="out_of_range">Customer out of range</option>
                      <option value="installed_elsewhere">Already installed by another provider</option>
                      <option value="long_distance">Long distance</option>
                      <option value="pole_needed">Pole needed</option>
                    </select>
                  </div>

                  {/* Period */}
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#364a63', marginBottom: '8px' }}>
                      Period
                    </label>
                    <select
                      className="form-control"
                      value={filters.dateRange}
                      onChange={(e) => applyDatePreset(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e9f2', borderRadius: '4px', fontSize: '13px', backgroundColor: '#fff', marginBottom: '8px' }}
                    >
                      <option value="all">All dates</option>
                      <option value="today">Today</option>
                      <option value="yesterday">Yesterday</option>
                      <option value="this_week">This week</option>
                      <option value="last_week">Last week</option>
                      <option value="this_month">This month</option>
                      <option value="last_month">Last month</option>
                      <option value="custom">Custom range</option>
                    </select>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input 
                        type="date"
                        className="form-control"
                        value={filters.dateFrom}
                        onChange={(e) => setFilters(prev => ({...prev, dateRange: 'custom', dateFrom: e.target.value}))}
                        style={{ flex: 1, padding: '8px 12px', border: '1px solid #e5e9f2', borderRadius: '4px', fontSize: '13px', backgroundColor: '#fff' }}
                      />
                      <span style={{ fontSize: '12px', color: '#8094ae' }}>to</span>
                      <input 
                        type="date"
                        className="form-control"
                        value={filters.dateTo}
                        onChange={(e) => setFilters(prev => ({...prev, dateRange: 'custom', dateTo: e.target.value}))}
                        style={{ flex: 1, padding: '8px 12px', border: '1px solid #e5e9f2', borderRadius: '4px', fontSize: '13px', backgroundColor: '#fff' }}
                      />
                    </div>
                  </div>

                  {/* Customer / Lead search */}
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#364a63', marginBottom: '8px' }}>
                      Customer / Lead
                    </label>
                    <input
                      type="search"
                      className="form-control"
                      placeholder="Name, phone, ticket #..."
                      value={filters.search}
                      onChange={(e) => setFilters(prev => ({...prev, search: e.target.value}))}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e9f2', borderRadius: '4px', fontSize: '13px', backgroundColor: '#fff' }}
                    />
                  </div>

                  {/* Type */}
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#364a63', marginBottom: '8px' }}>
                      Type
                    </label>
                    <select 
                      className="form-control"
                      value={filters.type || ''}
                      onChange={(e) => setFilters(prev => ({...prev, type: e.target.value}))}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e9f2', borderRadius: '4px', fontSize: '13px', backgroundColor: '#fff' }}
                    >
                      <option value="">All types</option>
                      {typeOptions.map((label) => (
                        <option key={label} value={label}>{label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Group */}
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#364a63', marginBottom: '8px' }}>
                      Group
                    </label>
                    <select 
                      className="form-control"
                      value={filters.group || ''}
                      onChange={(e) => setFilters(prev => ({...prev, group: e.target.value}))}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e9f2', borderRadius: '4px', fontSize: '13px', backgroundColor: '#fff' }}
                    >
                      <option value="">All</option>
                      {groupOptions.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>

                  {/* Assigned */}
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#364a63', marginBottom: '8px' }}>
                      Assigned to
                    </label>
                    <select 
                      className="form-control"
                      value={filters.assignedTo || ''}
                      onChange={(e) => setFilters(prev => ({...prev, assignedTo: e.target.value}))}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e9f2', borderRadius: '4px', fontSize: '13px', backgroundColor: '#fff' }}
                    >
                      <option value="">Anyone</option>
                      <option value="unassigned">Unassigned</option>
                      {agentNames.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>

                  {showMoreSidebarFilters && (
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#364a63', marginBottom: '8px' }}>
                        Priority
                      </label>
                      <select
                        className="form-control"
                        value={filters.priority || ''}
                        onChange={(e) => setFilters(prev => ({...prev, priority: e.target.value}))}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e9f2', borderRadius: '4px', fontSize: '13px', backgroundColor: '#fff' }}
                      >
                        <option value="">All</option>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                  )}

                  <div>
                    <a 
                      href="#more-filters" 
                      onClick={(e) => {
                        e.preventDefault();
                        setShowMoreSidebarFilters((v) => !v);
                      }}
                      style={{ color: '#357bf2', textDecoration: 'none', fontSize: '13px', fontWeight: '500' }}
                    >
                      {showMoreSidebarFilters ? 'Show fewer filters' : 'Show more filters'}
                    </a>
                  </div>
                </div>
              </div>

              {/* Footer Buttons — pinned to panel bottom */}
              <div style={{ 
                flexShrink: 0,
                padding: '16px 24px',
                backgroundColor: '#fff',
                borderTop: '1px solid #e5e9f2',
                display: 'flex',
                gap: '12px',
                boxShadow: '0 -4px 12px rgba(0,0,0,0.04)'
              }}>
                  <Button 
                    className="btn btn-outline-secondary"
                    onClick={() => {
                      clearListFilters();
                      setShowMoreSidebarFilters(false);
                    }}
                    style={{ flex: 1 }}
                  >
                    Clear filters
                  </Button>
                  <Button 
                    className="btn btn-primary"
                    onClick={() => setShowAdvancedSearch(false)}
                    style={{ flex: 1 }}
                  >
                    Apply
                  </Button>
              </div>
            </div>
          </div>
        </Block>

        {/* Priority Popover */}
        {priorityPopover.open && (
          <div
            id="webuiPopover35"
            className="webui-popover bottom-left in"
            style={popoverShellStyle(priorityPopover.top, priorityPopover.left)}
          >
            <div className="webui-arrow" style={{ left: priorityPopover.arrowLeft }}></div>
            <div className="webui-popover-inner">
              <h6 className="webui-popover-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Select priority</span>
                {isMobile && (
                  <button 
                    onClick={() => setPriorityPopover(prev => ({ ...prev, open: false }))}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '18px',
                      cursor: 'pointer',
                      padding: '0 4px',
                      color: '#8094ae',
                      lineHeight: 1
                    }}
                    title="Close"
                  >
                    ×
                  </button>
                )}
              </h6>
              <div className="webui-popover-content">
                <div className="popover-scroll" style={{ maxHeight: POPOVER_CONTENT_MAX_HEIGHT, overflowY: 'auto' }}>
                  <ul className="popover-dropdown" style={popoverListStyle}>
                    {[
                      { key: 'low', label: 'Low', badge: 'bg-success' },
                      { key: 'medium', label: 'Medium', badge: 'bg-info' },
                      { key: 'high', label: 'High', badge: 'bg-warning' },
                      { key: 'urgent', label: 'Urgent', badge: 'bg-danger' },
                    ].map((opt) => (
                      <li key={opt.key} className={priorityPopover.selected === opt.key ? 'selected' : ''} onClick={() => selectPriority(opt.key)} style={popoverItemStyle}>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <span className={`badge ${opt.badge}`} style={popoverBadgeStyle}>{opt.label}</span>
                          {priorityPopover.selected === opt.key && (
                            <span className="btn-icon-sm color-success">
                              <Icon name="check" className="text-success" />
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Status Popover */}
        {statusPopover.open && (
          <div
            id="webuiPopover40"
            className="webui-popover bottom-left in"
            style={popoverShellStyle(statusPopover.top, statusPopover.left)}
          >
            <div className="webui-arrow" style={{ left: statusPopover.arrowLeft }}></div>
            <div className="webui-popover-inner">
              <h6 className="webui-popover-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Select status</span>
                {isMobile && (
                  <button 
                    onClick={() => setStatusPopover(prev => ({ ...prev, open: false }))}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '18px',
                      cursor: 'pointer',
                      padding: '0 4px',
                      color: '#8094ae',
                      lineHeight: 1
                    }}
                    title="Close"
                  >
                    ×
                  </button>
                )}
              </h6>
              <div className="webui-popover-content">
                <div className="popover-scroll" style={{ maxHeight: POPOVER_CONTENT_MAX_HEIGHT, overflowY: 'auto' }}>
                  <ul className="popover-dropdown" style={popoverListStyle}>
                    {[
                      { key: 'new', label: 'New', badge: 'bg-info' },
                      { key: 'open', label: 'Work in progress', badge: 'bg-success' },
                      { key: 'resolved', label: 'Resolved', badge: 'bg-default text-white' },
                      { key: 'installation complete', label: 'Installation complete', badge: 'bg-success' },
                      { key: 'waiting_customer', label: 'Waiting on customer', badge: 'bg-warning' },
                      { key: 'waiting_agent', label: 'Waiting on agent', badge: 'bg-info' },
                      { key: 'waiting_power', label: 'Waiting on power', badge: 'bg-warning' },
                      { key: 'power_available', label: 'Power available', badge: 'bg-success' },
                      { key: 'customer_unreachable', label: 'Customer unreachable', badge: 'bg-warning' },
                      { key: 'booked_later', label: 'Booked to a further date', badge: 'bg-info' },
                      { key: 'out_of_range', label: 'Customer out of range', badge: 'bg-warning' },
                      { key: 'installed_elsewhere', label: 'Already installed by another provider', badge: 'bg-default text-white' },
                      { key: 'long_distance', label: 'Long distance', badge: 'bg-info' },
                      { key: 'pole_needed', label: 'Pole needed', badge: 'bg-warning' },
                    ].map((opt) => (
                      <li key={opt.key} className={statusPopover.selected === opt.key ? 'selected' : ''} onClick={() => selectStatus(opt.key)} style={popoverItemStyle}>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <span className={`badge ${opt.badge}`} style={popoverBadgeStyle}>{opt.label}</span>
                          {statusPopover.selected === opt.key && (
                            <span className="btn-icon-sm color-success">
                              <Icon name="check" className="text-success" />
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Type Popover */}
        {typePopover.open && (
          <div
            id="webuiPopover45"
            className="webui-popover bottom-left in"
            style={popoverShellStyle(typePopover.top, typePopover.left)}
          >
            <div className="webui-arrow" style={{ left: typePopover.arrowLeft }}></div>
            <div className="webui-popover-inner">
              <h6 className="webui-popover-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Select type</span>
                {isMobile && (
                  <button 
                    onClick={() => setTypePopover(prev => ({ ...prev, open: false }))}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '18px',
                      cursor: 'pointer',
                      padding: '0 4px',
                      color: '#8094ae',
                      lineHeight: 1
                    }}
                    title="Close"
                  >
                    ×
                  </button>
                )}
              </h6>
              <div className="webui-popover-content">
                <div className="popover-scroll" style={{ maxHeight: POPOVER_CONTENT_MAX_HEIGHT, overflowY: 'auto' }}>
                  <ul className="popover-dropdown" style={popoverListStyle}>
                    {typeOptions.map((opt) => (
                      <li key={opt} className={typePopover.selected === opt ? 'selected' : ''} onClick={() => selectType(opt)} style={popoverItemStyle}>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <span style={{ textTransform: 'capitalize' }}>{opt}</span>
                          {typePopover.selected === opt && (
                            <span className="btn-icon-sm color-success">
                              <Icon name="check" className="text-success" />
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Group Popover */}
        {groupPopover.open && (
          <div
            id="webuiPopover50"
            className="webui-popover bottom-left in"
            style={popoverShellStyle(groupPopover.top, groupPopover.left)}
          >
            <div className="webui-arrow" style={{ left: groupPopover.arrowLeft }}></div>
            <div className="webui-popover-inner">
              <h6 className="webui-popover-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Select group</span>
                {isMobile && (
                  <button 
                    onClick={() => setGroupPopover(prev => ({ ...prev, open: false }))}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '18px',
                      cursor: 'pointer',
                      padding: '0 4px',
                      color: '#8094ae',
                      lineHeight: 1
                    }}
                    title="Close"
                  >
                    ×
                  </button>
                )}
              </h6>
              <div className="webui-popover-content">
                <div className="popover-scroll" style={{ maxHeight: POPOVER_CONTENT_MAX_HEIGHT, overflowY: 'auto' }}>
                  <ul className="popover-dropdown" style={popoverListStyle}>
                    {['IT', 'Finance', 'Sales', 'Any'].map((opt) => (
                      <li key={opt} className={groupPopover.selected === opt ? 'selected' : ''} onClick={() => selectGroup(opt)} style={popoverItemStyle}>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <span>{opt}</span>
                          {groupPopover.selected === opt && (
                            <span className="btn-icon-sm color-success">
                              <Icon name="check" className="text-success" />
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Assigned To Popover */}
        {assignedToPopover.open && (
          <div
            id="webuiPopover55"
            className="webui-popover bottom-left in"
            style={popoverShellStyle(assignedToPopover.top, assignedToPopover.left)}
          >
            <div className="webui-arrow" style={{ left: assignedToPopover.arrowLeft }}></div>
            <div className="webui-popover-inner">
              <h6 className="webui-popover-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Assign to</span>
                {isMobile && (
                  <button 
                    onClick={() => setAssignedToPopover(prev => ({ ...prev, open: false }))}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '18px',
                      cursor: 'pointer',
                      padding: '0 4px',
                      color: '#8094ae',
                      lineHeight: 1
                    }}
                    title="Close"
                  >
                    ×
                  </button>
                )}
              </h6>
              <div className="webui-popover-content">
                <div className="popover-scroll" style={{ maxHeight: POPOVER_CONTENT_MAX_HEIGHT, overflowY: 'auto' }}>
                  <ul className="popover-dropdown" style={popoverListStyle}>
                    <li 
                      key="0" 
                      className={assignedToPopover.selected === '0' ? 'selected' : ''} 
                      onClick={() => selectAssignedTo('0')}
                      style={popoverItemStyle}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <span style={{ color: '#8094ae' }}>Unassigned</span>
                        {assignedToPopover.selected === '0' && (
                          <span className="btn-icon-sm color-success">
                            <Icon name="check" className="text-success" />
                          </span>
                        )}
                      </span>
                    </li>
                    {allTechnicians.map((tech) => (
                      <li 
                        key={tech.value} 
                        className={assignedToPopover.selected === tech.value ? 'selected' : ''} 
                        onClick={() => selectAssignedTo(tech.value)}
                        style={popoverItemStyle}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <span>{tech.label}</span>
                          {assignedToPopover.selected === tech.value && (
                            <span className="btn-icon-sm color-success">
                              <Icon name="check" className="text-success" />
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Toast Notification */}
        <div 
          style={{ 
            position: 'fixed', 
            top: '20px', 
            right: '20px', 
            zIndex: 9999,
            minWidth: '300px',
            maxWidth: '400px'
          }}
        >
          <Toast isOpen={toastConfig.show}>
            <ToastHeader
              icon={toastConfig.type}
              toggle={() => setToastConfig(prev => ({ ...prev, show: false }))}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon name={toastConfig.icon} style={{ fontSize: '18px' }} />
                <strong>
                  {toastConfig.type === 'success' ? 'Success' : toastConfig.type === 'info' ? 'Info' : 'Notification'}
                </strong>
              </div>
            </ToastHeader>
            <ToastBody style={{ fontSize: '14px', padding: '12px 16px' }}>
              {toastConfig.message}
            </ToastBody>
          </Toast>
        </div>

      </Content>

      {/* ── Pre-status-change reminder modal ───────────────────────── */}
      {listReminder.open && (() => {
        const t = (data || []).find(x => x.id === listReminder.ticketId);
        return (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 1070,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}>
            <div style={{
              background: '#fff', borderRadius: 14, width: '100%', maxWidth: 480,
              boxShadow: '0 24px 64px rgba(0,0,0,0.22)', overflow: 'hidden',
            }}>
              {/* Header */}
              <div style={{
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{
                  width: 42, height: 42, borderRadius: '50%', background: 'rgba(255,255,255,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem',
                }}>⚠️</div>
                <div>
                  <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.05rem' }}>Before changing status</div>
                  <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.82rem' }}>
                    {t?.subject && <span style={{ color: '#fff' }}>{t.subject} · </span>}
                    → <strong style={{ color: '#fff' }}>{listReminder.pendingStatus}</strong>
                  </div>
                </div>
              </div>

              <div style={{ padding: '22px 24px' }}>
                {listReminder.step === 'ask' ? (
                  <>
                    <p style={{ fontSize: '1rem', fontWeight: 600, color: '#364a63', marginBottom: 6 }}>
                      Have you updated all of the following?
                    </p>
                    <ul style={{ paddingLeft: 20, color: '#526484', fontSize: '0.92rem', lineHeight: 2, marginBottom: 22 }}>
                      <li>🔗 <strong>Splitters</strong> — nearby infrastructure updated</li>
                      <li>📦 <strong>Inventory</strong> — items used on this ticket logged</li>
                      <li>📡 <strong>Router</strong> — router number and photos added</li>
                    </ul>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <button
                        onClick={async () => {
                          setListReminder({ open: false, ticketId: null, pendingStatus: null, step: 'ask' });
                          await doListStatusChange(listReminder.ticketId, listReminder.pendingStatus);
                        }}
                        style={{
                          flex: 1, padding: '11px 0', borderRadius: 8, border: 'none',
                          background: '#10b981', color: '#fff', fontWeight: 700,
                          fontSize: '0.95rem', cursor: 'pointer',
                        }}
                      >
                        ✅ Yes, all updated — proceed
                      </button>
                      <button
                        onClick={() => setListReminder(p => ({ ...p, step: 'choose' }))}
                        style={{
                          flex: 1, padding: '11px 0', borderRadius: 8,
                          border: '2px solid #e5e9f2', background: '#fff',
                          color: '#364a63', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
                        }}
                      >
                        ❌ No, let me update
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#364a63', marginBottom: 16 }}>
                      Open the ticket to update:
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                      {[
                        { emoji: '🔗', label: 'Update Splitters',       sub: 'Find and update nearby infrastructure', color: '#3b82f6', bg: '#eff6ff', border: '#3b82f6' },
                        { emoji: '📦', label: 'Log Inventory',           sub: 'Record items used on this ticket',      color: '#b45309', bg: '#fffbeb', border: '#f59e0b' },
                        { emoji: '📡', label: 'Add / Update Router',     sub: 'Add router number and photos',          color: '#065f46', bg: '#f0fdf4', border: '#10b981' },
                      ].map(({ emoji, label, sub, color, bg, border }) => (
                        <button
                          key={label}
                          onClick={() => {
                            setListReminder({ open: false, ticketId: null, pendingStatus: null, step: 'ask' });
                            navigate(`/admin/tickets/view/${listReminder.ticketId}`, {
                              state: { ticket: t }
                            });
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 14,
                            padding: '13px 16px', borderRadius: 10,
                            border: `2px solid ${border}`, background: bg,
                            cursor: 'pointer', textAlign: 'left', width: '100%',
                          }}
                        >
                          <span style={{ fontSize: '1.6rem' }}>{emoji}</span>
                          <div>
                            <div style={{ fontWeight: 700, color, fontSize: '0.92rem' }}>{label}</div>
                            <div style={{ color: '#6b7280', fontSize: '0.78rem' }}>{sub}</div>
                          </div>
                          <em className="icon ni ni-arrow-right" style={{ color: border, marginLeft: 'auto' }} />
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        onClick={() => setListReminder(p => ({ ...p, step: 'ask' }))}
                        style={{
                          flex: 1, padding: '9px 0', borderRadius: 8,
                          border: '1px solid #e5e9f2', background: '#f8f9fc',
                          color: '#526484', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
                        }}
                      >
                        ← Back
                      </button>
                      <button
                        onClick={async () => {
                          setListReminder({ open: false, ticketId: null, pendingStatus: null, step: 'ask' });
                          await doListStatusChange(listReminder.ticketId, listReminder.pendingStatus);
                        }}
                        style={{
                          flex: 2, padding: '9px 0', borderRadius: 8, border: 'none',
                          background: '#10b981', color: '#fff', fontWeight: 700,
                          fontSize: '0.85rem', cursor: 'pointer',
                        }}
                      >
                        Done — proceed with status change
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

    </React.Fragment>
  );
};

export default connect((state) => ({
  user: state.auth.currentUser,
}))(TicketsList);