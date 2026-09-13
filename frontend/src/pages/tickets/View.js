import React, { useMemo, useState, useEffect } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Dropdown, DropdownToggle, DropdownMenu, DropdownItem, Input } from 'reactstrap';
import Icon from '../../components/icon/Icon';
import Head from '../../layout/head/Head';
import Content from '../../layout/content/Content';
import { RSelect } from '../../components/Component';
import { ticketsApiUrl } from '../../helpers/ticketsApiBase';
import { resolveTicketRouterImageUrl } from '../../utils/ticketMediaUrl';
import { showError, showSuccess, showInfo, showWarning } from '../../utils/notifications';
import { announceTicketStatusChange } from '../../utils/staffNotifications';
import { formatTicketDateShort } from "../../utils/dateUtils";
import NearbyInfrastructure from './NearbyInfrastructure';
import InstallationCustomerCard from './InstallationCustomerCard';
import InventoryAPI from '../../helpers/InventoryAPI';
import {
  formatDropCableBalance,
  formatInventoryQty,
  formatTicketCableUsageLine,
  getCableRollNumberFromRow,
  getCableTypeLabel,
  getDropCableUsageLabel,
  getRollMetersFromItem,
  isDropCable,
  quantityLabelForItem,
} from '../../utils/inventoryCable';
import { useActivityLogger, ACTIVITY_TYPES, TARGET_TYPES } from '../../hooks/useActivityLogger';
import { TICKET_TYPES } from '../../config/ticketTypes';
import {
  fetchTeamInventoryBundle,
} from '../../utils/teamInventory';
import { buildPendingBalancesFromDisbursements } from '../../utils/inventoryBalances';
import './TicketView.css';

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

// Helper function to format timestamps to local time
const formatLocalTime = (timestamp) => {
  if (!timestamp || timestamp === '—') return '—';
  return formatTicketDateShort(timestamp);
};

