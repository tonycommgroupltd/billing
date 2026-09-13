import { TICKETS_ACTION_TYPES } from '../action-types/ticketsTypes';

const initialState = {
  // Data
  tickets: [],
  closedTickets: [],
  archivedTickets: [],
  currentTicket: null,
  
  // Dashboard stats
  stats: {
    newTickets: 0,
    workInProgress: 0,
    resolved: 0,
    waitingOnAgent: 0,
    totalTickets: 0,
    averageResponseTime: 0,
    averageResolutionTime: 0
  },
  
  // UI State
  loading: false,
  refreshing: false,
  selectedTickets: [],
  
  // Filters and pagination
  filters: {
    status: 'all',
    priority: 'all',
    assignee: 'all',
    group: 'all',
    type: 'all',
    dateRange: 'all',
    search: ''
  },
  pagination: {
    page: 1,
    perPage: 25,
    total: 0,
    totalPages: 0
  },
  
  // Metadata
  agents: [],
  groups: [],
  priorities: [],
  types: [],
  
  // Error handling
  error: null,
  
  // Last update timestamp
  lastUpdated: null
};

const ticketsReducer = (state = initialState, action) => {
  switch (action.type) {
    case TICKETS_ACTION_TYPES.SET_LOADING:
      return {
        ...state,
        loading: action.payload
      };

    case TICKETS_ACTION_TYPES.SET_REFRESHING:
      return {
        ...state,
        refreshing: action.payload
      };

    case TICKETS_ACTION_TYPES.SET_TICKETS:
      return {
        ...state,
        tickets: action.payload.data || action.payload,
        pagination: {
          ...state.pagination,
          ...(action.payload.pagination || {})
        },
        lastUpdated: new Date().toISOString()
      };

    case TICKETS_ACTION_TYPES.ADD_TICKET:
      return {
        ...state,
        tickets: [action.payload, ...state.tickets],
        stats: {
          ...state.stats,
          newTickets: state.stats.newTickets + 1,
          totalTickets: state.stats.totalTickets + 1
        }
      };

    case TICKETS_ACTION_TYPES.UPDATE_TICKET:
      return {
        ...state,
        tickets: state.tickets.map(ticket =>
          ticket.id === action.payload.id ? action.payload : ticket
        ),
        currentTicket: state.currentTicket?.id === action.payload.id ? action.payload : state.currentTicket
      };

    case TICKETS_ACTION_TYPES.DELETE_TICKET:
      return {
        ...state,
        tickets: state.tickets.filter(ticket => ticket.id !== action.payload),
        selectedTickets: state.selectedTickets.filter(id => id !== action.payload),
        stats: {
          ...state.stats,
          totalTickets: Math.max(0, state.stats.totalTickets - 1)
        }
      };

    case TICKETS_ACTION_TYPES.SET_STATS:
      return {
        ...state,
        stats: {
          ...state.stats,
          ...action.payload
        }
      };

    case TICKETS_ACTION_TYPES.SET_FILTERS:
      return {
        ...state,
        filters: {
          ...state.filters,
          ...action.payload
        }
      };

    case TICKETS_ACTION_TYPES.SET_PAGINATION:
      return {
        ...state,
        pagination: {
          ...state.pagination,
          ...action.payload
        }
      };

    case TICKETS_ACTION_TYPES.SET_SELECTED:
      return {
        ...state,
        selectedTickets: action.payload
      };

    case TICKETS_ACTION_TYPES.SET_CLOSED_TICKETS:
      return {
        ...state,
        closedTickets: action.payload.data || action.payload,
        lastUpdated: new Date().toISOString()
      };

    case TICKETS_ACTION_TYPES.SET_ARCHIVED_TICKETS:
      return {
        ...state,
        archivedTickets: action.payload.data || action.payload,
        lastUpdated: new Date().toISOString()
      };

    case TICKETS_ACTION_TYPES.SET_AGENTS:
      return {
        ...state,
        agents: action.payload
      };

    case TICKETS_ACTION_TYPES.SET_GROUPS:
      return {
        ...state,
        groups: action.payload
      };

    case TICKETS_ACTION_TYPES.SET_PRIORITIES:
      return {
        ...state,
        priorities: action.payload
      };

    case TICKETS_ACTION_TYPES.SET_TYPES:
      return {
        ...state,
        types: action.payload
      };

    case TICKETS_ACTION_TYPES.SET_ERROR:
      return {
        ...state,
        error: action.payload,
        loading: false,
        refreshing: false
      };

    case TICKETS_ACTION_TYPES.CLEAR_ERROR:
      return {
        ...state,
        error: null
      };

    case TICKETS_ACTION_TYPES.TICKET_UPDATED:
      // Handle real-time ticket updates
      return {
        ...state,
        tickets: state.tickets.map(ticket =>
          ticket.id === action.payload.id ? { ...ticket, ...action.payload } : ticket
        )
      };

    case TICKETS_ACTION_TYPES.TICKET_STATUS_CHANGED:
      // Handle real-time status changes
      return {
        ...state,
        tickets: state.tickets.map(ticket =>
          ticket.id === action.payload.id 
            ? { ...ticket, status: action.payload.status, updated_at: action.payload.updated_at }
            : ticket
        ),
        stats: calculateStatsUpdate(state.stats, action.payload)
      };

    default:
      return state;
  }
};

// Helper function to calculate stats updates
const calculateStatsUpdate = (currentStats, statusUpdate) => {
  const { oldStatus, newStatus } = statusUpdate;
  let newStats = { ...currentStats };
  
  // Decrease old status count
  switch (oldStatus) {
    case 'new':
      newStats.newTickets = Math.max(0, newStats.newTickets - 1);
      break;
    case 'in_progress':
    case 'work_in_progress':
      newStats.workInProgress = Math.max(0, newStats.workInProgress - 1);
      break;
    case 'waiting_agent':
      newStats.waitingOnAgent = Math.max(0, newStats.waitingOnAgent - 1);
      break;
    case 'resolved':
    case 'closed':
      newStats.resolved = Math.max(0, newStats.resolved - 1);
      break;
  }
  
  // Increase new status count
  switch (newStatus) {
    case 'new':
      newStats.newTickets += 1;
      break;
    case 'in_progress':
    case 'work_in_progress':
      newStats.workInProgress += 1;
      break;
    case 'waiting_agent':
      newStats.waitingOnAgent += 1;
      break;
    case 'resolved':
    case 'closed':
      newStats.resolved += 1;
      break;
  }
  
  return newStats;
};

export default ticketsReducer;