// Add CSS styles for the reply card and modals
const replyCardStyles = `
  @keyframes fadeInScale {
    from {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.9);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }
  
  .editor-btn {
    background: none;
    border: 1px solid #e1e7f0;
    border-radius: 3px;
    padding: 6px 8px;
    cursor: pointer;
    font-size: 12px;
    color: #374151;
    transition: all 0.2s ease;
  }
  
  .editor-btn:hover {
    background-color: #f1f3f5;
    border-color: #d1d7e0;
  }
  
  .toolbar-separator {
    width: 1px;
    height: 20px;
    background-color: #e1e7f0;
    margin: 0 4px;
  }
  
  .bootstrap-tagsinput:focus-within {
    border-color: #357bf2;
    box-shadow: 0 0 0 2px rgba(53, 123, 242, 0.2);
  }
  
  .message-textarea:focus {
    outline: none;
  }
  
  .btn {
    font-size: 14px;
    font-weight: 500;
    padding: 8px 16px;
    border-radius: 4px;
    border: 1px solid;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .btn-primary {
    background-color: #357bf2;
    border-color: #357bf2;
    color: white;
  }
  
  .btn-primary:hover {
    background-color: #2563eb;
    border-color: #2563eb;
  }
  
  .btn-secondary {
    background-color: #6c757d;
    border-color: #6c757d;
    color: white;
  }
  
  .btn-outline-primary {
    background-color: transparent;
    border-color: #357bf2;
    color: #357bf2;
  }
  
  .btn-outline-primary:hover {
    background-color: #357bf2;
    color: white;
  }
  
  .btn-outline-secondary {
    background-color: transparent;
    border-color: #6c757d;
    color: #6c757d;
  }
  
  .dropdown-item {
    display: block;
    width: 100%;
    padding: 8px 16px;
    clear: both;
    font-weight: 400;
    color: #374151;
    text-align: inherit;
    white-space: nowrap;
    background-color: transparent;
    border: 0;
    text-decoration: none;
    cursor: pointer;
  }
  
  .dropdown-item:hover {
    background-color: #f8f9fb;
    color: #374151;
  }
  
  .dropdown-menu {
    background-color: white;
    border: 1px solid #e1e7f0;
    border-radius: 4px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    padding: 4px 0;
  }
  
  .dropdown-divider {
    height: 0;
    margin: 8px 0;
    overflow: hidden;
    border-top: 1px solid #f1f3f5;
  }
  
  /* React Select Styles */
  .react-select-container {
    font-size: 14px;
  }
  
  .react-select__control {
    border: 1px solid #e1e7f0 !important;
    border-radius: 4px !important;
    min-height: 40px !important;
    box-shadow: none !important;
    background-color: white !important;
  }
  
  .react-select__control:hover {
    border-color: #357bf2 !important;
  }
  
  .react-select__control--is-focused {
    border-color: #357bf2 !important;
    box-shadow: 0 0 0 1px #357bf2 !important;
  }
  
  .react-select__menu {
    border: 1px solid #e1e7f0 !important;
    border-radius: 4px !important;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1) !important;
    z-index: 9999 !important;
  }
  
  .react-select__menu-list {
    max-height: 200px !important;
    overflow-y: auto !important;
    padding: 4px 0 !important;
  }
  
  .react-select__option {
    padding: 8px 12px !important;
    cursor: pointer !important;
    font-size: 14px !important;
  }
  
  .react-select__option:hover {
    background-color: #f8f9fb !important;
    color: #374151 !important;
  }
  
  .react-select__option--is-selected {
    background-color: #357bf2 !important;
    color: white !important;
  }
  
  .react-select__option--is-focused {
    background-color: #f8f9fb !important;
    color: #374151 !important;
  }
  
  .react-select__multi-value {
    background-color: #f1f3f5 !important;
    border-radius: 3px !important;
    margin: 2px !important;
  }
  
  .react-select__multi-value__label {
    color: #374151 !important;
    font-size: 13px !important;
    padding: 3px 6px !important;
  }
  
  .react-select__multi-value__remove {
    color: #6b7280 !important;
    cursor: pointer !important;
  }
  
  .react-select__multi-value__remove:hover {
    background-color: #ef4444 !important;
    color: white !important;
  }
  
  .react-select__placeholder {
    color: #9ca3af !important;
    font-size: 14px !important;
  }
  
  .react-select__input-container {
    color: #374151 !important;
    font-size: 14px !important;
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = replyCardStyles;
  document.head.appendChild(styleElement);
}

// Helper function to format watchers for RSelect
const formatWatchersForSelect = (watchersData, watcherOptionsList) => {
  if (!watchersData) return [];
  
  let watchersList = [];
  if (typeof watchersData === 'string') {
    // If it's a comma-separated string, split it
    watchersList = watchersData.split(',').map(w => w.trim()).filter(w => w);
  } else if (Array.isArray(watchersData)) {
    watchersList = watchersData;
  }
  
  // Match with available options
  return watchersList.map(watcherValue => {
    const found = watcherOptionsList.find(opt => opt.value === watcherValue || opt.label.includes(watcherValue));
    return found || { value: watcherValue, label: watcherValue };
  });
};

const TicketView = () => {
  const location = useLocation();
  const params = useParams();
  const navigate = useNavigate();
  const user = useSelector(state => state.auth.currentUser);
  const isCustomerCreator = user?.all_roles?.some((role) => (role || '').toLowerCase() === 'customer-creator') &&
    !user?.all_roles?.some((role) => ['administrator', 'super-administrator', 'manager', 'technician', 'engineer'].includes((role || '').toLowerCase()));
  const isTechnician = user?.all_roles?.some((role) => (role || '').toLowerCase() === 'technician') &&
    !user?.all_roles?.some((role) => (role || '').toLowerCase() === 'administrator') &&
    !user?.all_roles?.some((role) => (role || '').toLowerCase() === 'super-administrator') &&
    !user?.all_roles?.some((role) => (role || '').toLowerCase() === 'manager');
  const isFieldRole = user?.all_roles?.some((role) =>
    ['technician', 'engineer'].includes((role || '').toLowerCase())
  );
  const logActivity = useActivityLogger();
  const isMountedRef = React.useRef(true);
  const autoSetAppliedRef = React.useRef(false);
  const pendingTypeChangeRef = React.useRef(null);
  const [loading, setLoading] = useState(true); // Start with loading=true to show loading state initially
  const [ticket, setTicket] = useState(null);
  const [msgList, setMsgList] = useState([]);
  const [showReplyCard, setShowReplyCard] = useState(false);
  const [showNoteCard, setShowNoteCard] = useState(false);
  const [showRouterCard, setShowRouterCard] = useState(false);
  const [showNearbyInfra, setShowNearbyInfra] = useState(false);
  // Inventory serial-search embedded in the router card
  const [invSearchResults, setInvSearchResults] = useState([]);
  const [invSearching, setInvSearching] = useState(false);
  const [invLinkedRouter, setInvLinkedRouter] = useState(null); // inventory item to link on save
  const [groupTeamRouters, setGroupTeamRouters] = useState([]); // roster team shared routers

  // Inventory items used on this ticket (non-router)
  const [invItems, setInvItems] = useState([]);           // available non-router items for dropdown
  const [invUsageLog, setInvUsageLog] = useState([]);     // items already logged for this ticket
  const [invUsageItem, setInvUsageItem] = useState(null); // selected item {id,name,category,qty_available}
  const [invUsageQty, setInvUsageQty] = useState(1);
  const [invUsageNotes, setInvUsageNotes] = useState("");
  const [invUsageLoading, setInvUsageLoading] = useState(false);
  const [showInvModal, setShowInvModal] = useState(false);
  const [dropCableItem, setDropCableItem] = useState(null);
  const [dropCableMeters, setDropCableMeters] = useState('');
  const [dropCableLoading, setDropCableLoading] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [customerLocation, setCustomerLocation] = useState({
    hasLocation: false,
    latitude: null,
    longitude: null,
    loading: false
  });
  const [actionsDropdown, setActionsDropdown] = useState(false);
  const [resolvedCreatorName, setResolvedCreatorName] = useState('');
  const getTicketCreatedMeta = (t) => {
    const raw = (t?.created_by || t?.createdBy || '').toString().trim();
    const customerName = (t?.customer_name || t?.customerName || formState.customer || 'Customer').toString();
    const desc = (t?.description || '').toString();

    const normalized = raw.replace(/^phone:\s*/i, '').trim();
    const digits = normalized.replace(/[^0-9]/g, '');
    const customerDigits = (t?.customer_phone || t?.customerPhone || '').toString().replace(/[^0-9]/g, '');
    const looksLikePhone = digits.length >= 9 && digits.length <= 15;
    const isCustomerPhone = looksLikePhone && customerDigits && digits.endsWith(customerDigits);

    // Some older tickets incorrectly stored created_by as customer phone,
    // but the real staff creator exists inside the description ("Created by: X").
    if (raw && raw.toLowerCase() !== 'unknown' && (raw.toLowerCase().startsWith('phone:') || isCustomerPhone)) {
      const match = desc.match(/created by:\s*([^\n\r]+)/i);
      const derived = (match?.[1] || '').trim();
      if (derived) {
        return { creatorName: derived, creatorKind: 'user', channel: 'Staff' };
      }
      return { creatorName: customerName, creatorKind: 'customer', channel: 'Portal' };
    }

    // Staff-created tickets: created_by is usually email/name; we can resolve email->name.
    if (resolvedCreatorName) return { creatorName: resolvedCreatorName, creatorKind: 'user', channel: 'Staff' };
    if (raw && raw.toLowerCase() !== 'unknown') {
      return { creatorName: formatAssignedToName(raw), creatorKind: 'user', channel: 'Staff' };
    }

    return { creatorName: customerName, creatorKind: 'customer', channel: 'Portal' };
  };
  const getTicketCreatorName = (t) => {
    if (resolvedCreatorName) return resolvedCreatorName;
    const raw = (t?.created_by || t?.createdBy || '').toString().trim();
    if (raw && raw.toLowerCase() !== 'unknown') {
      // Some older tickets store created_by as "Phone: 07..." or a phone string.
      // In that case, show the customer name instead of the phone label.
      const normalized = raw.replace(/^phone:\s*/i, '').trim();
      const digits = normalized.replace(/[^0-9]/g, '');
      const customerDigits = (t?.customer_phone || t?.customerPhone || '').toString().replace(/[^0-9]/g, '');
      const looksLikePhone = digits.length >= 9 && digits.length <= 15;
      const isCustomerPhone = looksLikePhone && customerDigits && digits.endsWith(customerDigits);
      if (raw.toLowerCase().startsWith('phone:') || isCustomerPhone) {
        const desc = (t?.description || '').toString();
        const match = desc.match(/created by:\s*([^\n\r]+)/i);
        const derived = (match?.[1] || '').trim();
        if (derived) return derived;
        return (t?.customer_name || t?.customerName || formState.customer || 'Customer').toString();
      }
      return formatAssignedToName(raw);
    }
    return (t?.customer_name || formState.customer || 'Customer').toString();
  };
  const [replyForm, setReplyForm] = useState({
    to: '',
    cc: '',
    bcc: '',
    message: '',
    attachments: [],
    showCc: false,
    showBcc: false,
    router: null // To store router info attached to reply
  });
  const [noteForm, setNoteForm] = useState({
    message: '',
    isPrivate: true,
    attachments: []
  });
  const [routerForm, setRouterForm] = useState({
    routerNumber: '',
    images: [],
    previewUrls: [],
    returnToReply: false // Flag to indicate if we should return to reply card after saving router
  });
  
  // State for dropdown options
  const [assignToOptions, setAssignToOptions] = useState([
    { value: "0", label: "Unassigned" }
  ]);
  const [watcherOptions, setWatcherOptions] = useState([]);
  
  const [formState, setFormState] = useState({
    subject: '',
    status: 'new',
    priority: 'low',
    type: 'Installation',
    assigned_to: { value: "0", label: "Unassigned" },
    group: 'Any',
    labels: '',
    note: '',
    hidden: false,
    customer: '',
    watchers: []
  });

  // State for tracking if splitters have been updated
  const [splittersUpdated, setSplittersUpdated] = useState(false);

  // Status popover state
  const [statusPopover, setStatusPopover] = useState({
    open: false,
    top: 0,
    left: 0,
    selected: ''
  });

  // Pre-status-change reminder (when moving away from "new")
  const [reminderModal, setReminderModal] = useState({ open: false, pendingStatus: null, step: "ask" }); // step: "ask" | "choose"

  // Load messages from API
  const loadMessages = async (ticketId) => {
    try {
      const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
      const response = await TicketsAPI.getMessages(ticketId);
      
      if (response && response.success && response.data) {
        const messages = response.data;
        console.log('Loaded messages from API:', messages);
        console.log('Raw messages data:', JSON.stringify(messages, null, 2));
        
        // Format messages for display
        const formattedMessages = messages.map((msg, index) => {
          if (msg.type === 'router') {
            // Router message - extract image URLs
            const imageUrls = (msg.images || []).map((img) => resolveTicketRouterImageUrl(img)).filter(Boolean);
            
            return {
              id: `router_${msg.id}`,
              author: msg.author || 'Technician',
              initial: (msg.author || 'T')[0].toUpperCase(),
              color: '#10b981',
              created: msg.created_at || '—',
              source: 'Router Info',
              email: msg.author_email || '',
              content: msg.message || `Router Added: ${msg.router_number}`,
              type: 'router',
              isRouter: true,
              router_number: msg.router_number,
              images: imageUrls
            };
          } else if (msg.type === 'note') {
            // Note message
            return {
              id: `note_${msg.id}`,
              author: msg.author || 'Admin',
              initial: (msg.author || 'A')[0].toUpperCase(),
              color: '#f59e0b',
              created: msg.created_at || '—',
              source: msg.is_private ? 'Private Note' : 'Note',
              email: msg.author_email || '',
              content: msg.message || '',
              type: 'note',
              isNote: true,
              isPrivate: msg.is_private
            };
          } else {
            // Reply message
            return {
              id: `reply_${msg.id}`,
              author: msg.author || 'Admin',
              initial: (msg.author || 'A')[0].toUpperCase(),
              color: '#357bf2',
              created: msg.created_at || '—',
              source: 'Reply',
              email: msg.author_email || '',
              content: msg.message || '',
              type: 'reply',
              to_email: msg.to_email,
              cc_email: msg.cc_email
            };
          }
        });
        
        // Add initial ticket description as first message if no messages
        if (formattedMessages.length === 0 && ticket) {
          const meta = getTicketCreatedMeta(ticket);
          const creator = meta.creatorName;
          formattedMessages.unshift({
            id: 'initial_1',
            author: creator,
            initial: (creator[0] || 'U').toUpperCase(),
            color: '#EC4899',
            created: ticket.created_at || '—',
            source: meta.channel,
            email: ticket.customer_email || '',
            content: ticket.description || ticket.subject || 'Ticket created'
          });
        }
        
        console.log('Formatted messages:', formattedMessages);
        // Log router messages specifically
        const routerMessages = formattedMessages.filter(m => m.isRouter);
        if (routerMessages.length > 0) {
          console.log('Router messages with images:', routerMessages);
        }
        
        if (isMountedRef.current) setMsgList(formattedMessages);
      } else {
        // No messages yet, create initial message
        if (ticket) {
          const meta = getTicketCreatedMeta(ticket);
          const creator = meta.creatorName;
          const initialMessage = [{
            id: 'initial_1',
            author: creator,
            initial: (creator[0] || 'U').toUpperCase(),
            color: '#EC4899',
            created: ticket.created_at || '—',
            source: meta.channel,
            email: ticket.customer_email || '',
            content: ticket.description || ticket.subject || 'Ticket created'
          }];
          if (isMountedRef.current) setMsgList(initialMessage);
        }
      }
    } catch (error) {
      console.error('Error loading messages:', error);
      // Create initial message on error
      if (ticket) {
        const meta = getTicketCreatedMeta(ticket);
        const creator = meta.creatorName;
        const initialMessage = [{
          id: 'initial_1',
          author: creator,
          initial: (creator[0] || 'U').toUpperCase(),
          color: '#EC4899',
          created: ticket.created_at || '—',
          source: meta.channel,
          email: ticket.customer_email || '',
          content: ticket.description || ticket.subject || 'Ticket created'
        }];
        if (isMountedRef.current) setMsgList(initialMessage);
      }
    }
  };

  // Resolve creator (email/phone) -> human name (no DB update).
  useEffect(() => {
    let cancelled = false;
    const raw = (ticket?.created_by || ticket?.createdBy || '').toString().trim();

    // Reset when missing/unknown or already a display name (no @ and no digits).
    const normalized = raw.replace(/^phone:\s*/i, '').trim();
    const digits = normalized.replace(/[^0-9]/g, '');
    const isSearchable = raw.includes('@') || digits.length >= 9;
    if (!raw || raw.toLowerCase() === 'unknown' || !isSearchable) {
      setResolvedCreatorName('');
      return;
    }

    (async () => {
      try {
        const { default: UsersAPI } = await import('../../helpers/UsersAPI');
        const query = raw.includes('@') ? raw : normalized;
        const resp = await UsersAPI.search(query);
        const list = resp?.data || resp?.users || resp?.results || [];
        const exact = Array.isArray(list)
          ? list.find((u) => {
              const email = (u?.email || '').toString().toLowerCase();
              const phone = (u?.phone || u?.phone_number || '').toString().replace(/[^0-9]/g, '');
              if (raw.includes('@')) return email === raw.toLowerCase();
              return phone && digits && phone.endsWith(digits);
            })
          : null;
        const name = (exact?.name || exact?.display_name || '').toString().trim();
        if (!cancelled) setResolvedCreatorName(name || '');
      } catch (e) {
        if (!cancelled) setResolvedCreatorName('');
      }
    })();

    return () => { cancelled = true; };
  }, [ticket?.created_by, ticket?.createdBy]);

  // Load ticket data - either from location state or API
  const loadTicketData = async (userOptions = null) => {
    try {
      let ticketData = null;
      
      // First check if we have data from navigation state
      if (location.state && location.state.ticket) {
        ticketData = location.state.ticket;
        console.log('Loading from navigation state:', ticketData);

        // If we navigated from a "slim" list payload, some fields (like created_by) may be missing.
        // Fetch full details only when needed (small + safe, not a massive update).
        const createdByRaw = (ticketData?.created_by || ticketData?.createdBy || '').toString().trim();
        const needsCreatedBy = !createdByRaw || createdByRaw.toLowerCase() === 'unknown';
        const idToFetch = ticketData?.id || params.id;
        if (needsCreatedBy && idToFetch) {
          try {
            const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
            const resp = await TicketsAPI.getById(idToFetch);
            if (resp && resp.success && resp.data) {
              ticketData = { ...resp.data, ...ticketData };
            }
          } catch (e) {
            // If the details fetch fails, keep the navigation payload.
          }
        }
        } else if (params.id) {
          // No state data, load from API using URL parameter
          console.log('Loading from API for ticket ID:', params.id);
          if (isMountedRef.current) setLoading(true);
          
          try {
            const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
            const response = await TicketsAPI.getById(params.id);
            console.log('RAW API RESPONSE:', JSON.stringify(response, null, 2));
            if (response && response.success && response.data) {
              ticketData = response.data;
              console.log('Loaded from API:', ticketData);
              console.log('Ticket number field:', ticketData.number);
            } else {
              throw new Error(response?.error || 'Failed to load ticket data');
            }
          } catch (error) {
            console.error('Error loading ticket from API:', error);
            if (isMountedRef.current) {
              showError('Error loading ticket: ' + error.message);
              navigate('/admin/tickets/list');
            }
            return;
          } finally {
            if (isMountedRef.current) setLoading(false);
          }
        } else {
          console.error('No ticket ID provided');
          navigate('/admin/tickets/list');
          return;
        }

        if (ticketData) {
          // Set ticket data
          if (isMountedRef.current) setTicket(ticketData);
          
          // Reset splitters updated flag for new ticket
          setSplittersUpdated(false);

          // Load inventory usage log for this ticket (non-blocking)
          const tId = ticketData?.id;
          if (tId) {
            InventoryAPI.getTicketUsage(tId).then(res => {
              if (isMountedRef.current) setInvUsageLog(Array.isArray(res?.data) ? res.data : []);
            }).catch(() => {});
            // Team inventory (roster group) or own disbursements
            if (user?.id) {
              loadTeamInventory().then(({ rows, routers }) => {
                if (!isMountedRef.current) return;
                setInvItems(buildUserItems(rows, isFieldRole));
                if (isFieldRole) setGroupTeamRouters(routers);
              }).catch(() => {});
            }
          }
          
          // Debug: Log all available fields in ticket data
          console.log('loadTicketData: All ticket fields available:', Object.keys(ticketData));
          console.log('loadTicketData: Full ticket data:', ticketData);
          
          // Set form state
          if (isMountedRef.current) {
            setFormState(prev => {
            // Format assigned_to for multi-select (could be JSON array or single value)
            let assignedToOption = [];
            if (ticketData.assignedTo || ticketData.assigned_to) {
              const assigneeValue = ticketData.assignedTo || ticketData.assigned_to;
              
              // Check if it's a JSON array
              let assigneeList = [];
              if (typeof assigneeValue === 'string' && assigneeValue.startsWith('[')) {
                try {
                  assigneeList = JSON.parse(assigneeValue);
                  if (!Array.isArray(assigneeList)) assigneeList = [assigneeValue];
                } catch (e) {
                  assigneeList = [assigneeValue];
                }
              } else if (Array.isArray(assigneeValue)) {
                assigneeList = assigneeValue;
              } else if (assigneeValue && assigneeValue !== "0") {
                assigneeList = [assigneeValue];
              }
              
              // Find each assignee in the available options
              if (userOptions && userOptions.assignOptions) {
                assignedToOption = assigneeList
                  .map(aVal => {
                    const found = userOptions.assignOptions.find(opt => opt.value === aVal || opt.label.includes(aVal));
                    return found || { value: aVal, label: aVal };
                  })
                  .filter(a => a.value !== "0");
              } else {
                assignedToOption = assigneeList
                  .map(aVal => ({ value: aVal, label: aVal }))
                  .filter(a => a.value !== "0");
              }
            }
            
            // Format watchers for RSelect
            let watchersOptions = [];
            if (ticketData.watchers || ticketData.watched_by) {
              const watchersData = ticketData.watchers || ticketData.watched_by;
              if (userOptions && userOptions.watcherOpts) {
                watchersOptions = formatWatchersForSelect(watchersData, userOptions.watcherOpts);
              } else {
                // Fallback formatting without user options
                let watchersList = [];
                if (typeof watchersData === 'string') {
                  watchersList = watchersData.split(',').map(w => w.trim()).filter(w => w);
                } else if (Array.isArray(watchersData)) {
                  watchersList = watchersData;
                }
                watchersOptions = watchersList.map(w => ({ value: w, label: w }));
              }
            }
            
            // Get the type label (prefer typeLabel, fallback to type)
            let typeValue = ticketData.typeLabel || ticketData.type || 'Installation';
            
            return {
              ...prev,
              subject: ticketData.subject || '',
              status: ticketData.status || 'new',
              priority: ticketData.priority || 'low',
              type: typeValue,
              assigned_to: assignedToOption,
              group: ticketData.group || 'Any',
              labels: ticketData.labels || '',
              note: ticketData.note || '',
              hidden: ticketData.hidden || false,
              customer: (ticketData.customer && ticketData.customer.name) || ticketData.customer_name || ticketData.phone || '',
              watchers: watchersOptions
            };
          });
          }

          // Done loading ticket data - set loading to false immediately
          if (isMountedRef.current) setLoading(false);
          
          // Load customer location in background (non-blocking)
          const customerId = ticketData?.customer_id || ticketData?.customerId || ticketData?.customer?.id || 
                           ticketData?.created_by_customer || ticketData?.customer_user_id;
          console.log('loadTicketData: Ticket data loaded:', ticketData);
          console.log('loadTicketData: Customer ID for location loading:', customerId);
          console.log('loadTicketData: Checking customer-related fields:', {
            customer_id: ticketData?.customer_id,
            customerId: ticketData?.customerId,
            customer: ticketData?.customer,
            created_by_customer: ticketData?.created_by_customer,
            customer_user_id: ticketData?.customer_user_id,
            customer_name: ticketData?.customer_name,
            customer_phone: ticketData?.customer_phone,
            customer_email: ticketData?.customer_email
          });
          
          if (customerId) {
            loadCustomerLocation(customerId).catch(err => {
              console.error('Error loading customer location:', err);
            });
          } else {
            console.log('loadTicketData: No customer ID found, this might be a new installation - location will be available after customer record is created');
            
            // Try to find customer by phone if available
            const customerPhone = ticketData?.customer?.phone || ticketData?.customer_phone || ticketData?.phone;
            if (customerPhone) {
              console.log('loadTicketData: No customer ID but phone available, trying to find customer by phone:', customerPhone);
              try {
                const { default: CustomersAPI } = await import('../../helpers/CustomersAPI');
                const searchResponse = await CustomersAPI.searchByPhone(customerPhone);
                
                if ((searchResponse.status === 'success' || searchResponse.success) && searchResponse.found && searchResponse.data) {
                  const foundCustomerId = searchResponse.data.id;
                  console.log('loadTicketData: Found customer by phone, loading location for ID:', foundCustomerId);
                  
                  // Mutate the loaded payload (state `ticket` may still be null here)
                  ticketData.customer_id = foundCustomerId;
                  if (ticketData.customer && typeof ticketData.customer === 'object') {
                    ticketData.customer = { ...ticketData.customer, id: foundCustomerId };
                  }
                  if (isMountedRef.current) {
                    setTicket((prev) => ({ ...(prev || ticketData), customer_id: foundCustomerId }));
                  }
                  
                  loadCustomerLocation(foundCustomerId).catch(err => {
                    console.error('Error loading customer location after phone search:', err);
                  });
                } else {
                  console.log('loadTicketData: Customer not found by phone, setting default no-location state');
                }
              } catch (phoneSearchError) {
                console.error('Error searching customer by phone:', phoneSearchError);
              }
            }
            
            // Set initial state to indicate this is a new customer
            setCustomerLocation({
              hasLocation: false,
              latitude: null,
              longitude: null,
              loading: false
            });
          }
          
          // Load messages in background (non-blocking)
          loadMessages(ticketData.id).catch(err => {
            console.error('Error loading messages:', err);
          });
        }
      } catch (error) {
        console.error('Error in loadTicketData:', error);
        if (isMountedRef.current) setLoading(false);
      }
  };

  // Function to load users by role from working API endpoints
  const loadUsersByRole = async () => {
    try {
      // Load assignment options (technicians and engineers)
      const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
      const technicians = await TicketsAPI.getAssignmentOptions();
      if (technicians && technicians.length > 0) {
        setAssignToOptions([{ value: "0", label: "Unassigned" }, ...technicians]);
      }
      
      // Load watcher options (managers and administrators)  
      const watchers = await TicketsAPI.getWatcherOptions();
      if (watchers && watchers.length > 0) {
        setWatcherOptions(watchers);
      }
      
      // Return the loaded options for immediate use
      return {
        assignOptions: [{ value: "0", label: "Unassigned" }, ...technicians],
        watcherOpts: watchers || []
      };
      
    } catch (error) {
      console.error('Error loading users from API:', error);
      return {
        assignOptions: [{ value: "0", label: "Unassigned" }],
        watcherOpts: []
      };
    }
  };

  // Load users when component mounts
  useEffect(() => {
    const initializeData = async () => {
      // Load user options and ticket data in parallel for better performance
      const userOptionsPromise = loadUsersByRole();
      const ticketDataPromise = loadTicketData(null); // Start loading immediately
      
      // Wait for both to complete
      const [userOptions] = await Promise.all([userOptionsPromise, ticketDataPromise]);
      
      // If ticket data came from state, update form with proper user options
      if (isMountedRef.current && location.state && location.state.ticket && userOptions) {
        const ticketData = location.state.ticket;
        setFormState(prev => {
          // Re-format assigned_to with loaded user options
          let assignedToOption = prev.assigned_to;
          if ((ticketData.assignedTo || ticketData.assigned_to) && userOptions.assignOptions) {
            const assigneeValue = ticketData.assignedTo || ticketData.assigned_to;
            const found = userOptions.assignOptions.find(opt => opt.value === assigneeValue || opt.label.includes(assigneeValue));
            if (found) assignedToOption = found;
          }
          
          // Re-format watchers with loaded user options
          let watchersOptions = prev.watchers;
          if ((ticketData.watchers || ticketData.watched_by) && userOptions.watcherOpts) {
            const watchersData = ticketData.watchers || ticketData.watched_by;
            watchersOptions = formatWatchersForSelect(watchersData, userOptions.watcherOpts);
          }
          
          return {
            ...prev,
            assigned_to: assignedToOption,
            watchers: watchersOptions
          };
        });
      }
    };
    
    initializeData();
    
    // Cleanup function to prevent state updates after unmount
    return () => {
      isMountedRef.current = false;
    };
  }, [location.state, params.id, navigate]);

  // Preload team inventory + routers (roster-first)
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { rows, routers } = await loadTeamInventory();
      if (!isMountedRef.current) return;
      setInvItems(buildUserItems(rows, isFieldRole));
      if (isFieldRole) setGroupTeamRouters(routers);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isFieldRole, ticket?.id]);

  // Show full team router list when opening the router card
  useEffect(() => {
    if (!showRouterCard || !isFieldRole) return;
    setInvSearchResults(groupTeamRouters);
  }, [showRouterCard, groupTeamRouters, isFieldRole]);

  // If navigated from the list with an intended completion status, apply it automatically.
  useEffect(() => {
    const desired = location.state?.autoSetStatus;
    if (!desired) return;
    if (!ticket?.id) return;

    // Run once per navigation state
    if (autoSetAppliedRef.current) return;
    autoSetAppliedRef.current = true;

    // Defer to let the UI paint first
    setTimeout(() => {
      selectStatus(desired);
    }, 50);
  }, [location.state, ticket?.id]);

  const handleFormChange = (field, value) => {
    if (field === 'type' && !isTechnician && !isCustomerCreator) {
      // When changing type from the sidebar, the current "old" value is the form value,
      // not always what exists on the `ticket` object.
      const oldType = (formState.type || ticket?.typeLabel || ticket?.type || '').toString();
      const newType = (value || '').toString();
      if (oldType && newType && oldType.toLowerCase() !== newType.toLowerCase()) {
        const ok = window.confirm(`Are you sure you want to change the ticket type?\n\n${oldType} → ${newType}`);
        if (!ok) return;
        pendingTypeChangeRef.current = { oldType, newType };
      }
    }
    setFormState(prev => ({ ...prev, [field]: value }));
  };

  // Open status popover
  const openStatusPopover = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const popoverWidth = 280;
    
    const desiredLeft = rect.left + rect.width / 2 - popoverWidth / 2;
    const left = Math.max(8, Math.min(window.innerWidth - popoverWidth - 8, desiredLeft));
    const top = rect.bottom + 10;
    
    setStatusPopover({
      open: true,
      top,
      left,
      selected: ticket?.status || formState.status
    });
  };

  // Close status popover
  const closeStatusPopover = () => {
    setStatusPopover(prev => ({ ...prev, open: false }));
  };

  // Perform the actual status update (called after any reminder/validation)
  const doStatusChange = async (value) => {
    if (!ticket || !ticket.id) {
      showError('Error: No ticket data available');
      return;
    }

    try {
      setLoading(true);
      const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
      const updatePayload = { status: value };
      const response = await TicketsAPI.update(ticket.id, updatePayload);
      if (response.success) {
        setTicket(prev => ({ ...prev, status: value }));
        setFormState(prev => ({ ...prev, status: value }));
        showSuccess('Status updated successfully');
        announceTicketStatusChange();
        if (isTechnician && (ticket.status || '').toLowerCase() === 'new' && value.toLowerCase() !== 'new') {
          setTimeout(() => navigate('/admin/tickets/list'), 1200);
        }
      } else {
        showError(response.message || 'Failed to update status');
      }
    } catch (err) {
      showError('Error updating status');
    } finally {
      setLoading(false);
    }
  };

  // Update status from popover — intercepts "new → other" to show checklist reminder
  const selectStatus = async (value) => {
    if (!ticket || !ticket.id) {
      showError('Error: No ticket data available');
      closeStatusPopover();
      return;
    }

    closeStatusPopover();

    // Show reminder when moving away from "new"
    const currentStatus = (ticket.status || formState.status || '').toLowerCase();
    if (currentStatus === 'new' && value.toLowerCase() !== 'new') {
      setReminderModal({ open: true, pendingStatus: value, step: 'ask' });
      return;
    }

    await doStatusChange(value);
  };

  // Legacy handler kept for old call sites — delegates to selectStatus

  const handleUpdateTicket = async () => {
    if (!ticket || !ticket.id) {
      showError('Error: No ticket data available');
      return;
    }

    setLoading(true);
    try {
      const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
      const oldType = (pendingTypeChangeRef.current?.oldType || ticket?.typeLabel || ticket?.type || '').toString();
      const newType = (pendingTypeChangeRef.current?.newType || formState.type || '').toString();
      
      // Handle multiple assignees - convert array of selections to JSON
      let assignedToValue = "0";
      if (Array.isArray(formState.assigned_to) && formState.assigned_to.length > 0) {
        // Multiple selection - store as JSON array
        assignedToValue = JSON.stringify(formState.assigned_to.map(a => a.value));
      } else if (formState.assigned_to?.value) {
        // Single selection
        assignedToValue = formState.assigned_to.value;
      }
      
      const updatePayload = {
        subject: formState.subject,
        status: formState.status,
        priority: formState.priority,
        ...(isTechnician ? {} : {
          type: formState.type,
          assignedTo: assignedToValue,
        }),
        group: formState.group,
        labels: formState.labels,
        note: formState.note,
        hidden: formState.hidden,
        watchedBy: Array.isArray(formState.watchers) && formState.watchers.length > 0 
          ? formState.watchers.map(watcher => watcher.value || watcher).join(',')
          : ''
      };
      
      const response = await TicketsAPI.update(ticket.id, updatePayload);
      if (response.success) {
        // Audit note for type changes (non-technicians)
        try {
          if (!isTechnician && oldType && newType && oldType.toLowerCase() !== newType.toLowerCase()) {
            const actor = user?.name || user?.email || 'Unknown user';
            const noteResp = await TicketsAPI.addNote(ticket.id, {
              message: `Ticket type changed: ${oldType} → ${newType} (by ${actor})`,
              isPrivate: true,
              user_id: user?.id,
              user_name: user?.name,
              user_email: user?.email
            });
            pendingTypeChangeRef.current = null;
            // Make the note appear immediately (and then refresh to stay consistent)
            if (noteResp && noteResp.success && noteResp.data) {
              const msg = noteResp.data;
              const formattedNote = {
                id: `note_${msg.id}`,
                author: msg.author || actor,
                initial: ((msg.author || actor || 'A')[0] || 'A').toUpperCase(),
                color: '#f59e0b',
                created: msg.created_at || new Date().toISOString(),
                source: msg.is_private ? 'Private Note' : 'Note',
                email: msg.author_email || user?.email || '',
                content: msg.message || '',
                type: 'note',
                isNote: true,
                isPrivate: !!msg.is_private
              };
              if (isMountedRef.current) {
                setMsgList((prev) => Array.isArray(prev) ? [...prev, formattedNote] : [formattedNote]);
              }
            }
            loadMessages(ticket.id).catch(() => {});
          }
        } catch (e) {
          console.warn('Failed to add audit note for type change', e);
        }
        // Update local ticket data with the updated values
        setTicket(prev => ({
          ...prev,
          subject: formState.subject,
          status: formState.status,
          priority: formState.priority,
          ...(isTechnician ? {} : {
            type: formState.type,
            typeLabel: formState.type,
            assignedTo: assignedToValue,
            assigned_to: assignedToValue,
          }),
          group: formState.group,
          labels: formState.labels,
          note: formState.note,
          hidden: formState.hidden,
          watchedBy: formState.watchers,
          watched_by: formState.watchers
        }));
        // no-op: using multi-select dropdown
        
        // Log the ticket update activity
        await logActivity(
          ACTIVITY_TYPES.TICKET_UPDATED,
          `Updated ticket #${ticket.id}: ${ticket.subject}`,
          TARGET_TYPES.TICKET,
          ticket.id
        );
        
        showSuccess('Ticket updated successfully');
      } else {
        throw new Error(response.error || 'Update failed');
      }
    } catch (e) {
      console.error('Error updating ticket', e);
      showError('Error updating ticket: ' + (e.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleReply = () => {
    // Pre-populate the reply form with customer email
    const customerEmail = ticket?.customer_email || 
                         (ticket?.customer && ticket.customer.email) || 
                         'customer@example.com';
    
    setReplyForm(prev => ({
      ...prev,
      to: customerEmail,
      message: '',
      cc: '',
      bcc: '',
      showCc: false,
      showBcc: false
    }));
    setShowReplyCard(true);
    // Hide other cards if open
    setShowNoteCard(false);
    setShowRouterCard(false);
    // Lock body scroll
    document.body.style.overflow = 'hidden';
  };

  const handleAddNote = () => {
    setNoteForm({
      message: '',
      isPrivate: true,
      attachments: []
    });
    setShowNoteCard(true);
    // Hide other cards if open
    setShowReplyCard(false);
    setShowRouterCard(false);
    // Lock body scroll
    document.body.style.overflow = 'hidden';
  };

  const loadTeamInventory = async () => {
    if (!user?.id) {
      return { rows: [], routers: [] };
    }
    try {
      const { ticketsHttp: http } = await import('../../helpers/ticketsHttp');
      return await fetchTeamInventoryBundle({
        http,
        InventoryAPI,
        userId: user.id,
        isFieldRole,
      });
    } catch {
      return { rows: [], routers: [] };
    }
  };

  const handleAddRouter = async () => {
    setRouterForm({
      routerNumber: '',
      images: [],
      previewUrls: [],
      returnToReply: false,
    });
    setInvLinkedRouter(null);
    setInvSearchResults([]);
    setShowRouterCard(true);
    setShowReplyCard(false);
    setShowNoteCard(false);
    document.body.style.overflow = 'hidden';

    if (isFieldRole) {
      const { rows, routers } = await loadTeamInventory();
      if (isMountedRef.current) {
        setInvItems(buildUserItems(rows, isFieldRole));
        setGroupTeamRouters(routers);
        setInvSearchResults(routers);
      }
    }
  };

  // Function to load customer location
  const loadCustomerLocation = async (customerId) => {
    if (!customerId) {
      console.log('loadCustomerLocation: No customer ID provided');
      return;
    }
    
    console.log('loadCustomerLocation: Loading location for customer ID:', customerId);
    setCustomerLocation(prev => ({ ...prev, loading: true }));
    
    try {
      const { default: CustomersAPI } = await import('../../helpers/CustomersAPI');
      const response = await CustomersAPI.getCustomerLocation(customerId);
      
      console.log('loadCustomerLocation: API response:', response);
      
      if (response.status === 'success') {
        const newLocationState = {
          hasLocation: response.has_location,
          latitude: response.latitude,
          longitude: response.longitude,
          loading: false
        };
        console.log('loadCustomerLocation: Setting location state:', newLocationState);
        setCustomerLocation(newLocationState);
        console.log('loadCustomerLocation: Location state should be updated now');
      } else {
        console.log('loadCustomerLocation: API returned error:', response);
        setCustomerLocation({
          hasLocation: false,
          latitude: null,
          longitude: null,
          loading: false
        });
      }
    } catch (error) {
      console.error('Error loading customer location:', error);
      setCustomerLocation({
        hasLocation: false,
        latitude: null,
        longitude: null,
        loading: false
      });
    }
  };

  // Handler to add/update customer location
  const handleAddCustomerLocation = async () => {
    // Enhanced validation - check multiple possible customer ID fields
    let customerId = ticket?.customer_id || ticket?.customerId || ticket?.customer?.id;
    
    console.log('handleAddCustomerLocation: Ticket data:', ticket);
    console.log('handleAddCustomerLocation: Customer ID found:', customerId);
    
    if (!ticket) {
      showError('Ticket information not available');
      return;
    }
    
    if (!customerId) {
      // For new installations, try to create/link customer first
      const customerName = ticket?.customer?.name || ticket?.customer_name || ticket?.customer;
      const customerPhone = ticket?.customer?.phone || ticket?.customer_phone || ticket?.phone;
      const customerEmail = ticket?.customer?.email || ticket?.customer_email;
      
      if (customerName || customerPhone) {
        showInfo('Creating customer record for new installation...');
        console.log('Attempting to create customer record for:', { customerName, customerPhone, customerEmail });
        
        try {
          // Try to create or find customer first
          const { default: CustomersAPI } = await import('../../helpers/CustomersAPI');
          
          // Try to find customer by phone first
          if (customerPhone) {
            try {
              console.log('Searching for customer by phone:', customerPhone);
              const searchResponse = await CustomersAPI.searchByPhone(customerPhone);
              console.log('Phone search response:', searchResponse);
              
              if ((searchResponse.status === 'success' || searchResponse.success) && searchResponse.found && searchResponse.data) {
                customerId = searchResponse.data.id;
                console.log('Found existing customer by phone:', customerId);
                
                // Update ticket with customer ID both locally and in database
                ticket.customer_id = customerId;
                
                try {
                  // Update ticket in database to link customer
                  const { ticketsHttp: http } = await import('../../helpers/ticketsHttp');
                  await http.put(`/update-ticket/${ticket.id}`, {
                    customer_id: customerId
                  });
                  console.log('Ticket updated in database with customer ID:', customerId);
                } catch (updateError) {
                  console.error('Failed to update ticket in database:', updateError);
                  // Continue anyway - we have the customer ID locally
                }
                
                showSuccess(`Linked to existing customer: ${searchResponse.data.name}`);
              } else if ((searchResponse.status === 'success' || searchResponse.success) && searchResponse.data) {
                // Handle case where data exists but found flag might not be set
                customerId = searchResponse.data.id;
                console.log('Found existing customer by phone (alt check):', customerId);
                
                // Update ticket with customer ID both locally and in database
                ticket.customer_id = customerId;
                
                try {
                  // Update ticket in database to link customer
                  const { ticketsHttp: http } = await import('../../helpers/ticketsHttp');
                  await http.put(`/update-ticket/${ticket.id}`, {
                    customer_id: customerId
                  });
                  console.log('Ticket updated in database with customer ID:', customerId);
                } catch (updateError) {
                  console.error('Failed to update ticket in database:', updateError);
                  // Continue anyway - we have the customer ID locally
                }
                
                showSuccess(`Linked to existing customer: ${searchResponse.data.name}`);
              }
            } catch (searchError) {
              console.log('Customer search by phone failed:', searchError);
              
              // Try alternative search - maybe the phone format is different
              try {
                // Try with different phone formats
                const cleanPhone = customerPhone.replace(/\D/g, ''); // Remove non-digits
                const altFormats = [
                  cleanPhone,
                  '0' + cleanPhone.slice(1), // Ensure leading zero
                  '+254' + cleanPhone.slice(1), // Kenya format
                  '254' + cleanPhone.slice(1)  // Kenya without +
                ];
                
                for (const phoneFormat of altFormats) {
                  try {
                    console.log('Trying phone format:', phoneFormat);
                    const altSearchResponse = await CustomersAPI.searchByPhone(phoneFormat);
                    if (altSearchResponse.status === 'success' && altSearchResponse.data) {
                      customerId = altSearchResponse.data.id;
                      console.log('Found customer with alternative phone format:', phoneFormat, customerId);
                      ticket.customer_id = customerId;
                      showSuccess(`Found existing customer: ${altSearchResponse.data.name}`);
                      break;
                    }
                  } catch (altError) {
                    console.log('Alternative phone format failed:', phoneFormat);
                  }
                }
              } catch (altSearchError) {
                console.log('All phone search attempts failed');
              }
            }
          }
          
          // If still no customer ID, create new customer
          if (!customerId) {
            // Clean and validate the customer data
            const cleanName = customerName && customerName !== 'Phone: ' + customerPhone 
              ? customerName 
              : customerPhone 
                ? `Customer ${customerPhone}`
                : `Ticket ${ticket.number} Customer`;
            
            const cleanPhone = customerPhone ? customerPhone.replace(/\D/g, '') : ''; // Remove non-digits
            const cleanEmail = customerEmail && customerEmail.includes('@') ? customerEmail : '';
            
            const newCustomerData = {
              name: cleanName,
              phone_number: cleanPhone,
              email: cleanEmail || undefined, // Don't send empty string
              password: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) // Random password
            };
            
            // Remove empty fields to avoid validation issues
            Object.keys(newCustomerData).forEach(key => {
              if (newCustomerData[key] === '' || newCustomerData[key] === undefined) {
                delete newCustomerData[key];
              }
            });
            
            console.log('Creating new customer with cleaned data:', newCustomerData);
            const createResponse = await CustomersAPI.create(newCustomerData);
            
            console.log('Customer creation response:', createResponse);
            
            // Resolve created customer from any known API response shape
            const resolvedCustomer =
              createResponse?.customer ||
              createResponse?.data?.customer ||
              createResponse?.data ||
              null;

            if (resolvedCustomer?.id) {
              customerId = resolvedCustomer.id;
              const resolvedName = resolvedCustomer.name || cleanName;
              console.log('Created/Resolved customer ID:', customerId);

              // Update local ticket state (avoid relying only on direct object mutation)
              ticket.customer_id = customerId;
              ticket.customer_name = resolvedName;
              setTicket(prev => prev ? ({
                ...prev,
                customer_id: customerId,
                customer_name: resolvedName
              }) : prev);

              // Persist ticket-customer link in backend
              try {
                const { ticketsHttp: http } = await import('../../helpers/ticketsHttp');
                await http.put(`/update-ticket/${ticket.id}`, { customer_id: customerId });
                console.log('Ticket updated in database with customer ID:', customerId);
              } catch (updateError) {
                console.error('Failed to update ticket in database:', updateError);
              }

              showSuccess(`Customer ready: ${resolvedName} (ID: ${customerId})`);
            } else if (customerPhone) {
              // Final lightweight fallback: one clean phone search (handles APIs that omit payload ID)
              const fallbackSearch = await CustomersAPI.searchByPhone(customerPhone.replace(/\D/g, ''));
              if ((fallbackSearch?.status === 'success' || fallbackSearch?.success) && fallbackSearch?.data?.id) {
                customerId = fallbackSearch.data.id;
                ticket.customer_id = customerId;
                setTicket(prev => prev ? ({ ...prev, customer_id: customerId }) : prev);
                showSuccess(`Customer linked: ${fallbackSearch.data.name} (ID: ${customerId})`);
              } else {
                throw new Error('Customer was created but customer ID could not be resolved');
              }
            } else {
              throw new Error(createResponse?.message || 'Failed to create customer');
            }
          }
        } catch (error) {
          console.error('Error creating/finding customer:', error);
          
          // Show detailed error information
          let errorMessage = 'Failed to create customer record: ';
          if (error.response && error.response.data) {
            console.log('Validation errors:', error.response.data);
            // Handle validation errors from API
            if (typeof error.response.data === 'object') {
              const errors = Object.entries(error.response.data)
                .map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`)
                .join(' | ');
              errorMessage += errors;
              
              // Special handling for phone_number already exists error
              if (error.response.data.phone_number && error.response.data.phone_number.some(msg => msg.includes('already been taken'))) {
                showInfo('Customer with this phone number already exists. Searching database...');
                
                // Try direct database search for this phone number
                try {
                  const { ticketsHttp: http } = await import('../../helpers/ticketsHttp');
                  const cleanPhone = customerPhone.replace(/\D/g, '');
                  const dbSearchResponse = await http.get('/list-customers', {
                    params: { q: customerPhone, per_page: 50 }
                  });
                  
                  if (dbSearchResponse.data.success && dbSearchResponse.data.data && dbSearchResponse.data.data.length > 0) {
                    const foundCustomer = dbSearchResponse.data.data.find(c => 
                      c.phone_number === customerPhone || 
                      c.phone_number === cleanPhone ||
                      (c.phone_number && c.phone_number.replace(/\D/g, '') === cleanPhone)
                    );
                    
                    if (foundCustomer) {
                      customerId = foundCustomer.id;
                      ticket.customer_id = customerId;
                      showSuccess(`Found existing customer: ${foundCustomer.name} (ID: ${customerId})`);
                      
                      // Continue with location capture
                      await handleLocationCapture(customerId);
                      return;
                    }
                  }
                } catch (dbSearchError) {
                  console.error('Database search also failed:', dbSearchError);
                }
                
                showError('Customer exists but could not be located. Please contact support.');
                return;
              }
            } else {
              errorMessage += error.response.data.message || error.response.data;
            }
          } else {
            errorMessage += error.message || error;
          }
          
          showError(errorMessage);
          return;
        }
      } else {
        showError('Customer information not available. Cannot create customer record.');
        return;
      }
    }

    // Continue with location capture
    await handleLocationCapture(customerId);
  };

  // Separate function for location capture
  const handleLocationCapture = async (customerId) => {
    if (!navigator.geolocation) {
      showError('Geolocation is not supported by your browser');
      setSavingLocation(false);
      return;
    }

    setSavingLocation(true);
    showSuccess('Requesting location access...');
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const accuracy = position.coords.accuracy;
        
        showSuccess(`Location detected (±${Math.round(accuracy)}m accuracy). Saving...`);
        
        try {
          const { default: CustomersAPI } = await import('../../helpers/CustomersAPI');
          
          // Update customer location
          const response = await CustomersAPI.updateCustomerLocation(customerId, {
            latitude: latitude,
            longitude: longitude
          });

          if (response.status === 'success' || response.success) {
            showSuccess(`Customer location saved: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
            
            // Reload customer location from API to ensure consistency
            console.log('Location saved successfully, reloading customer location for ID:', customerId);
            await loadCustomerLocation(customerId);
            console.log('Customer location reloaded, current state:', customerLocation);
            
            // Automatically add a note to the ticket about the location update
            try {
              const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
              const noteContent = `📍 Customer location updated to: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (Accuracy: ±${Math.round(accuracy)} meters)`;
              
              await TicketsAPI.addNote(ticket.id, {
                message: noteContent,
                isPrivate: false,
                createdBy: user?.email || user?.username || 'system'
              });
              
              // Reload ticket to show the new note
              await loadTicketData();
              console.log('Ticket reloaded after location save');
            } catch (noteError) {
              console.log('Note not added automatically:', noteError);
              // Note failed but location saved - still show success
            }
          } else {
            showError(response.message || 'Failed to save customer location');
          }
        } catch (error) {
          console.error('Error saving customer location:', error);
          const errorMsg = error.response?.data?.message || error.message || 'Failed to save customer location';
          showError(errorMsg);
        } finally {
          setSavingLocation(false);
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
        let errorMsg = 'Location access denied or unavailable';
        switch(error.code) {
          case error.PERMISSION_DENIED:
            errorMsg = 'Location access denied. Please enable location permissions in your browser.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMsg = 'Location information unavailable. Please check your device GPS.';
            break;
          case error.TIMEOUT:
            errorMsg = 'Location request timed out. Please try again.';
            break;
        }
        showError(errorMsg);
        setSavingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  // Handler to navigate to customer location
  const handleNavigateToLocation = () => {
    if (customerLocation.hasLocation && customerLocation.latitude && customerLocation.longitude) {
      const lat = customerLocation.latitude;
      const lng = customerLocation.longitude;
      const googleMapsUrl = `https://maps.google.com/maps?q=${lat},${lng}&ll=${lat},${lng}&z=17`;
      
      // Open in new tab
      window.open(googleMapsUrl, '_blank');
      showSuccess('Opened location in Google Maps');
    } else {
      showError('Customer location not available');
    }
  };

  // Handler to update customer location (same as add but with different messaging)
  const handleUpdateCustomerLocation = async () => {
    setSavingLocation(true);
    showSuccess('Getting new location...');
    await handleAddCustomerLocation();
  };

  // Handler to open Add Router from Reply card
  const handleAddRouterFromReply = async () => {
    setRouterForm({
      routerNumber: '',
      images: [],
      previewUrls: [],
      returnToReply: true,
    });
    setInvLinkedRouter(null);
    setInvSearchResults([]);
    setShowRouterCard(true);
    setShowReplyCard(false);
    document.body.style.overflow = 'hidden';
    if (isFieldRole) {
      const { rows, routers } = await loadTeamInventory();
      if (isMountedRef.current) {
        setInvItems(buildUserItems(rows, isFieldRole));
        setGroupTeamRouters(routers);
        setInvSearchResults(routers);
      }
    }
  };

  const handleDeleteMessage = (messageId) => {
    if (window.confirm('Are you sure you want to delete this message?')) {
      setMsgList(prev => prev.filter(m => m.id !== messageId));
      showSuccess('Message deleted');
    }
  };

  const handleEditMessage = (messageId) => {
    const message = msgList.find(m => m.id === messageId);
    if (message) {
      const newContent = window.prompt('Edit message:', message.content);
      if (newContent && newContent.trim()) {
        setMsgList(prev => prev.map(m => m.id === messageId ? { ...m, content: newContent } : m));
        showSuccess('Message updated');
      }
    }
  };

  const handleMailMessage = (messageId) => {
    const message = msgList.find(m => m.id === messageId);
    if (message) {
      showInfo(`Would send email to: ${message.email}`);
    }
  };

  const handleCopyLink = (messageId) => {
    const link = `${window.location.origin}/admin/tickets/view/${ticket.id}#message-${messageId}`;
    navigator.clipboard.writeText(link).then(() => {
      showSuccess('Link copied to clipboard');
    });
  };

  // Reply form handlers
  const handleReplyFormChange = (field, value) => {
    setReplyForm(prev => ({ ...prev, [field]: value }));
  };

  const handleNoteFormChange = (field, value) => {
    setNoteForm(prev => ({ ...prev, [field]: value }));
  };

  const handleReplyFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setReplyForm(prev => ({
      ...prev,
      attachments: [...prev.attachments, ...selectedFiles]
    }));
    e.target.value = '';
  };

  const handleNoteFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setNoteForm(prev => ({
      ...prev,
      attachments: [...prev.attachments, ...selectedFiles]
    }));
    e.target.value = '';
  };

  const handleRemoveReplyFile = (index) => {
    setReplyForm(prev => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index)
    }));
  };

  const handleRemoveNoteFile = (index) => {
    setNoteForm(prev => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index)
    }));
  };

  const convertFileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleShowCc = () => {
    setReplyForm(prev => ({ ...prev, showCc: !prev.showCc }));
  };

  const handleShowBcc = () => {
    setReplyForm(prev => ({ ...prev, showBcc: !prev.showBcc }));
  };

  const handleSendReply = async (andSetStatus = null) => {
    if (!replyForm.message.trim()) {
      showWarning('Please enter a message');
      return;
    }

    if (!ticket || !ticket.id) {
      showError('Error: No ticket data available');
      return;
    }

    try {
      setLoading(true);
      
      // Convert attachments to base64 if any
      let attachments = [];
      if (replyForm.attachments && replyForm.attachments.length > 0) {
        attachments = await Promise.all(
          replyForm.attachments.map(async (file) => ({
            name: file.name,
            type: file.type,
            size: file.size,
            base64: await convertFileToBase64(file)
          }))
        );
      }

      // Prepare reply data for API
      // Prepare reply message (include router info if attached)
      let fullMessage = replyForm.message;
      if (replyForm.router) {
        fullMessage += `\n\n[Router Information]\nRouter Number: ${replyForm.router.routerNumber}\nImages: ${replyForm.router.images.length} attached`;
      }
      
      const replyData = {
        message: fullMessage,
        to: replyForm.to || ticket.customer_email || 'customer@example.com',
        cc: replyForm.cc,
        bcc: replyForm.bcc,
        status: andSetStatus || formState.status,
        user_id: user?.id || 1, // Get from auth context
        user_name: user?.name || 'Admin',
        user_email: user?.email || '',
        router: replyForm.router, // Include router data if present
        attachments: attachments
      };

      // Send reply to database via API
      const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
      const response = await TicketsAPI.addReply(ticket.id, replyData);
      
      if (response.success || response.data) {
        // Update ticket status if specified
        if (andSetStatus) {
          setFormState(prev => ({ ...prev, status: andSetStatus }));
          setTicket(prev => ({ ...prev, status: andSetStatus }));
        }

        // Clear reply form
        setReplyForm({
          to: '',
          cc: '',
          bcc: '',
          message: '',
          attachments: [],
          showCc: false,
          showBcc: false,
          router: null
        });
        
        setShowReplyCard(false);
        // Unlock body scroll
        document.body.style.overflow = 'auto';
        
        // Reload messages from API
        await loadMessages(ticket.id);
        
        showSuccess('Reply sent successfully!');
      } else {
        throw new Error(response.error || 'Failed to send reply');
      }
    } catch (error) {
      console.error('Error sending reply:', error);
      showError('Error sending reply: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleSendNote = async () => {
    if (!noteForm.message.trim()) {
      showWarning('Please enter a note message');
      return;
    }

    if (!ticket || !ticket.id) {
      showError('Error: No ticket data available');
      return;
    }

    try {
      setLoading(true);
      
      // Convert attachments to base64 if any
      let attachments = [];
      if (noteForm.attachments && noteForm.attachments.length > 0) {
        attachments = await Promise.all(
          noteForm.attachments.map(async (file) => ({
            name: file.name,
            type: file.type,
            size: file.size,
            base64: await convertFileToBase64(file)
          }))
        );
      }

      // Prepare note data for API
      const noteData = {
        message: noteForm.message,
        isPrivate: noteForm.isPrivate,
        user_id: user?.id || 1, // Get from auth context
        user_name: user?.name || 'Admin',
        user_email: user?.email || '',
        attachments: attachments
      };

      // Send note to database via API
      const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
      const response = await TicketsAPI.addNote(ticket.id, noteData);
      
      if (response.success || response.data) {
        // Clear note form
        setNoteForm({
          message: '',
          isPrivate: false,
          attachments: []
        });
        
        setShowNoteCard(false);
        // Unlock body scroll
        document.body.style.overflow = 'auto';
        
        // Reload messages from API
        await loadMessages(ticket.id);
        
        showSuccess(`${noteForm.isPrivate ? 'Private note' : 'Note'} added successfully!`);
      } else {
        throw new Error(response.error || 'Failed to add note');
      }
    } catch (error) {
      console.error('Error adding note:', error);
      showError('Error adding note: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  // Action Handlers
  const handleTicketAction = (action) => {
    switch (action) {
      case 'close':
        handleCloseTicket();
        break;
      case 'archive':
        handleArchiveTicket();
        break;
      case 'delete':
        handleDeleteTicket();
        break;
      case 'duplicate':
        handleDuplicateTicket();
        break;
      case 'merge':
        handleMergeTicket();
        break;
      case 'split':
        handleSplitTicket();
        break;
      case 'convert':
        handleConvertTicket();
        break;
      default:
        console.log('Unknown action:', action);
    }
    setActionsDropdown(false);
  };

  const handleCloseTicket = () => {
    if (window.confirm('Are you sure you want to close this ticket?')) {
      try {
        setLoading(true);
        setFormState(prev => ({ ...prev, status: 'closed' }));
        window.alert('Ticket closed successfully');
        // Optionally navigate back to list
        // navigate('/tickets');
      } catch (error) {
        console.error('Error closing ticket:', error);
        window.alert('Error closing ticket');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleArchiveTicket = async () => {
    const reason = window.prompt('Enter reason for archiving (optional):');
    if (reason !== null) { // null means user canceled
      try {
        setLoading(true);
        
        // Archive via API
        const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
        await TicketsAPI.archive(ticket.id, reason);
        
        // Update ticket status to archived
        setFormState(prev => ({ 
          ...prev, 
          status: 'archived',
          archived_at: new Date().toISOString(),
          archive_reason: reason || 'No reason provided'
        }));
        
        window.alert('Ticket archived successfully and moved to archive list');
        setTimeout(() => {
          navigate('/admin/tickets/archive'); // Navigate to archive list
        }, 500);
      } catch (error) {
        console.error('Error archiving ticket:', error);
        window.alert('Error archiving ticket. Please try again.');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleDeleteTicket = async () => {
    if (window.confirm('Are you sure you want to delete this ticket? This action cannot be undone.')) {
      try {
        setLoading(true);
        
        // Import TicketsAPI dynamically
        const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
        
        // Call API to delete the ticket
        await TicketsAPI.delete(ticket.id);
        
        window.alert('Ticket deleted successfully');
        navigate('/admin/tickets'); // Navigate back to list
      } catch (error) {
        console.error('Error deleting ticket:', error);
        window.alert('Error deleting ticket. Please try again.');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleDuplicateTicket = () => {
    try {
      setLoading(true);
      // In real app, create new ticket with same data
      const newTicketId = Math.floor(Math.random() * 10000) + 1000;
      window.alert(`Ticket duplicated successfully. New ticket ID: #${newTicketId}`);
      navigate(`/tickets/${newTicketId}`);
    } catch (error) {
      console.error('Error duplicating ticket:', error);
      window.alert('Error duplicating ticket');
    } finally {
      setLoading(false);
    }
  };

  const handleMergeTicket = () => {
    const ticketId = window.prompt('Enter ticket ID to merge with:');
    if (ticketId && ticketId.trim()) {
      if (window.confirm(`Are you sure you want to merge this ticket with #${ticketId}?`)) {
        try {
          setLoading(true);
          // In real app, this would call API to merge tickets
          window.alert(`Ticket merged with #${ticketId} successfully`);
          navigate('/tickets');
        } catch (error) {
          console.error('Error merging ticket:', error);
          window.alert('Error merging ticket');
        } finally {
          setLoading(false);
        }
      }
    }
  };

  const handleSplitTicket = () => {
    const newSubject = window.prompt('Enter subject for the new ticket:');
    if (newSubject && newSubject.trim()) {
      try {
        setLoading(true);
        // In real app, create new ticket and split content
        const newTicketId = Math.floor(Math.random() * 10000) + 1000;
        window.alert(`Ticket split successfully. New ticket ID: #${newTicketId}`);
      } catch (error) {
        console.error('Error splitting ticket:', error);
        window.alert('Error splitting ticket');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleConvertTicket = () => {
    const options = ['Task', 'Bug', 'Feature Request', 'Question'];
    const choice = window.prompt(`Convert to:\n${options.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}\n\nEnter number (1-${options.length}):`);
    const index = parseInt(choice) - 1;
    if (index >= 0 && index < options.length) {
      const oldType = (ticket?.typeLabel || ticket?.type || formState.type || '').toString();
      const newType = options[index];
      const ok = window.confirm(`Are you sure you want to change the ticket type?\n\n${oldType} → ${newType}`);
      if (!ok) return;
      try {
        setLoading(true);
        setFormState(prev => ({ ...prev, type: options[index] }));
        window.alert(`Ticket converted to ${options[index]} successfully`);
      } catch (error) {
        console.error('Error converting ticket:', error);
        window.alert('Error converting ticket');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleCancelReply = () => {
    if (replyForm.message.trim() && !window.confirm('Discard reply?')) {
      return;
    }
    setReplyForm({
      to: '',
      cc: '',
      bcc: '',
      message: '',
      attachments: [],
      showCc: false,
      showBcc: false,
      router: null
    });
    setShowReplyCard(false);
    // Unlock body scroll
    document.body.style.overflow = 'auto';
  };

  const handleCancelNote = () => {
    if (noteForm.message.trim() && !window.confirm('Discard note?')) {
      return;
    }
    setNoteForm({
      message: '',
      isPrivate: false,
      attachments: []
    });
    setShowNoteCard(false);
    // Unlock body scroll
    document.body.style.overflow = 'auto';
  };

  const handleRouterFormChange = (field, value) => {
    setRouterForm(prev => ({ ...prev, [field]: value }));
  };

  // Helper function to compress images before upload
  const compressImage = (file, maxWidth = 1920, maxHeight = 1920, quality = 0.8) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // Calculate new dimensions while maintaining aspect ratio
          let width = img.width;
          let height = img.height;
          
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = width * ratio;
            height = height * ratio;
          }
          
          // Create canvas and compress
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          // Convert to blob with compression
          canvas.toBlob((blob) => {
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now()
            });
            console.log(`Compressed ${file.name}: ${(file.size / 1024).toFixed(0)}KB → ${(compressedFile.size / 1024).toFixed(0)}KB`);
            resolve(compressedFile);
          }, 'image/jpeg', quality);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleRouterImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    showInfo('Compressing images...');
    
    try {
      // Compress images before adding to form
      const compressedFiles = await Promise.all(
        files.map(file => compressImage(file))
      );
      
      // Create preview URLs
      const newPreviewUrls = compressedFiles.map(file => URL.createObjectURL(file));
      
      setRouterForm(prev => ({
        ...prev,
        images: [...prev.images, ...compressedFiles],
        previewUrls: [...prev.previewUrls, ...newPreviewUrls]
      }));
      
      showSuccess(`${files.length} image(s) ready to upload`);
    } catch (error) {
      console.error('Error compressing images:', error);
      showError('Error processing images');
    }
  };

  const handleRouterCameraCapture = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    showInfo('Compressing images...');
    
    try {
      // Compress images before adding to form
      const compressedFiles = await Promise.all(
        files.map(file => compressImage(file))
      );
      
      // Create preview URLs
      const newPreviewUrls = compressedFiles.map(file => URL.createObjectURL(file));
      
      setRouterForm(prev => ({
        ...prev,
        images: [...prev.images, ...compressedFiles],
        previewUrls: [...prev.previewUrls, ...newPreviewUrls]
      }));
      
      showSuccess(`${files.length} photo(s) ready to upload`);
    } catch (error) {
      console.error('Error compressing images:', error);
      showError('Error processing photos');
    }
  };

  const handleRemoveRouterImage = (index) => {
    setRouterForm(prev => {
      const newImages = [...prev.images];
      const newPreviewUrls = [...prev.previewUrls];
      
      // Revoke the URL to free memory
      URL.revokeObjectURL(newPreviewUrls[index]);
      
      newImages.splice(index, 1);
      newPreviewUrls.splice(index, 1);
      
      return {
        ...prev,
        images: newImages,
        previewUrls: newPreviewUrls
      };
    });
  };

  const teamItemKey = (item) =>
    `${item.roll_number || item.id || item.name}:${item.assigned_to_id || ''}`;

  const formatTeamItemLabel = (item) => {
    const base = item.roll_number
      ? `${item.roll_number} (${item.cable_type || item.name})`
      : `${item.name}${item.category ? ` (${item.category})` : ''}`;
    if (isFieldRole && item.assigned_to_name) {
      return `${base} — ${item.assigned_to_name}`;
    }
    return base;
  };

  // Build available items from disbursement rows (roster team or own account).
  const buildUserItems = (rows, forGroup = false) =>
    buildPendingBalancesFromDisbursements(rows, forGroup).map((i) => ({
      ...i,
      unit: i.is_drop_cable ? 'meters' : 'pcs',
      is_numbered_roll: Boolean(i.roll_number),
    }));

  const dropCableItems = useMemo(
    () => invItems.filter(isDropCable),
    [invItems]
  );

  const dropCableUsageOnTicket = useMemo(
    () => invUsageLog.filter((u) => isDropCable({ name: u.item_name, category: u.item_category })),
    [invUsageLog]
  );

  const refreshInventoryForTicket = async () => {
    if (!ticket?.id || !user?.id) return;
    const [logRes, team] = await Promise.all([
      InventoryAPI.getTicketUsage(ticket.id),
      loadTeamInventory(),
    ]);
    setInvUsageLog(Array.isArray(logRes?.data) ? logRes.data : []);
    setInvItems(buildUserItems(team.rows, isFieldRole));
    if (isFieldRole) setGroupTeamRouters(team.routers);
  };

  const handleLogDropCable = async () => {
    if (!dropCableItem) {
      return showWarning('Select cable roll (e.g. T400) or cable type');
    }
    const meters = parseInt(dropCableMeters, 10);
    if (!meters || meters < 1) return showWarning('Enter meters used (e.g. 300)');
    if (meters > (dropCableItem.quantity_available || 0)) {
      const label = dropCableItem.roll_number || dropCableItem.name;
      return showWarning(`Only ${dropCableItem.quantity_available} m left on ${label}`);
    }
    if (!ticket?.id) return;

    const rollNo = dropCableItem.roll_number || null;
    const typeName = dropCableItem.cable_type || dropCableItem.name;

    setDropCableLoading(true);
    try {
      const res = await InventoryAPI.createDisbursement({
        type: 'item',
        item_id: dropCableItem.id || null,
        item_name: typeName,
        item_category: dropCableItem.category || 'Drop Cable',
        serial_number: rollNo || undefined,
        quantity: meters,
        notes: rollNo ? `Roll ${rollNo} used on ticket` : `Drop cable used on ticket`,
        ticket_id: ticket.id,
        ticket_number: ticket.number || ticket.ticket_number || String(ticket.id),
        assigned_to_id: dropCableItem.assigned_to_id || user?.id || null,
        assigned_to_name: dropCableItem.assigned_to_name || user?.name || user?.username || '',
        assigned_by_id: user?.id || null,
        assigned_by_name: user?.name || user?.username || '',
      });
      if (res?.success || res?.data) {
        const left = Math.max(0, (dropCableItem.quantity_available || 0) - meters);
        const rollLabel = rollNo || typeName;
        const ownerNote = dropCableItem.assigned_to_name && Number(dropCableItem.assigned_to_id) !== Number(user?.id)
          ? ` (${dropCableItem.assigned_to_name}'s roll)` : '';
        showSuccess(`${rollLabel}${ownerNote}: ${meters} m logged · ${formatDropCableBalance(left, dropCableItem.roll_meters)} remaining on this roll`);
        await refreshInventoryForTicket();
        setDropCableMeters('');
      } else {
        showError(res?.data?.data?.error || res?.data?.error || 'Failed to log drop cable');
      }
    } catch (err) {
      showError(err?.response?.data?.error || 'Failed to log drop cable');
    } finally {
      setDropCableLoading(false);
    }
  };

  const handleLogInventoryUsage = async () => {
    if (!invUsageItem) return showWarning('Please select an inventory item');
    if (invUsageQty < 1) return showWarning('Quantity must be at least 1');
    if (!ticket?.id) return;

    setInvUsageLoading(true);
    try {
      const res = await InventoryAPI.createDisbursement({
        type: 'item',
        item_id: invUsageItem.id || null,
        item_name: invUsageItem.name,
        item_category: invUsageItem.category || '',
        quantity: invUsageQty,
        notes: invUsageNotes,
        ticket_id: ticket.id,
        ticket_number: ticket.number || ticket.ticket_number || String(ticket.id),
        assigned_to_id: invUsageItem.assigned_to_id || user?.id || null,
        assigned_to_name: invUsageItem.assigned_to_name || user?.name || user?.username || '',
        assigned_by_id: user?.id || null,
        assigned_by_name: user?.name || user?.username || '',
      });
      if (res?.success || res?.data) {
        const usedLabel = isDropCable(invUsageItem)
          ? `${invUsageQty} m`
          : `${invUsageQty}× ${invUsageItem.name}`;
        const left = Math.max(0, (invUsageItem.quantity_available || 0) - invUsageQty);
        const remainLabel = isDropCable(invUsageItem)
          ? formatDropCableBalance(left, invUsageItem.roll_meters)
          : `${left} remaining`;
        const ownerNote = invUsageItem.assigned_to_name ? ` · ${invUsageItem.assigned_to_name}'s stock` : '';
        showSuccess(`${usedLabel} logged on this ticket · ${remainLabel} remaining${ownerNote}`);
        await refreshInventoryForTicket();
        setInvUsageItem(null);
        setInvUsageQty(1);
        setInvUsageNotes('');
      } else {
        showError(res?.data?.data?.error || res?.data?.error || 'Failed to log inventory usage');
      }
    } catch (err) {
      showError(err?.response?.data?.error || 'Failed to log inventory usage');
    } finally {
      setInvUsageLoading(false);
    }
  };

  const handleSaveRouter = async () => {
    if (!routerForm.routerNumber || !routerForm.routerNumber.trim()) {
      showWarning('Please enter a router number (e.g., G001 or B001)');
      return;
    }

    if (!routerForm.images || routerForm.images.length === 0) {
      showWarning('Please add at least one router image');
      return;
    }

    if (!ticket || !ticket.id) {
      showError('Error: No ticket data available');
      return;
    }

    try {
      setLoading(true);

      // Convert File objects to base64
      console.log('Converting', routerForm.images.length, 'images to base64...');
      
      const imagesWithBase64 = await Promise.all(
        routerForm.images.map(async (file) => {
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              const base64String = e.target.result;
              console.log('Converted image:', file.name, 'Size:', file.size, 'Base64 length:', base64String.length);
              resolve({
                base64: base64String
              });
            };
            reader.onerror = (error) => {
              console.error('Error reading file:', file.name, error);
              reject(error);
            };
            reader.readAsDataURL(file);
          });
        })
      );

      console.log('Successfully converted', imagesWithBase64.length, 'images to base64');
      console.log('First image preview:', imagesWithBase64[0]?.base64?.substring(0, 100));

      // Prepare router data for API
      const routerData = {
        router_number: routerForm.routerNumber,
        images: imagesWithBase64,
        user_id: user?.id || 1, // Get from auth context
        user_name: user?.name || 'Admin',
        user_email: user?.email || ''
      };

      console.log('Router data prepared:', {
        router_number: routerData.router_number,
        image_count: routerData.images.length,
        user_id: routerData.user_id
      });

      // Send router data to API
      const { default: TicketsAPI } = await import('../../helpers/TicketsAPI');
      const response = await TicketsAPI.addRouter(ticket.id, routerData);
      
      console.log('API Response:', response);
      
      if (response.success || response.data) {
        // Check if we came from reply card
        if (routerForm.returnToReply) {
          // Store router data in replyForm and return to reply card
          setReplyForm(prev => ({
            ...prev,
            router: {
              routerNumber: routerForm.routerNumber,
              images: imagesWithBase64,
              apiResponse: response // Store the API response for reference
            }
          }));
          
          // Clear router form but keep the data for the reply
          routerForm.previewUrls.forEach(url => URL.revokeObjectURL(url));
          
          setRouterForm({
            routerNumber: '',
            images: [],
            previewUrls: [],
            returnToReply: false
          });
          
          // Show reply card again
          setShowRouterCard(false);
          setShowReplyCard(true);
          
          showSuccess(`Router ${routerForm.routerNumber} attached to reply!`);
        } else {
          // Normal router add flow (not from reply)

          // If an inventory router was matched, link it to this ticket
          let patchNote = '';
          if (invLinkedRouter) {
            try {
              const { default: InventoryAPI } = await import('../../helpers/InventoryAPI');
              const linkRes = await InventoryAPI.linkRouterToTicket({
                item_id: invLinkedRouter.id,
                ticket_id: ticket.id,
                ticket_number: ticket.number || String(ticket.id),
                used_by_id: user?.id ?? null,
                used_by_name: user?.name || user?.username || user?.email || 'Unknown',
              });
              if (linkRes?.patchcord?.ok || linkRes?.patchcord?.disbursement_id) {
                patchNote = ' · 1 Patch Cord deducted';
              } else if (linkRes?.patchcord_warning) {
                showWarning(linkRes.patchcord_warning);
              }
            } catch (linkErr) {
              console.warn('Inventory link failed (non-critical):', linkErr);
            }
            setInvLinkedRouter(null);
          }

          // Revoke all preview URLs to free memory
          routerForm.previewUrls.forEach(url => URL.revokeObjectURL(url));
          
          setRouterForm({
            routerNumber: '',
            images: [],
            previewUrls: [],
            returnToReply: false
          });
          setInvSearchResults([]);

          setShowRouterCard(false);
          // Unlock body scroll
          document.body.style.overflow = 'auto';
          
          // Reload messages from API
          await loadMessages(ticket.id);
          
          // Mark splitters as updated
          setSplittersUpdated(true);
          
          showSuccess(`Router saved successfully! (${routerForm.routerNumber})${patchNote}`);
        }
      } else {
        throw new Error(response.error || 'Failed to save router information');
      }
    } catch (error) {
      console.error('Error saving router info:', error);
      showError('Error saving router info: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleCancelRouter = () => {
    if ((routerForm.routerNumber.trim() || routerForm.images.length > 0) && !window.confirm('Discard router information?')) {
      return;
    }
    
    // Revoke all preview URLs
    routerForm.previewUrls.forEach(url => URL.revokeObjectURL(url));
    
    setRouterForm({
      routerNumber: '',
      images: [],
      previewUrls: []
    });
    setShowRouterCard(false);
    // Unlock body scroll
    document.body.style.overflow = 'auto';
  };

  // ── Inventory serial search (embedded in router card) ────────────────────
  const handleInvSerialSearch = async (q) => {
    setInvLinkedRouter(null);
    setInvSearching(true);
    try {
      const ql = q.trim().toLowerCase();
      if (isFieldRole) {
        if (ql.length < 1) {
          setInvSearchResults(groupTeamRouters);
          return;
        }
        const filtered = groupTeamRouters.filter((r) => {
          const name = (r.name || '').toLowerCase();
          const serial = (r.serial_number || '').toLowerCase();
          const holder = (r.assigned_to_name || '').toLowerCase();
          return name.includes(ql) || serial.includes(ql) || name.endsWith(ql) || holder.includes(ql);
        });
        setInvSearchResults(filtered);
        return;
      }
      setInvSearchResults([]);
      if (q.length < 2) return;
      const { default: InventoryAPI } = await import('../../helpers/InventoryAPI');
      const res = await InventoryAPI.searchBySerial(q);
      setInvSearchResults(Array.isArray(res?.data) ? res.data : []);
    } catch { setInvSearchResults([]); }
    finally { setInvSearching(false); }
  };

  const handleSelectInvRouter = (router) => {
    setRouterForm(prev => ({ ...prev, routerNumber: router.name }));
    setInvLinkedRouter(router);
    setInvSearchResults([]);
  };

  // Show loading state or error state
  if (loading) {
    return (
      <React.Fragment>
        <Head title="Loading Ticket..."></Head>
        <Content hideBreadcrumb>
          <div style={{ padding: '50px', textAlign: 'center' }}>
            <div>Loading ticket data...</div>
          </div>
        </Content>
      </React.Fragment>
    );
  }

  // Only show "not found" if we're done loading and still no ticket
  if (!loading && !ticket) {
    return (
      <React.Fragment>
        <Head title="Ticket Not Found"></Head>
        <Content hideBreadcrumb>
          <div style={{ padding: '50px', textAlign: 'center' }}>
            <div>Ticket not found or failed to load.</div>
            <button 
              onClick={() => navigate('/admin/tickets')} 
              style={{ marginTop: '20px', padding: '10px 20px' }}
            >
              Back to Tickets
            </button>
          </div>
        </Content>
      </React.Fragment>
    );
  }

  // Debug log to check ticket data
  console.log('Ticket View - ticket object:', { id: ticket.id, number: ticket.number, subject: ticket.subject });

  return (
    <React.Fragment>
      <Head title={`Ticket ${ticket.number || '#' + ticket.id}`}></Head>
      <Content hideBreadcrumb>
        <div className="ticket-view-container">
          {/* Breadcrumbs */}
          <div className="ticket-breadcrumbs">
            <div className="ticket-icon-badge">
              <Icon name="ticket-diagonal" />
            </div>
            <span className="breadcrumb-link">Tickets</span>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-link">List</span>
            <span className="breadcrumb-sep">/</span>
            <h6 className="breadcrumb-current">{ticket.number || '#' + ticket.id} {ticket.subject}</h6>
          </div>

          {/* Main Layout */}
          <div className="ticket-main-layout">
            {/* Left Content */}
            <div className="ticket-content">
              {/* Ticket Header Card */}
              <div className="ticket-header-card">
                <div className="ticket-header-top">
                  <div className="ticket-header-left">
                    <div className="ticket-title-line">
                      <span 
                        className="ticket-status-badge" 
                        onClick={isCustomerCreator ? undefined : openStatusPopover}
                        style={{ 
                          cursor: isCustomerCreator ? 'default' : 'pointer',
                          transition: 'all 0.2s ease',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                        title={isCustomerCreator ? '' : 'Click to change status'}
                      >
                        {ticket.status || formState.status}
                        {!isCustomerCreator && <Icon name="chevron-down" style={{ fontSize: '10px' }} />}
                      </span>
                      <span>{ticket.subject || formState.subject}</span>
                      <Icon name="link" className="ticket-link-icon" />
                      <span style={{ marginLeft: 'auto', fontSize: '12px', display: 'flex', gap: '12px' }}>
                        <span style={{ color: '#10b981' }}>
                          Created: <strong>{formatLocalTime(ticket.created_at)}</strong>
                        </span>
                        <span style={{ color: '#f59e0b' }}>
                          Updated: <strong>{formatLocalTime(ticket.updated_at) || formatLocalTime(ticket.created_at)}</strong>
                        </span>
                      </span>
                    </div>
                    <div className="ticket-meta-info">
                      <div>
                        {(() => {
                          const meta = getTicketCreatedMeta(ticket);
                          return (
                            <>
                              Created by <strong>{meta.creatorName}</strong>{' '}
                              {meta.creatorKind === 'customer' ? 'via Portal' : 'via Staff'}
                            </>
                          );
                        })()}
                      </div>
                      <div style={{ marginTop: '4px' }}>
                        Assigned to:{' '}
                        <strong>
                          {formatAssignedToName(
                            ticket.assigned_to ||
                            ticket.assignedTo ||
                            formState.assigned_to?.value ||
                            'Unassigned'
                          )}
                        </strong>{' '}
                        | Group: <strong>{ticket.group || formState.group}</strong> | Watchers:{' '}
                        <strong>
                          {Array.isArray(ticket.watchers)
                            ? ticket.watchers.length
                            : typeof ticket.watched_by === 'string' && ticket.watched_by.trim()
                              ? ticket.watched_by.split(',').map((s) => s.trim()).filter(Boolean).length
                              : Array.isArray(formState.watchers)
                                ? formState.watchers.length
                                : 0}
                        </strong>
                        {' '} | Messages:{' '}
                        <strong>
                          {msgList.length} 
                        </strong>
                        {' '}(
                          <span style={{ color: '#357bf2' }}>
                            {msgList.filter(m => m.type === 'reply' && !m.isRouter).length} replies
                          </span>
                          {', '}
                          <span style={{ color: '#6b7280' }}>
                            {msgList.filter(m => m.isNote).length} notes
                          </span>
                          {', '}
                          <span style={{ color: '#10b981' }}>
                            {msgList.filter(m => m.isRouter).length} routers
                          </span>
                        )
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="ticket-header-actions">
                  {!isCustomerCreator && (<>
                  <button className="btn-action" onClick={handleReply}>
                    <Icon name="arrow-reply" />
                    Reply
                  </button>
                  <button className="btn-action" onClick={handleAddNote}>
                    <Icon name="note" />
                    Add note
                  </button>
                  <button className="btn-action" onClick={handleAddRouter} style={{
                    backgroundColor: '#10b981',
                    color: '#fff',
                    border: '1px solid #10b981'
                  }}>
                    <Icon name="router" />
                    Add Router
                  </button>

                  <button className="btn-action" onClick={() => { refreshInventoryForTicket(); setShowInvModal(true); }} style={{
                    backgroundColor: '#f59e0b',
                    color: '#fff',
                    border: '1px solid #f59e0b',
                    position: 'relative'
                  }}>
                    <Icon name="package" />
                    Inventory
                    {invUsageLog.length > 0 && (
                      <span style={{
                        position: 'absolute', top: -6, right: -6,
                        background: '#ef4444', color: '#fff',
                        borderRadius: '50%', width: 17, height: 17,
                        fontSize: '0.65rem', fontWeight: 800,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        lineHeight: 1,
                      }}>{invUsageLog.length}</span>
                    )}
                  </button>

                  <button className="btn-action" onClick={() => setShowNearbyInfra(true)} style={{
                    backgroundColor: '#3b82f6',
                    color: '#fff',
                    border: '1px solid #3b82f6'
                  }}>
                    <Icon name="map-pin" />
                    Find and Update Nearby
                  </button>
                  
                  {/* Customer Location Buttons - Show different options based on location status */}
                  {customerLocation.loading ? (
                    <button className="btn-action" disabled style={{
                      backgroundColor: '#6b7280',
                      color: '#fff',
                      border: '1px solid #6b7280',
                      opacity: 0.6
                    }}>
                      <Icon name="loader" />
                      Loading...
                    </button>
                  ) : customerLocation.hasLocation ? (
                    <>
                      <button className="btn-action" onClick={handleNavigateToLocation} style={{
                        backgroundColor: '#10b981',
                        color: '#fff',
                        border: '1px solid #10b981'
                      }}>
                        <Icon name="location" />
                        Navigate to Location
                      </button>
                      <button className="btn-action" onClick={handleUpdateCustomerLocation} disabled={savingLocation} style={{
                        backgroundColor: '#f59e0b',
                        color: '#fff',
                        border: '1px solid #f59e0b',
                        opacity: savingLocation ? 0.6 : 1
                      }}>
                        <Icon name={savingLocation ? "loader" : "refresh"} />
                        {savingLocation ? 'Updating...' : 'Update Location'}
                      </button>
                    </>
                  ) : (
                    <button className="btn-action" onClick={handleAddCustomerLocation} disabled={savingLocation} style={{
                      backgroundColor: '#f59e0b',
                      color: '#fff',
                      border: '1px solid #f59e0b',
                      opacity: savingLocation ? 0.6 : 1
                    }}>
                      <Icon name={savingLocation ? "loader" : "location"} />
                      {savingLocation ? 'Saving...' : 'Add Customer Location'}
                    </button>
                  )}
                  
                  {/* Actions Dropdown */}
                  <Dropdown isOpen={actionsDropdown} toggle={() => setActionsDropdown(!actionsDropdown)}>
                    <DropdownToggle className="btn-action" style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      backgroundColor: 'transparent',
                      border: '1px solid #e1e7f0',
                      color: '#374151',
                      fontSize: '13px',
                      fontWeight: '500',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}>
                      Actions
                      <Icon name="chevron-down" />
                    </DropdownToggle>
                    <DropdownMenu style={{ minWidth: '200px', fontSize: '14px' }}>
                      <DropdownItem onClick={() => handleTicketAction('close')}>
                        <Icon name="cross" style={{ marginRight: '8px', fontSize: '12px' }} />
                        Close ticket
                      </DropdownItem>
                      <DropdownItem onClick={() => handleTicketAction('archive')}>
                        <Icon name="archive" style={{ marginRight: '8px', fontSize: '12px' }} />
                        Move to archive
                      </DropdownItem>
                      <DropdownItem divider />
                      <DropdownItem onClick={() => handleTicketAction('duplicate')}>
                        <Icon name="copy" style={{ marginRight: '8px', fontSize: '12px' }} />
                        Duplicate ticket
                      </DropdownItem>
                      <DropdownItem onClick={() => handleTicketAction('merge')}>
                        <Icon name="share" style={{ marginRight: '8px', fontSize: '12px' }} />
                        Merge with another
                      </DropdownItem>
                      <DropdownItem onClick={() => handleTicketAction('split')}>
                        <Icon name="split" style={{ marginRight: '8px', fontSize: '12px' }} />
                        Split ticket
                      </DropdownItem>
                      {!isTechnician && (
                        <DropdownItem onClick={() => handleTicketAction('convert')}>
                          <Icon name="swap" style={{ marginRight: '8px', fontSize: '12px' }} />
                          Convert type
                        </DropdownItem>
                      )}
                      <DropdownItem divider />
                      <DropdownItem onClick={() => handleTicketAction('delete')} className="text-danger">
                        <Icon name="trash" style={{ marginRight: '8px', fontSize: '12px' }} />
                        Delete ticket
                      </DropdownItem>
                    </DropdownMenu>
                  </Dropdown>
                  </>)}
                </div>
              </div>

              <InstallationCustomerCard
                ticket={ticket}
                initialLocation={customerLocation}
                onSaved={(updates) => {
                  setTicket((previous) => ({ ...previous, ...updates }));
                  if (updates?.latitude != null && updates?.longitude != null) {
                    setCustomerLocation((previous) => ({
                      ...previous,
                      hasLocation: true,
                      latitude: updates.latitude,
                      longitude: updates.longitude,
                      loading: false,
                    }));
                  }
                }}
              />

              {/* Drop cable — log usage in meters (disbursed as 1k / 2k pieces) */}
              {!isCustomerCreator && (
                <div
                  className="message-card"
                  style={{
                    borderLeft: '4px solid #0ea5e9',
                    background: '#f0f9ff',
                    marginBottom: 16,
                  }}
                >
                  <div style={{ padding: '16px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <Icon name="link" style={{ color: '#0284c7', fontSize: '1.2rem' }} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0c4a6e' }}>Drop cable used</div>
                        <div style={{ fontSize: '0.75rem', color: '#0369a1' }}>
                          Select a cable roll from your team (e.g. <strong>T400</strong>), then enter meters used on this job.
                        </div>
                      </div>
                    </div>

                    {dropCableItems.length === 0 ? (
                      <div style={{
                        padding: '12px 14px', background: '#fff', borderRadius: 8,
                        border: '1px solid #bae6fd', fontSize: '0.85rem', color: '#0369a1',
                      }}>
                        {isFieldRole
                          ? <>No drop cable in your team today. Check <a href="/admin/tickets/daily-schedule">your team</a> is on today&apos;s roster and ensure rolls are disbursed to team members.</>
                          : <>No drop cable on your account. Ask your manager to disburse a numbered roll (e.g. <strong>T400</strong>) first.</>}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                        <div style={{ flex: '1 1 200px', minWidth: 160 }}>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0c4a6e', display: 'block', marginBottom: 4 }}>Cable roll</label>
                          <select
                            className="form-control"
                            value={dropCableItem ? teamItemKey(dropCableItem) : ''}
                            onChange={(e) => {
                              const item = dropCableItems.find(i => teamItemKey(i) === e.target.value);
                              setDropCableItem(item || null);
                              setDropCableMeters('');
                            }}
                          >
                            <option value="">— Select roll —</option>
                            {dropCableItems.map((i) => (
                              <option
                                key={teamItemKey(i)}
                                value={teamItemKey(i)}
                              >
                                {formatTeamItemLabel(i)} — {formatDropCableBalance(i.quantity_available, i.roll_meters)} left
                              </option>
                            ))}
                          </select>
                        </div>
                        <div style={{ flex: '0 0 140px' }}>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0c4a6e', display: 'block', marginBottom: 4 }}>Meters used</label>
                          <input
                            type="number"
                            className="form-control"
                            min={1}
                            max={dropCableItem?.quantity_available || undefined}
                            placeholder="e.g. 300"
                            value={dropCableMeters}
                            onChange={(e) => setDropCableMeters(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleLogDropCable(); }}
                          />
                        </div>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={!dropCableItem || dropCableLoading}
                          onClick={handleLogDropCable}
                          style={{ minWidth: 120 }}
                        >
                          {dropCableLoading ? 'Saving…' : 'Deduct cable'}
                        </button>
                      </div>
                    )}

                    {dropCableUsageOnTicket.length > 0 && (
                      <div style={{ marginTop: 14, fontSize: '0.82rem', color: '#0c4a6e' }}>
                        <strong>On this ticket:</strong>{' '}
                        {dropCableUsageOnTicket.map((u, idx) => (
                          <span key={u.id}>
                            {idx > 0 ? ', ' : ''}
                            {formatTicketCableUsageLine(u)}
                          </span>
                        ))}
                        {' '}
                        (total{' '}
                        {dropCableUsageOnTicket.reduce((s, u) => s + (parseInt(u.quantity, 10) || 0), 0)} m)
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Messages */}
              {msgList.map((message) => (
                <div 
                  key={message.id} 
                  className="message-card" 
                  id={`message-${message.id}`}
                  style={{
                    borderLeft: message.isRouter
                      ? '4px solid #10b981'
                      : message.isNote 
                        ? '4px solid #6b7280' 
                        : message.type === 'reply' 
                          ? '4px solid #357bf2' 
                          : '4px solid #EC4899'
                  }}
                >
                  <div className="message-header">
                    <div className="message-avatar" style={{ backgroundColor: message.color }}>
                      {message.initial}
                    </div>
                    <div className="message-info">
                      <div className="message-author">
                        {message.author}
                        {message.isRouter && (
                          <span style={{
                            marginLeft: '8px',
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '3px',
                            backgroundColor: '#10b981',
                            color: '#fff',
                            fontWeight: '600'
                          }}>
                            ROUTER INFO
                          </span>
                        )}
                        {message.isNote && (
                          <span style={{
                            marginLeft: '8px',
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '3px',
                            backgroundColor: message.isPrivate ? '#ef4444' : '#6b7280',
                            color: '#fff',
                            fontWeight: '600'
                          }}>
                            {message.isPrivate ? 'PRIVATE NOTE' : 'NOTE'}
                          </span>
                        )}
                        {message.type === 'reply' && !message.isRouter && (
                          <span style={{
                            marginLeft: '8px',
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '3px',
                            backgroundColor: '#357bf2',
                            color: '#fff',
                            fontWeight: '600'
                          }}>
                            REPLY
                          </span>
                        )}
                        {message.pending && (
                          <span style={{
                            marginLeft: '8px',
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '3px',
                            backgroundColor: '#fbbf24',
                            color: '#fff',
                            fontWeight: '600'
                          }}>
                            PENDING
                          </span>
                        )}
                      </div>
                      <div className="message-meta">
                        Created: {formatLocalTime(message.created)} | Source: {message.source}
                        {message.to && ` | To: ${message.to}`}
                        {message.cc && ` | Cc: ${message.cc}`}
                      </div>
                      <div className="message-email">{message.email}</div>
                    </div>
                    <div className="message-actions">
                      <button className="btn-icon-action" onClick={() => handleDeleteMessage(message.id)} title="Delete message">
                        <Icon name="trash" />
                      </button>
                      <button className="btn-icon-action" onClick={() => handleEditMessage(message.id)} title="Edit message">
                        <Icon name="edit" />
                      </button>
                      {!message.isNote && (
                        <button className="btn-icon-action" onClick={() => handleMailMessage(message.id)} title="Send email">
                          <Icon name="mail" />
                        </button>
                      )}
                      <button className="btn-icon-action" onClick={() => handleCopyLink(message.id)} title="Copy link">
                        <Icon name="link" />
                      </button>
                    </div>
                  </div>
                  <div className="message-body">
                    {message.content}
                    
                    {/* Router Images */}
                    {message.isRouter && message.images && message.images.length > 0 && (
                      <div style={{
                        marginTop: '16px',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                        gap: '12px'
                      }}>
                        {message.images.map((url, index) => {
                          // Debug: log the URL
                          console.log(`Router image ${index}:`, url);
                          
                          const apiUrl = ticketsApiUrl('');
                          // Check if URL is valid
                          if (!url || url === `${apiUrl}/` || url === apiUrl) {
                            console.warn(`Invalid image URL at index ${index}:`, url);
                            return (
                              <div 
                                key={index}
                                style={{
                                  borderRadius: '8px',
                                  border: '2px solid #ef4444',
                                  padding: '20px',
                                  textAlign: 'center',
                                  backgroundColor: '#fee2e2',
                                  color: '#dc2626',
                                  fontSize: '12px'
                                }}
                              >
                                ⚠️ Image URL missing<br/>
                                <small>URL: {url || 'empty'}</small>
                              </div>
                            );
                          }
                          
                          return (
                            <div 
                              key={index}
                              style={{
                                borderRadius: '8px',
                                overflow: 'hidden',
                                border: '2px solid #e5e7eb',
                                cursor: 'pointer',
                                transition: 'transform 0.2s',
                                backgroundColor: '#f9fafb',
                                position: 'relative'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                              onClick={() => {
                                console.log('Opening image:', url);
                                window.open(url, '_blank');
                              }}
                              title={`Click to view full size - ${url}`}
                            >
                              <img 
                                src={url}
                                alt={`Router image ${index + 1}`}
                                style={{
                                  width: '100%',
                                  height: '150px',
                                  objectFit: 'cover'
                                }}
                                onError={(e) => {
                                  console.error('Failed to load image:', url);
                                  e.target.style.display = 'none';
                                  e.target.parentElement.innerHTML = `
                                    <div style="padding: 20px; text-align: center; color: #dc2626; font-size: 12px;">
                                      ❌ Failed to load<br/>
                                      <small style="word-break: break-all;">${url}</small>
                                    </div>
                                  `;
                                }}
                                onLoad={() => console.log('Image loaded successfully:', url)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Reply Card Modal */}
              {showReplyCard && (
                <>
                  {/* Modal Backdrop */}
                  <div 
                    style={{
                      position: 'fixed',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: 'rgba(0, 0, 0, 0.5)',
                      zIndex: 9998,
                      backdropFilter: 'blur(2px)'
                    }}
                    onClick={handleCancelReply}
                  />
                  
                  {/* Modal Content */}
                  <div 
                    className="reply-card" 
                    style={{
                      position: 'fixed',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      backgroundColor: '#fff',
                      border: '0 solid #f7f8fc',
                      borderRadius: '12px',
                      boxShadow: '0 20px 60px rgba(0,0,0,.3)',
                      zIndex: 9999,
                      maxWidth: window.innerWidth < 768 ? '95vw' : '700px',
                      width: '100%',
                      maxHeight: window.innerWidth < 768 ? '90vh' : '85vh',
                      overflowY: 'auto',
                      animation: 'fadeInScale 0.3s ease-out'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="card-body" style={{ padding: '20px', position: 'relative' }}>
                    {/* Close Button */}
                    <button
                      onClick={handleCancelReply}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#ef4444';
                        e.currentTarget.style.transform = 'scale(1.2)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#6b7280';
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                      style={{
                        position: 'absolute',
                        top: '16px',
                        right: '16px',
                        background: 'none',
                        border: 'none',
                        fontSize: '28px',
                        color: '#6b7280',
                        cursor: 'pointer',
                        padding: '4px',
                        lineHeight: '1',
                        zIndex: 1,
                        transition: 'all 0.2s ease'
                      }}
                      title="Close"
                    >
                      ×
                    </button>
                    
                    <div className="form-horizontal">
                    <form className="communication-form">
                      {/* To Field */}
                      <div className="row mb-3">
                        <div className="input-group">
                          <span className="input-group-text" style={{ fontSize: '14px', fontWeight: '500' }}>To:</span>
                          <input 
                            type="text"
                            className="form-control"
                            value={replyForm.to || ticket.customer?.email || 'customer@example.com'}
                            onChange={(e) => handleReplyFormChange('to', e.target.value)}
                            style={{
                              border: '1px solid #e1e7f0',
                              borderRadius: '0',
                              fontSize: '14px'
                            }}
                          />
                          <div className="dropdown">
                            <button 
                              type="button" 
                              className="btn btn-outline-secondary dropdown-toggle" 
                              style={{ borderColor: '#e1e7f0' }}
                              data-bs-toggle="dropdown"
                            >
                              Options
                            </button>
                            <ul className="dropdown-menu">
                              <li>
                                <button 
                                  type="button" 
                                  className="dropdown-item"
                                  onClick={handleShowCc}
                                >
                                  {replyForm.showCc ? 'Hide' : 'Show'} Cc
                                </button>
                              </li>
                              <li>
                                <button 
                                  type="button" 
                                  className="dropdown-item"
                                  onClick={handleShowBcc}
                                >
                                  {replyForm.showBcc ? 'Hide' : 'Show'} Bcc
                                </button>
                              </li>
                            </ul>
                          </div>
                        </div>
                      </div>

                      {/* Cc Field */}
                      {replyForm.showCc && (
                        <div className="row mb-3">
                          <div className="input-group">
                            <span className="input-group-text" style={{ fontSize: '14px', fontWeight: '500' }}>Cc:</span>
                            <input 
                              type="text"
                              className="form-control"
                              value={replyForm.cc}
                              onChange={(e) => handleReplyFormChange('cc', e.target.value)}
                              placeholder="Enter Cc emails..."
                              style={{
                                border: '1px solid #e1e7f0',
                                fontSize: '14px'
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Bcc Field */}
                      {replyForm.showBcc && (
                        <div className="row mb-3">
                          <div className="input-group">
                            <span className="input-group-text" style={{ fontSize: '14px', fontWeight: '500' }}>Bcc:</span>
                            <input 
                              type="text"
                              className="form-control"
                              value={replyForm.bcc}
                              onChange={(e) => handleReplyFormChange('bcc', e.target.value)}
                              placeholder="Enter Bcc emails..."
                              style={{
                                border: '1px solid #e1e7f0',
                                fontSize: '14px'
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Message Content */}
                      <div className="row mb-3">
                        <div className="col-12">
                          <div className="message-editor" style={{
                            border: '1px solid #e1e7f0',
                            borderRadius: '4px',
                            backgroundColor: '#fff'
                          }}>
                            <div className="editor-toolbar" style={{
                              padding: '8px 12px',
                              borderBottom: '1px solid #f1f3f5',
                              backgroundColor: '#f8f9fb',
                              display: 'flex',
                              gap: '8px',
                              flexWrap: 'wrap'
                            }}>
                              <button type="button" className="editor-btn" title="Bold">
                                <Icon name="bold" />
                              </button>
                              <button type="button" className="editor-btn" title="Italic">
                                <Icon name="italic" />
                              </button>
                              <button type="button" className="editor-btn" title="Underline">
                                <Icon name="underline" />
                              </button>
                              <span className="toolbar-separator"></span>
                              <button type="button" className="editor-btn" title="Ordered List">
                                <Icon name="list" />
                              </button>
                              <button type="button" className="editor-btn" title="Unordered List">
                                <Icon name="list-ul" />
                              </button>
                              <button type="button" className="editor-btn" title="Link">
                                <Icon name="link" />
                              </button>
                              <span className="toolbar-separator"></span>
                              <button type="button" className="editor-btn" title="Add Router" onClick={handleAddRouterFromReply}>
                                <Icon name="img" />
                              </button>
                              <button type="button" className="editor-btn" title="Clear Format">
                                <Icon name="clear" />
                              </button>
                            </div>
                            <textarea 
                              className="message-textarea"
                              placeholder="Type your reply here..."
                              value={replyForm.message}
                              onChange={(e) => handleReplyFormChange('message', e.target.value)}
                              rows="8"
                              style={{
                                width: '100%',
                                border: 'none',
                                padding: '12px',
                                resize: 'vertical',
                                fontSize: '14px',
                                lineHeight: '1.5',
                                outline: 'none'
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Attachments */}
                      <div className="attachment-section" style={{
                        border: '1px solid #e1e7f0',
                        borderRadius: '4px',
                        marginBottom: '16px'
                      }}>
                        <div className="attachment-header" style={{
                          padding: '12px 16px',
                          borderBottom: '1px solid #f1f3f5',
                          backgroundColor: '#f8f9fb',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <strong style={{ fontSize: '14px', fontWeight: '600' }}>Attachments</strong>
                          <label className="btn btn-outline-primary btn-sm" style={{
                            fontSize: '12px',
                            padding: '4px 8px',
                            margin: 0,
                            cursor: 'pointer'
                          }}>
                            <input
                              type="file"
                              multiple
                              onChange={handleReplyFileChange}
                              style={{ display: 'none' }}
                              accept="image/*,.pdf,.doc,.docx,.txt,.xls,.xlsx"
                            />
                            Add file
                          </label>
                        </div>
                        <div className="attachment-body" style={{ padding: '12px 16px' }}>
                          {replyForm.attachments && replyForm.attachments.length > 0 && (
                            <div style={{ marginBottom: replyForm.router ? '8px' : '0' }}>
                              {replyForm.attachments.map((file, index) => (
                                <div key={index} style={{
                                  padding: '8px 12px',
                                  backgroundColor: '#f0f9ff',
                                  border: '1px solid #3b82f6',
                                  borderRadius: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  marginBottom: '8px'
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Icon name="file" style={{ color: '#3b82f6' }} />
                                    <span style={{ fontSize: '13px', fontWeight: '500' }}>
                                      {file.name}
                                    </span>
                                    <span style={{ fontSize: '12px', color: '#6c757d' }}>
                                      ({(file.size / 1024).toFixed(2)} KB)
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveReplyFile(index)}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#f44336',
                                      cursor: 'pointer',
                                      fontSize: '16px',
                                      padding: '0 4px'
                                    }}
                                    title="Remove file"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          {replyForm.router ? (
                            <div style={{
                              padding: '8px 12px',
                              backgroundColor: '#e8f5e9',
                              border: '1px solid #4caf50',
                              borderRadius: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Icon name="check-circle" style={{ color: '#4caf50' }} />
                                <span style={{ fontSize: '13px', fontWeight: '500' }}>
                                  Router {replyForm.router.routerNumber} attached ({replyForm.router.images.length} images)
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setReplyForm(prev => ({ ...prev, router: null }))}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#f44336',
                                  cursor: 'pointer',
                                  fontSize: '16px',
                                  padding: '0 4px'
                                }}
                                title="Remove router"
                              >
                                ×
                              </button>
                            </div>
                          ) : (
                            replyForm.attachments && replyForm.attachments.length === 0 && (
                              <p style={{ margin: 0, color: '#6c757d', fontSize: '13px' }}>No attachments</p>
                            )
                          )}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="form-actions" style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '12px'
                      }}>
                        <button 
                          type="button" 
                          className="btn btn-secondary"
                          onClick={handleCancelReply}
                        >
                          Cancel
                        </button>
                        
                        <div className="send-group" style={{ display: 'flex', gap: '0' }}>
                          <button 
                            type="button" 
                            className="btn btn-primary" 
                            style={{
                              borderTopRightRadius: 0,
                              borderBottomRightRadius: 0
                            }}
                            onClick={() => handleSendReply()}
                            disabled={loading}
                          >
                            {loading ? 'Sending...' : 'Send'}
                          </button>
                          <div className="dropdown">
                            <button 
                              type="button" 
                              className="btn btn-primary dropdown-toggle dropdown-toggle-split" 
                              data-bs-toggle="dropdown"
                              style={{
                                borderTopLeftRadius: 0,
                                borderBottomLeftRadius: 0,
                                borderLeft: '1px solid rgba(255,255,255,0.25)'
                              }}
                              disabled={loading}
                            ></button>
                            <ul className="dropdown-menu dropdown-menu-end" style={{ minWidth: '250px' }}>
                              <li><button type="button" className="dropdown-item" onClick={() => handleSendReply('new')}>Send and set as New</button></li>
                              <li><button type="button" className="dropdown-item" onClick={() => handleSendReply('work in progress')}>Send and set as Work in progress</button></li>
                              <li><button type="button" className="dropdown-item" onClick={() => handleSendReply('resolved')}>Send and set as Resolved</button></li>
                              <li><button type="button" className="dropdown-item" onClick={() => handleSendReply('waiting on customer')}>Send and set as Waiting on customer</button></li>
                              <li><button type="button" className="dropdown-item" onClick={() => handleSendReply('waiting on agent')}>Send and set as Waiting on agent</button></li>
                              <li><button type="button" className="dropdown-item" onClick={() => handleSendReply('customer unreachable')}>Send and set as Customer unreachable</button></li>
                              <li><hr className="dropdown-divider" /></li>
                              <li><button type="button" className="dropdown-item" onClick={() => handleSendReply('closed')}>Send and close</button></li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </form>
                    </div>
                  </div>
                </div>
                </>
              )}

              {/* Note Card Modal */}
              {showNoteCard && (
                <>
                  {/* Modal Backdrop */}
                  <div 
                    style={{
                      position: 'fixed',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: 'rgba(0, 0, 0, 0.5)',
                      zIndex: 9998,
                      backdropFilter: 'blur(2px)'
                    }}
                    onClick={handleCancelNote}
                  />
                  
                  {/* Modal Content */}
                  <div 
                    className="note-card" 
                    style={{
                      position: 'fixed',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      backgroundColor: '#fff',
                      border: '0 solid #f7f8fc',
                      borderRadius: '12px',
                      boxShadow: '0 20px 60px rgba(0,0,0,.3)',
                      zIndex: 9999,
                      maxWidth: window.innerWidth < 768 ? '95vw' : '700px',
                      width: '100%',
                      maxHeight: window.innerWidth < 768 ? '90vh' : '85vh',
                      overflowY: 'auto',
                      animation: 'fadeInScale 0.3s ease-out'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="card-body" style={{ padding: '20px', position: 'relative' }}>
                    {/* Close Button */}
                    <button
                      onClick={handleCancelNote}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#ef4444';
                        e.currentTarget.style.transform = 'scale(1.2)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#6b7280';
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                      style={{
                        position: 'absolute',
                        top: '16px',
                        right: '16px',
                        background: 'none',
                        border: 'none',
                        fontSize: '28px',
                        color: '#6b7280',
                        cursor: 'pointer',
                        padding: '4px',
                        lineHeight: '1',
                        zIndex: 1,
                        transition: 'all 0.2s ease'
                      }}
                      title="Close"
                    >
                      ×
                    </button>
                    
                    <div className="form-horizontal">
                      <h6 style={{ marginBottom: '16px', color: '#374151', fontWeight: '600' }}>Add Note</h6>
                      <form className="communication-form">
                        {/* Private Note Toggle */}
                        <div className="row mb-3">
                          <div className="col-12">
                            <div className="form-check">
                              <input 
                                className="form-check-input"
                                type="checkbox"
                                id="privateNote"
                                checked={noteForm.isPrivate}
                                onChange={(e) => handleNoteFormChange('isPrivate', e.target.checked)}
                              />
                              <label className="form-check-label" htmlFor="privateNote">
                                Private note (only visible to staff)
                              </label>
                            </div>
                          </div>
                        </div>

                        {/* Message Content */}
                        <div className="row mb-3">
                          <div className="col-12">
                            <div className="message-editor" style={{
                              border: '1px solid #e1e7f0',
                              borderRadius: '4px',
                              backgroundColor: '#fff'
                            }}>
                              <div className="editor-toolbar" style={{
                                padding: '8px 12px',
                                borderBottom: '1px solid #f1f3f5',
                                backgroundColor: '#f8f9fb',
                                display: 'flex',
                                gap: '8px',
                                flexWrap: 'wrap'
                              }}>
                                <button type="button" className="editor-btn" title="Bold">
                                  <Icon name="bold" />
                                </button>
                                <button type="button" className="editor-btn" title="Italic">
                                  <Icon name="italic" />
                                </button>
                                <button type="button" className="editor-btn" title="Underline">
                                  <Icon name="underline" />
                                </button>
                                <span className="toolbar-separator"></span>
                                <button type="button" className="editor-btn" title="Ordered List">
                                  <Icon name="list" />
                                </button>
                                <button type="button" className="editor-btn" title="Unordered List">
                                  <Icon name="list-ul" />
                                </button>
                                <button type="button" className="editor-btn" title="Link">
                                  <Icon name="link" />
                                </button>
                                <span className="toolbar-separator"></span>
                                <button type="button" className="editor-btn" title="Image">
                                  <Icon name="img" />
                                </button>
                                <button type="button" className="editor-btn" title="Clear Format">
                                  <Icon name="clear" />
                                </button>
                              </div>
                              <textarea 
                                className="message-textarea"
                                placeholder="Type your note here..."
                                value={noteForm.message}
                                onChange={(e) => handleNoteFormChange('message', e.target.value)}
                                rows="6"
                                style={{
                                  width: '100%',
                                  border: 'none',
                                  padding: '12px',
                                  resize: 'vertical',
                                  fontSize: '14px',
                                  lineHeight: '1.5',
                                  outline: 'none'
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Attachments */}
                        <div className="attachment-section" style={{
                          border: '1px solid #e1e7f0',
                          borderRadius: '4px',
                          marginBottom: '16px'
                        }}>
                          <div className="attachment-header" style={{
                            padding: '12px 16px',
                            borderBottom: '1px solid #f1f3f5',
                            backgroundColor: '#f8f9fb',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}>
                            <strong style={{ fontSize: '14px', fontWeight: '600' }}>Attachments</strong>
                            <label className="btn btn-outline-primary btn-sm" style={{
                              fontSize: '12px',
                              padding: '4px 8px',
                              margin: 0,
                              cursor: 'pointer'
                            }}>
                              <input
                                type="file"
                                multiple
                                onChange={handleNoteFileChange}
                                style={{ display: 'none' }}
                                accept="image/*,.pdf,.doc,.docx,.txt,.xls,.xlsx"
                              />
                              Add file
                            </label>
                          </div>
                          <div className="attachment-body" style={{ padding: '12px 16px' }}>
                            {noteForm.attachments && noteForm.attachments.length > 0 ? (
                              <div>
                                {noteForm.attachments.map((file, index) => (
                                  <div key={index} style={{
                                    padding: '8px 12px',
                                    backgroundColor: '#f0f9ff',
                                    border: '1px solid #3b82f6',
                                    borderRadius: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    marginBottom: '8px'
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <Icon name="file" style={{ color: '#3b82f6' }} />
                                      <span style={{ fontSize: '13px', fontWeight: '500' }}>
                                        {file.name}
                                      </span>
                                      <span style={{ fontSize: '12px', color: '#6c757d' }}>
                                        ({(file.size / 1024).toFixed(2)} KB)
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveNoteFile(index)}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#f44336',
                                        cursor: 'pointer',
                                        fontSize: '16px',
                                        padding: '0 4px'
                                      }}
                                      title="Remove file"
                                    >
                                      ×
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p style={{ margin: 0, color: '#6c757d', fontSize: '13px' }}>No attachments</p>
                            )}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="form-actions" style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '12px'
                        }}>
                          <button 
                            type="button" 
                            className="btn btn-secondary"
                            onClick={handleCancelNote}
                          >
                            Cancel
                          </button>
                          
                          <button 
                            type="button" 
                            className="btn btn-primary" 
                            onClick={() => handleSendNote()}
                            disabled={loading || !noteForm.message.trim()}
                          >
                            {loading ? 'Adding...' : 'Add Note'}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                </div>
                </>
              )}

              {/* Router Card Modal */}
              {showRouterCard && (
                <>
                  {/* Modal Backdrop */}
                  <div 
                    style={{
                      position: 'fixed',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: 'rgba(0, 0, 0, 0.5)',
                      zIndex: 9998,
                      backdropFilter: 'blur(2px)'
                    }}
                    onClick={handleCancelRouter}
                  />
                  
                  {/* Modal Content */}
                  <div 
                    className="router-card" 
                    style={{
                      position: 'fixed',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      backgroundColor: '#fff',
                      border: '2px solid #10b981',
                      borderRadius: '12px',
                      boxShadow: '0 20px 60px rgba(16,185,129,.4)',
                      zIndex: 9999,
                      maxWidth: window.innerWidth < 768 ? '95vw' : '700px',
                      width: '100%',
                      maxHeight: window.innerWidth < 768 ? '90vh' : '85vh',
                      overflowY: 'auto',
                      animation: 'fadeInScale 0.3s ease-out'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="card-body" style={{ padding: '20px', position: 'relative' }}>
                    {/* Close Button */}
                    <button
                      onClick={handleCancelRouter}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#ef4444';
                        e.currentTarget.style.transform = 'scale(1.2)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#6b7280';
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                      style={{
                        position: 'absolute',
                        top: '16px',
                        right: '16px',
                        background: 'none',
                        border: 'none',
                        fontSize: '28px',
                        color: '#6b7280',
                        cursor: 'pointer',
                        padding: '4px',
                        lineHeight: '1',
                        zIndex: 1,
                        transition: 'all 0.2s ease'
                      }}
                      title="Close"
                    >
                      ×
                    </button>
                    
                    <div className="form-horizontal">
                      <h6 style={{ 
                        marginBottom: '16px', 
                        color: '#10b981', 
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        <Icon name="router" />
                        Add Router Information
                        {splittersUpdated && (
                          <span style={{
                            marginLeft: 'auto',
                            backgroundColor: '#10b981',
                            color: 'white',
                            padding: '4px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: '500'
                          }}>
                            ✓ Updated
                          </span>
                        )}
                      </h6>
                      <form className="communication-form">
                        {/* Team router picker + serial search */}
                        <div className="row mb-3">
                          <div className="col-12">
                            {isFieldRole && (
                              <>
                                <label className="form-label" style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>
                                  Select team router
                                </label>
                                <select
                                  className="form-control mb-2"
                                  value={invLinkedRouter?.id ? String(invLinkedRouter.id) : ''}
                                  onChange={(e) => {
                                    const router = groupTeamRouters.find((r) => String(r.id) === e.target.value);
                                    if (router) {
                                      handleSelectInvRouter(router);
                                    } else {
                                      setInvLinkedRouter(null);
                                      setRouterForm((prev) => ({ ...prev, routerNumber: '' }));
                                      setInvSearchResults(groupTeamRouters);
                                    }
                                  }}
                                >
                                  <option value="">— Pick a router from your team —</option>
                                  {groupTeamRouters.map((r) => (
                                    <option key={r.id} value={r.id}>
                                      {r.name}
                                      {r.serial_number ? ` (${r.serial_number})` : ''}
                                      {r.assigned_to_name ? ` — ${r.assigned_to_name}` : ''}
                                    </option>
                                  ))}
                                </select>
                              </>
                            )}
                            <label className="form-label" style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>
                              Router Number <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <div style={{ position: 'relative' }}>
                              <input
                                type="text"
                                className="form-control"
                                value={routerForm.routerNumber}
                                onFocus={() => {
                                  if (isFieldRole) setInvSearchResults(groupTeamRouters);
                                }}
                                onChange={(e) => {
                                  const val = e.target.value.toUpperCase();
                                  handleRouterFormChange('routerNumber', val);
                                  handleInvSerialSearch(val);
                                }}
                                placeholder={isFieldRole
                                  ? 'Or type to filter your team routers…'
                                  : 'Type last characters of serial number to search inventory…'}
                                style={{
                                  border: invLinkedRouter ? '2px solid #10b981' : '2px solid #e1e7f0',
                                  fontSize: '15px',
                                  padding: '12px 16px',
                                  fontWeight: '600',
                                  letterSpacing: '0.5px',
                                  textTransform: 'uppercase'
                                }}
                              />
                              {invSearching && (
                                <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#9ca3af' }}>
                                  searching…
                                </span>
                              )}
                            </div>

                            {isFieldRole && groupTeamRouters.length === 0 && (
                              <small className="text-warning d-block mt-1">
                                No team routers for today.{' '}
                                <a href="/admin/tickets/daily-schedule">Check your team roster</a> first.
                              </small>
                            )}
                            {isFieldRole && groupTeamRouters.length > 0 && (
                              <small className="text-muted d-block mt-1">
                                {groupTeamRouters.length} team router{groupTeamRouters.length !== 1 ? 's' : ''} available — click the field to browse or type to filter.
                              </small>
                            )}

                            {/* Inventory search results dropdown */}
                            {invSearchResults.length > 0 && !invLinkedRouter && (
                              <div style={{
                                border: '1px solid #d1d5db', borderRadius: 8, overflow: 'hidden',
                                marginTop: 4, background: '#fff',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, position: 'relative'
                              }}>
                                {invSearchResults.map(r => (
                                  <div
                                    key={r.id}
                                    onMouseDown={() => handleSelectInvRouter(r)}
                                    style={{
                                      padding: '9px 14px', cursor: 'pointer',
                                      borderBottom: '1px solid #f3f4f6',
                                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                      background: '#fafafa'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f0fdf4'}
                                    onMouseLeave={e => e.currentTarget.style.background = '#fafafa'}
                                  >
                                    <div>
                                      <strong style={{ fontSize: 13 }}>{r.name}</strong>
                                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#6b7280', marginLeft: 8 }}>{r.serial_number}</span>
                                      {r.assigned_to_name && (
                                        <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>→ {r.assigned_to_name}</span>
                                      )}
                                    </div>
                                    <span style={{
                                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                                      background: r.status === 'active' ? '#d1fae5' : r.status === 'disbursed' ? '#dbeafe' : '#fee2e2',
                                      color: r.status === 'active' ? '#065f46' : r.status === 'disbursed' ? '#1e40af' : '#991b1b'
                                    }}>
                                      {r.status}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Linked inventory router confirmation chip */}
                            {invLinkedRouter && (
                              <div style={{
                                marginTop: 6, padding: '8px 12px', background: '#f0fdf4',
                                border: '1px solid #6ee7b7', borderRadius: 8,
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                              }}>
                                <span style={{ fontSize: 13, color: '#065f46' }}>
                                  ✓ Inventory router <strong>{invLinkedRouter.name}</strong> will be linked to this ticket
                                  {invLinkedRouter.assigned_to_name && ` · assigned to ${invLinkedRouter.assigned_to_name}`}
                                </span>
                                <button
                                  type="button"
                                  onMouseDown={() => { setInvLinkedRouter(null); setRouterForm(prev => ({ ...prev, routerNumber: '' })); }}
                                  style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
                                >×</button>
                              </div>
                            )}

                            <small style={{ color: '#6b7280', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                              {isFieldRole
                                ? 'Team routers from today\'s roster — yours and teammates\' disbursed routers'
                                : 'Type characters of the serial number to find the router from inventory'}
                            </small>
                          </div>
                        </div>

                        {/* Image Upload Section */}
                        <div className="image-upload-section" style={{
                          border: '2px dashed #10b981',
                          borderRadius: '8px',
                          marginBottom: '16px',
                          padding: '16px',
                          backgroundColor: '#f0fdf4'
                        }}>
                          <div style={{
                            textAlign: 'center',
                            marginBottom: '12px'
                          }}>
                            <Icon name="camera" style={{ fontSize: '32px', color: '#10b981', marginBottom: '8px' }} />
                            <h6 style={{ color: '#374151', fontWeight: '600', marginBottom: '8px' }}>
                              Add Router Images
                            </h6>
                            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>
                              Take photos or upload images of the router
                            </p>
                          </div>

                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                            {/* Camera Capture Button (Mobile) */}
                            <label 
                              htmlFor="router-camera"
                              className="btn btn-outline-primary"
                              style={{
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '13px',
                                padding: '8px 16px'
                              }}
                            >
                              <Icon name="camera" />
                              Take Photo
                              <input 
                                type="file"
                                id="router-camera"
                                accept="image/*"
                                capture="environment"
                                onChange={handleRouterCameraCapture}
                                style={{ display: 'none' }}
                                multiple
                              />
                            </label>

                            {/* File Upload Button */}
                            <label 
                              htmlFor="router-upload"
                              className="btn btn-outline-primary"
                              style={{
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '13px',
                                padding: '8px 16px'
                              }}
                            >
                              <Icon name="upload" />
                              Upload Image
                              <input 
                                type="file"
                                id="router-upload"
                                accept="image/*"
                                onChange={handleRouterImageUpload}
                                style={{ display: 'none' }}
                                multiple
                              />
                            </label>
                          </div>

                          {/* Image Previews */}
                          {routerForm.previewUrls.length > 0 && (
                            <div style={{
                              marginTop: '16px',
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                              gap: '12px'
                            }}>
                              {routerForm.previewUrls.map((url, index) => (
                                <div 
                                  key={index}
                                  style={{
                                    position: 'relative',
                                    borderRadius: '8px',
                                    overflow: 'hidden',
                                    border: '2px solid #e5e7eb',
                                    aspectRatio: '1',
                                    backgroundColor: '#f9fafb'
                                  }}
                                >
                                  <img 
                                    src={url}
                                    alt={`Router ${index + 1}`}
                                    style={{
                                      width: '100%',
                                      height: '100%',
                                      objectFit: 'cover'
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveRouterImage(index)}
                                    style={{
                                      position: 'absolute',
                                      top: '4px',
                                      right: '4px',
                                      backgroundColor: '#ef4444',
                                      color: '#fff',
                                      border: 'none',
                                      borderRadius: '50%',
                                      width: '24px',
                                      height: '24px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: 'pointer',
                                      fontSize: '16px',
                                      fontWeight: 'bold',
                                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                    }}
                                    title="Remove image"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          <p style={{ 
                            fontSize: '12px', 
                            color: '#6b7280', 
                            marginTop: '12px',
                            marginBottom: 0,
                            textAlign: 'center'
                          }}>
                            {routerForm.images.length} image(s) selected
                          </p>
                        </div>

                        {/* Action Buttons */}
                        <div className="form-actions" style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '12px'
                        }}>
                          <button 
                            type="button" 
                            className="btn btn-secondary"
                            onClick={handleCancelRouter}
                          >
                            Cancel
                          </button>
                          
                          <button 
                            type="button" 
                            className="btn" 
                            onClick={handleSaveRouter}
                            disabled={loading || !routerForm.routerNumber.trim() || routerForm.images.length === 0}
                            style={{
                              backgroundColor: '#10b981',
                              borderColor: '#10b981',
                              color: '#fff'
                            }}
                          >
                            {loading ? 'Saving...' : 'Save Router'}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                </div>
                </>
              )}
            </div>

            {/* Right Sidebar */}
            <div className="ticket-sidebar">
              {/* Customer Info */}
              <div className="customer-info-block">
                <div className="customer-avatar-section">
                  <div className="customer-avatar" style={{ 
                    backgroundColor: '#3b82f6',
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                    fontWeight: '600',
                    color: '#fff'
                  }}>
                    {(ticket.customer_name || ticket.customer?.name || 'C').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ marginLeft: '12px', flex: 1 }}>
                    <div style={{ 
                      fontSize: '16px', 
                      fontWeight: '600', 
                      color: '#1f2937',
                      marginBottom: '4px'
                    }}>
                      {ticket.customer_name || ticket.customer?.name ? (
                        ticket.customer_name || ticket.customer?.name
                      ) : (ticket.customer_phone || ticket.customer?.phone) ? (
                        <a
                          href={`tel:${ticket.customer_phone || ticket.customer?.phone}`}
                          style={{
                            color: '#28a745',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
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
                          <Icon name="call" style={{ fontSize: '14px' }} />
                          Phone: {ticket.customer_phone || ticket.customer?.phone}
                        </a>
                      ) : (
                        'Unknown Customer'
                      )}
                    </div>
                    <div style={{ 
                      fontSize: '13px', 
                      color: '#6b7280'
                    }}>
                      {ticket.customer_email || ticket.customer?.email || 'No email'}
                    </div>
                  </div>
                </div>
                
                {(() => {
                  const tl = (ticket.type || ticket.typeLabel || '').toString().toLowerCase().trim();
                  return (tl === 'installation' || tl === 'installation 2') &&
                  (ticket.installation_price != null || ticket.installationPrice != null);
                })() && (
                  <div style={{
                    marginTop: '12px',
                    padding: '10px 12px',
                    backgroundColor: '#ecfdf5',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}>
                    <span style={{ color: '#6b7280', marginRight: '6px' }}>Installation price:</span>
                    <strong style={{ color: '#047857' }}>
                      KES {Number(ticket.installation_price ?? ticket.installationPrice).toLocaleString()}
                    </strong>
                  </div>
                )}

                {(ticket.customer_phone || ticket.customer?.phone || ticket.phone) && (
                  <div className="customer-phone-display" style={{
                    marginTop: '12px',
                    padding: '10px 12px',
                    backgroundColor: '#f3f4f6',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <Icon name="call" style={{ color: '#10b981', fontSize: '16px' }} />
                    <a 
                      href={`tel:${ticket.customer_phone || ticket.customer?.phone || ticket.phone || ''}`}
                      style={{ 
                        color: '#28a745',
                        textDecoration: 'none',
                        fontSize: '14px',
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
                      {ticket.customer_phone || ticket.customer?.phone || ticket.phone}
                    </a>
                  </div>
                )}
                
                {/* Customer Location Status */}
                <div className="customer-location-display" style={{
                  marginTop: '12px',
                  padding: '10px 12px',
                  backgroundColor: customerLocation.hasLocation ? '#f0f9ff' : '#f9f9f9',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: `1px solid ${customerLocation.hasLocation ? '#bae6fd' : '#e5e7eb'}`
                }}>
                  <Icon 
                    name={customerLocation.loading ? "loader" : customerLocation.hasLocation ? "map-pin" : "location"} 
                    style={{ 
                      color: customerLocation.hasLocation ? '#0284c7' : '#6b7280', 
                      fontSize: '16px' 
                    }} 
                  />
                  {customerLocation.loading ? (
                    <span style={{ color: '#6b7280', fontSize: '14px', fontStyle: 'italic' }}>
                      Loading location...
                    </span>
                  ) : customerLocation.hasLocation ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                      <span style={{ 
                        color: '#0284c7',
                        fontSize: '14px',
                        fontWeight: '600'
                      }}>
                        Location: {customerLocation.latitude?.toFixed(6)}, {customerLocation.longitude?.toFixed(6)}
                      </span>
                      <button 
                        onClick={handleNavigateToLocation}
                        style={{
                          background: 'none',
                          border: '1px solid #0284c7',
                          color: '#0284c7',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '12px',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.backgroundColor = '#0284c7';
                          e.target.style.color = '#fff';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.backgroundColor = 'transparent';
                          e.target.style.color = '#0284c7';
                        }}
                      >
                        View on Map
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                      <span style={{ color: '#6b7280', fontSize: '14px', fontStyle: 'italic' }}>
                        {ticket?.customer_id ? 'No location set' : 'New installation - location will be saved after adding'}
                      </span>
                      <button 
                        onClick={() => {
                          // Force reload customer location
                          const customerId = ticket?.customer_id || ticket?.customerId || ticket?.customer?.id;
                          if (customerId) {
                            console.log('Force reloading location for customer ID:', customerId);
                            loadCustomerLocation(customerId);
                          } else {
                            console.log('No customer ID available for location reload');
                          }
                        }}
                        style={{
                          background: 'none',
                          border: '1px solid #0284c7',
                          color: '#0284c7',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        Refresh Location
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Form Fields */}
              <div className="sidebar-form">
                {!isCustomerCreator && (
                <div className="sidebar-section">
                  <label className="sidebar-label">Hide from customer</label>
                  <label className="sidebar-toggle">
                    <input type="checkbox" checked={formState.hidden} onChange={(e) => handleFormChange('hidden', e.target.checked)} />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                )}

                <div className="sidebar-section">
                  <label className="sidebar-label">Customer / Lead</label>
                  <select className="sidebar-select" value={formState.customer} onChange={(e) => handleFormChange('customer', e.target.value)} disabled={isCustomerCreator}>
                    <option value={ticket.phone || formState.customer}>{ticket.phone || formState.customer || 'Customer'}</option>
                  </select>
                </div>

                <div className="sidebar-section">
                  <label className="sidebar-label">Assigned to</label>
                  <RSelect
                    placeholder="Select assignees"
                    options={assignToOptions.filter(o => o.value !== '0')}
                    value={Array.isArray(formState.assigned_to) ? formState.assigned_to : (formState.assigned_to && formState.assigned_to.value ? [formState.assigned_to] : [])}
                    onChange={(selected) => {
                      // selected will be array (for multi) or null
                      if (!selected || selected.length === 0) {
                        handleFormChange('assigned_to', []);
                      } else {
                        // If single option returned (react-select sometimes returns object), normalize
                        const normalized = Array.isArray(selected) ? selected : [selected];
                        handleFormChange('assigned_to', normalized);
                      }
                    }}
                    isMulti={true}
                    closeMenuOnSelect={false}
                    hideSelectedOptions={false}
                    isSearchable={true}
                    isDisabled={isCustomerCreator || isTechnician}
                    maxMenuHeight={300}
                    className="react-select-container"
                    classNamePrefix="react-select"
                  />
                </div>

                <div className="sidebar-section">
                  <label className="sidebar-label">Group</label>
                  <select className="sidebar-select" value={formState.group} onChange={(e) => handleFormChange('group', e.target.value)} disabled={isCustomerCreator}>
                    <option value="Any">Any</option>
                    <option value="IT">IT</option>
                    <option value="Finance">Finance</option>
                    <option value="Sales">Sales</option>
                  </select>
                </div>

                <div className="sidebar-section">
                  <label className="sidebar-label">Watchers</label>
                  <RSelect
                    placeholder="Select watchers"
                    options={watcherOptions}
                    value={formState.watchers}
                    onChange={(selectedOptions) => handleFormChange('watchers', selectedOptions || [])}
                    isSearchable={true}
                    isMulti={true}
                    isDisabled={isCustomerCreator}
                    maxMenuHeight={200}
                    className="react-select-container"
                    classNamePrefix="react-select"
                  />
                </div>

                <div className="sidebar-section">
                  <label className="sidebar-label">Subject</label>
                  <input 
                    type="text" 
                    className="sidebar-input" 
                    value={formState.subject}
                    onChange={(e) => handleFormChange('subject', e.target.value)}
                    readOnly={isCustomerCreator}
                  />
                </div>

                <div className="sidebar-section">
                  <label className="sidebar-label">Priority</label>
                  <select className="sidebar-select" value={formState.priority} onChange={(e) => handleFormChange('priority', e.target.value)} disabled={isCustomerCreator}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div className="sidebar-section">
                  <label className="sidebar-label">Status</label>
                  <select className="sidebar-select" value={formState.status} onChange={(e) => handleFormChange('status', e.target.value)} disabled={isCustomerCreator}>
                    <option value="new">New</option>
                    <option value="open">Work in progress</option>
                    <option value="resolved">Resolved</option>
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
                    <option value="closed">Closed</option>
                  </select>
                </div>

                <div className="sidebar-section">
                  <label className="sidebar-label">Type</label>
                  <select className="sidebar-select" value={formState.type} onChange={(e) => handleFormChange('type', e.target.value)} disabled={isCustomerCreator || isTechnician}>
                    {TICKET_TYPES.map((t) => (
                      <option key={t.value} value={t.label}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div className="sidebar-section">
                  <label className="sidebar-label">Labels</label>
                  <input 
                    type="text" 
                    className="sidebar-input" 
                    value={formState.labels}
                    onChange={(e) => handleFormChange('labels', e.target.value)}
                    placeholder="Start typing label name"
                  />
                </div>

                <div className="sidebar-section">
                  <label className="sidebar-label">Note</label>
                  <textarea 
                    className="sidebar-textarea" 
                    rows="2"
                    value={formState.note}
                    onChange={(e) => handleFormChange('note', e.target.value)}
                    placeholder="Enter note"
                  />
                </div>
              </div>

              {/* Update Button Group */}
              {!isCustomerCreator && (
              <div className="sidebar-update-group">
                <button className="sidebar-update-btn" onClick={handleUpdateTicket} disabled={loading}>
                  {loading ? 'Updating...' : 'Update'}
                </button>
                <button className="sidebar-update-dropdown" title="More options">
                  <Icon name="chevron-up" />
                </button>
              </div>
              )}
            </div>
          </div>
        </div>
      </Content>

      {/* Status Popover */}
      {statusPopover.open && (
        <>
          {/* Backdrop */}
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 9998
            }}
            onClick={closeStatusPopover}
          />
          
          {/* Popover */}
          <div
            className="webui-popover bottom in"
            style={{
              position: 'fixed',
              top: statusPopover.top,
              left: statusPopover.left,
              display: 'block',
              width: '280px',
              zIndex: 9999,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              border: '1px solid #e5e9f2',
              borderRadius: '4px',
              backgroundColor: '#fff'
            }}
          >
            <div className="webui-popover-inner">
              <h6 className="webui-popover-title" style={{ 
                padding: '12px 16px',
                margin: 0,
                borderBottom: '1px solid #e5e9f2',
                fontSize: '14px',
                fontWeight: '600',
                color: '#364a63'
              }}>
                Select status
              </h6>
              <div className="webui-popover-content" style={{ padding: '8px 0' }}>
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  <ul className="popover-dropdown" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {[
                      { key: 'new', label: 'New', badge: 'bg-info' },
                      { key: 'open', label: 'Work in progress', badge: 'bg-success' },
                      { key: 'resolved', label: 'Resolved', badge: 'bg-default' },
                      { key: 'installation complete', label: 'Installation complete', badge: 'bg-success' },
                      { key: 'waiting_customer', label: 'Waiting on customer', badge: 'bg-warning' },
                      { key: 'waiting_agent', label: 'Waiting on agent', badge: 'bg-info' },
                      { key: 'waiting_power', label: 'Waiting on power', badge: 'bg-warning' },
                      { key: 'power_available', label: 'Power available', badge: 'bg-success' },
                      { key: 'customer_unreachable', label: 'Customer unreachable', badge: 'bg-warning' },
                      { key: 'booked_later', label: 'Booked to a further date', badge: 'bg-info' },
                      { key: 'out_of_range', label: 'Customer out of range', badge: 'bg-warning' },
                      { key: 'installed_elsewhere', label: 'Already installed by another provider', badge: 'bg-default' },
                      { key: 'long_distance', label: 'Long distance', badge: 'bg-info' },
                      { key: 'pole_needed', label: 'Pole needed', badge: 'bg-warning' },
                      { key: 'closed', label: 'Closed', badge: 'bg-secondary' },
                    ].map((opt) => (
                      <li 
                        key={opt.key} 
                        className={statusPopover.selected === opt.key ? 'selected' : ''} 
                        onClick={() => selectStatus(opt.key)}
                        style={{
                          padding: '8px 16px',
                          cursor: 'pointer',
                          backgroundColor: statusPopover.selected === opt.key ? '#f8f9fa' : 'transparent',
                          transition: 'background-color 0.2s ease'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                        onMouseLeave={(e) => {
                          if (statusPopover.selected !== opt.key) {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }
                        }}
                      >
                        <span style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'space-between', 
                          width: '100%' 
                        }}>
                          <span>
                            <label className={`badge ${opt.badge}`} style={{
                              fontSize: '11px',
                              padding: '4px 8px',
                              borderRadius: '3px',
                              fontWeight: '500',
                              cursor: 'pointer'
                            }}>
                              {opt.label}
                            </label>
                          </span>
                          {statusPopover.selected === opt.key && (
                            <span className="btn-icon-sm color-success pull-right">
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
        </>
      )}
      
      {/* ── Pre-status-change reminder modal ───────────────────────── */}
      {reminderModal.open && (
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
              padding: '18px 24px',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: '50%',
                background: 'rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.4rem',
              }}>⚠️</div>
              <div>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.05rem' }}>
                  Before changing status
                </div>
                <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.82rem' }}>
                  Ticket → <strong style={{ color: '#fff' }}>{reminderModal.pendingStatus}</strong>
                </div>
              </div>
            </div>

            <div style={{ padding: '22px 24px' }}>
              {reminderModal.step === 'ask' ? (
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
                      onClick={() => {
                        setReminderModal({ open: false, pendingStatus: null, step: 'ask' });
                        doStatusChange(reminderModal.pendingStatus);
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
                      onClick={() => setReminderModal(p => ({ ...p, step: 'choose' }))}
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
                    What would you like to update?
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                    {/* Splitters */}
                    <button
                      onClick={() => {
                        setReminderModal({ open: false, pendingStatus: null, step: 'ask' });
                        setShowNearbyInfra(true);
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        padding: '13px 16px', borderRadius: 10,
                        border: '2px solid #3b82f6', background: '#eff6ff',
                        cursor: 'pointer', textAlign: 'left', width: '100%',
                      }}
                    >
                      <span style={{ fontSize: '1.6rem' }}>🔗</span>
                      <div>
                        <div style={{ fontWeight: 700, color: '#1d4ed8', fontSize: '0.92rem' }}>Update Splitters</div>
                        <div style={{ color: '#6b7280', fontSize: '0.78rem' }}>Find and update nearby infrastructure</div>
                      </div>
                      <em className="icon ni ni-arrow-right ml-auto" style={{ color: '#3b82f6' }} />
                    </button>

                    {/* Inventory */}
                    <button
                      onClick={() => {
                        setReminderModal({ open: false, pendingStatus: null, step: 'ask' });
                        refreshInventoryForTicket();
                        setShowInvModal(true);
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        padding: '13px 16px', borderRadius: 10,
                        border: '2px solid #f59e0b', background: '#fffbeb',
                        cursor: 'pointer', textAlign: 'left', width: '100%',
                      }}
                    >
                      <span style={{ fontSize: '1.6rem' }}>📦</span>
                      <div>
                        <div style={{ fontWeight: 700, color: '#b45309', fontSize: '0.92rem' }}>Log Inventory</div>
                        <div style={{ color: '#6b7280', fontSize: '0.78rem' }}>Record items used on this ticket</div>
                      </div>
                      <em className="icon ni ni-arrow-right ml-auto" style={{ color: '#f59e0b' }} />
                    </button>

                    {/* Router */}
                    <button
                      onClick={() => {
                        setReminderModal({ open: false, pendingStatus: null, step: 'ask' });
                        handleAddRouter();
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        padding: '13px 16px', borderRadius: 10,
                        border: '2px solid #10b981', background: '#f0fdf4',
                        cursor: 'pointer', textAlign: 'left', width: '100%',
                      }}
                    >
                      <span style={{ fontSize: '1.6rem' }}>📡</span>
                      <div>
                        <div style={{ fontWeight: 700, color: '#065f46', fontSize: '0.92rem' }}>Add / Update Router</div>
                        <div style={{ color: '#6b7280', fontSize: '0.78rem' }}>Add router number and photos</div>
                      </div>
                      <em className="icon ni ni-arrow-right ml-auto" style={{ color: '#10b981' }} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => setReminderModal(p => ({ ...p, step: 'ask' }))}
                      style={{
                        flex: 1, padding: '9px 0', borderRadius: 8,
                        border: '1px solid #e5e9f2', background: '#f8f9fc',
                        color: '#526484', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
                      }}
                    >
                      ← Back
                    </button>
                    <button
                      onClick={() => {
                        setReminderModal({ open: false, pendingStatus: null, step: 'ask' });
                        doStatusChange(reminderModal.pendingStatus);
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
      )}

      {/* Nearby Infrastructure Modal */}
      <NearbyInfrastructure 
        isOpen={showNearbyInfra} 
        toggle={() => setShowNearbyInfra(false)} 
        setSplittersUpdated={setSplittersUpdated}
        user={user}
      />

      {/* ── Inventory Used Modal ───────────────────────────────────────── */}
      {showInvModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1060,
            background: 'rgba(0,0,0,0.45)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowInvModal(false); }}
        >
          <div style={{
            background: '#fff', borderRadius: 12, width: '100%', maxWidth: 680,
            maxHeight: '90vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            {/* Modal header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: '1px solid #e5e9f2',
              background: '#fffbeb', borderRadius: '12px 12px 0 0',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <em className="icon ni ni-package" style={{ fontSize: '1.3rem', color: '#f59e0b' }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: '#364a63' }}>Inventory Used</div>
                  <div style={{ fontSize: '0.75rem', color: '#8094ae' }}>
                    Ticket #{ticket?.number || ticket?.ticket_number || ticket?.id}
                  </div>
                </div>
              </div>
              <button onClick={() => setShowInvModal(false)} style={{
                background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#8094ae', lineHeight: 1
              }}>✕</button>
            </div>

            {/* Modal body — scrollable */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px' }}>

              {/* Log new usage form */}
              <div style={{
                background: '#f8f9fc', borderRadius: 8, padding: '14px 16px',
                marginBottom: 18, border: '1px solid #e9ecf5'
              }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#8094ae', textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: 12 }}>
                  Log Item Used on this Ticket
                </div>

                {/* Item selector */}
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: '0.78rem', color: '#526484', fontWeight: 600, display: 'block', marginBottom: 4 }}>Item</label>
                  {invItems.filter((i) => !isDropCable(i)).length === 0 ? (
                    <div style={{
                      padding: '10px 14px', background: '#fff3cd', borderRadius: 6,
                      fontSize: '0.82rem', color: '#856404', border: '1px solid #ffc107'
                    }}>
                      {isFieldRole
                        ? 'No other team inventory items available today. Confirm today\'s Team Roster and ask your manager to disburse items to team members.'
                        : 'No other inventory items on your account (use the Drop cable card above for cable). Contact your manager to disburse items.'}
                    </div>
                  ) : (
                    <select
                      className="form-control"
                      value={invUsageItem ? teamItemKey(invUsageItem) : ''}
                      onChange={e => {
                        const item = invItems.find(i => teamItemKey(i) === e.target.value);
                        setInvUsageItem(item || null);
                        setInvUsageQty(1);
                      }}
                    >
                      <option value="">— select from team inventory —</option>
                      {invItems.filter((i) => !isDropCable(i)).map(i => (
                        <option key={teamItemKey(i)} value={teamItemKey(i)}>
                          {formatTeamItemLabel(i)} — {isDropCable(i) ? formatDropCableBalance(i.quantity_available, i.roll_meters) : `${i.quantity_available} ${i.unit || 'pcs'}`} available
                        </option>
                      ))}
                    </select>
                  )}
                  {invUsageItem && (
                    <div style={{ marginTop: 5, fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>
                      ✓ {invUsageItem.name} · {isDropCable(invUsageItem) ? formatDropCableBalance(invUsageItem.quantity_available, invUsageItem.roll_meters) : `${invUsageItem.quantity_available} ${invUsageItem.unit || 'pcs'}`} available
                    </div>
                  )}
                </div>

                {/* Qty + Notes row */}
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: '0 0 100px' }}>
                    <label style={{ fontSize: '0.78rem', color: '#526484', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      {invUsageItem ? quantityLabelForItem(invUsageItem) : 'Quantity'}
                    </label>
                    <input
                      type="number" min={1}
                      max={invUsageItem?.quantity_available || 9999}
                      className="form-control"
                      value={invUsageQty}
                      onChange={e => setInvUsageQty(Math.max(1, parseInt(e.target.value) || 1))}
                      placeholder={invUsageItem && isDropCable(invUsageItem) ? 'e.g. 300' : '1'}
                    />
                    {invUsageItem && isDropCable(invUsageItem) && (
                      <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {[100, 300, 500].map((m) => (
                          <button
                            key={m}
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => setInvUsageQty(Math.min(m, invUsageItem.quantity_available || m))}
                          >
                            {m} m
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.78rem', color: '#526484', fontWeight: 600, display: 'block', marginBottom: 4 }}>Notes (optional)</label>
                    <input
                      type="text" className="form-control"
                      placeholder="e.g. used for splicing, 5m cut for client…"
                      value={invUsageNotes}
                      onChange={e => setInvUsageNotes(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && invUsageItem) handleLogInventoryUsage(); }}
                    />
                  </div>
                </div>

                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    disabled={!invUsageItem || invUsageLoading}
                    onClick={handleLogInventoryUsage}
                    style={{
                      background: invUsageItem ? '#f59e0b' : '#e5e9f2',
                      color: invUsageItem ? '#fff' : '#b0bac5',
                      border: 'none', borderRadius: 7, padding: '8px 22px',
                      fontWeight: 700, fontSize: '0.88rem', cursor: invUsageItem ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {invUsageLoading ? 'Saving…' : '+ Log Usage'}
                  </button>
                </div>
              </div>

              {/* Existing usage log */}
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#8094ae', textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: 10 }}>
                  Items Logged for this Ticket
                  {invUsageLog.length > 0 && (
                    <span style={{
                      marginLeft: 8, background: '#f59e0b', color: '#fff',
                      borderRadius: 20, padding: '1px 8px', fontSize: '0.7rem'
                    }}>{invUsageLog.length}</span>
                  )}
                </div>

                {invUsageLog.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: '#8094ae', fontSize: '0.85rem' }}>
                    <em className="icon ni ni-package" style={{ fontSize: '2rem', display: 'block', marginBottom: 8, opacity: 0.4 }} />
                    No items logged for this ticket yet
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                      <thead>
                        <tr style={{ background: '#f8f9fa', borderRadius: 6 }}>
                          {['Item', 'Used', 'Logged By', 'Notes', 'Date'].map(h => (
                            <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Qty' ? 'center' : 'left', color: '#526484', fontWeight: 600, fontSize: '0.75rem', borderBottom: '2px solid #e5e9f2' }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {invUsageLog.map((u, idx) => (
                          <tr key={u.id} style={{ borderBottom: '1px solid #f0f1f4', background: idx % 2 === 0 ? '#fff' : '#fafbff' }}>
                            <td style={{ padding: '8px 10px' }}>
                              {getCableRollNumberFromRow(u) ? (
                                <>
                                  <strong style={{ fontFamily: 'monospace', letterSpacing: '0.5px' }}>
                                    {getDropCableUsageLabel(u)}
                                  </strong>
                                  {u.item_name && (
                                    <span style={{ color: '#8094ae', fontSize: '0.72rem', marginLeft: 6 }}>
                                      · {u.item_name}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <strong>{u.item_name}</strong>
                              )}
                              {u.item_category && (
                                <span style={{ color: '#8094ae', fontSize: '0.72rem', marginLeft: 5 }}>· {u.item_category}</span>
                              )}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                              <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 4, padding: '2px 9px', fontWeight: 700 }}>
                                {isDropCable({ name: u.item_name, category: u.item_category })
                                  ? `${u.quantity} m`
                                  : `×${u.quantity}`}
                              </span>
                            </td>
                            <td style={{ padding: '8px 10px', color: '#526484' }}>{u.assigned_by_name || u.assigned_to_name || '-'}</td>
                            <td style={{ padding: '8px 10px', color: '#526484' }}>{u.notes || <em style={{ opacity: 0.35 }}>—</em>}</td>
                            <td style={{ padding: '8px 10px', color: '#8094ae', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
                              {u.created_at ? new Date(u.created_at).toLocaleDateString() : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: '#f8f9fc', borderTop: '2px solid #e5e9f2' }}>
                          <td style={{ padding: '7px 10px', fontWeight: 700, fontSize: '0.78rem', color: '#364a63' }}>Total</td>
                          <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 700, color: '#364a63' }}>
                            {(() => {
                              const total = invUsageLog.reduce((s, u) => s + (parseInt(u.quantity) || 0), 0);
                              const firstUnit = invUsageLog[0]?.unit;
                              const allCable = invUsageLog.length > 0 && invUsageLog.every((u) =>
                                isDropCable({ name: u.item_name, category: u.item_category })
                              );
                              return allCable ? `${total} m` : `${total} items`;
                            })()}
                          </td>
                          <td colSpan={3} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </React.Fragment>
  );
};

export default TicketView;