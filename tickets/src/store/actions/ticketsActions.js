import TicketsAPI from '../../helpers/TicketsAPI';
import { TICKETS_ACTION_TYPES } from '../action-types/ticketsTypes';

// Loading Actions
export const setTicketsLoading = (loading) => ({
  type: TICKETS_ACTION_TYPES.SET_LOADING,
  payload: loading
});

export const setTicketsRefreshing = (refreshing) => ({
  type: TICKETS_ACTION_TYPES.SET_REFRESHING,
  payload: refreshing
});

// Tickets Data Actions
export const setTickets = (tickets) => ({
  type: TICKETS_ACTION_TYPES.SET_TICKETS,
  payload: tickets
});

export const addTicket = (ticket) => ({
  type: TICKETS_ACTION_TYPES.ADD_TICKET,
  payload: ticket
});

export const updateTicket = (ticket) => ({
  type: TICKETS_ACTION_TYPES.UPDATE_TICKET,
  payload: ticket
});

export const deleteTicket = (ticketId) => ({
  type: TICKETS_ACTION_TYPES.DELETE_TICKET,
  payload: ticketId
});

// Dashboard Stats Actions
export const setStats = (stats) => ({
  type: TICKETS_ACTION_TYPES.SET_STATS,
  payload: stats
});

// Filter and Selection Actions
export const setFilters = (filters) => ({
  type: TICKETS_ACTION_TYPES.SET_FILTERS,
  payload: filters
});

export const setSelectedTickets = (selectedIds) => ({
  type: TICKETS_ACTION_TYPES.SET_SELECTED,
  payload: selectedIds
});

// Closed and Archived Actions
export const setClosedTickets = (tickets) => ({
  type: TICKETS_ACTION_TYPES.SET_CLOSED_TICKETS,
  payload: tickets
});

export const setArchivedTickets = (tickets) => ({
  type: TICKETS_ACTION_TYPES.SET_ARCHIVED_TICKETS,
  payload: tickets
});

// Metadata Actions
export const setAgents = (agents) => ({
  type: TICKETS_ACTION_TYPES.SET_AGENTS,
  payload: agents
});

export const setGroups = (groups) => ({
  type: TICKETS_ACTION_TYPES.SET_GROUPS,
  payload: groups
});

export const setPriorities = (priorities) => ({
  type: TICKETS_ACTION_TYPES.SET_PRIORITIES,
  payload: priorities
});

export const setTypes = (types) => ({
  type: TICKETS_ACTION_TYPES.SET_TYPES,
  payload: types
});

// Error Actions
export const setError = (error) => ({
  type: TICKETS_ACTION_TYPES.SET_ERROR,
  payload: error
});

export const clearError = () => ({
  type: TICKETS_ACTION_TYPES.CLEAR_ERROR
});

// Async Actions (Thunks)
export const fetchTickets = (params = {}) => async (dispatch) => {
  try {
    dispatch(setTicketsRefreshing(true));
    const response = await TicketsAPI.getAll(params);
    dispatch(setTickets(response.data));
    return response.data;
  } catch (error) {
    dispatch(setError(error.message || 'Failed to fetch tickets'));
    throw error;
  } finally {
    dispatch(setTicketsRefreshing(false));
  }
};

export const fetchTicketStats = () => async (dispatch) => {
  try {
    const response = await TicketsAPI.getStats();
    dispatch(setStats(response.data));
    return response.data;
  } catch (error) {
    dispatch(setError(error.message || 'Failed to fetch ticket statistics'));
    throw error;
  }
};

export const createTicket = (ticketData) => async (dispatch) => {
  try {
    dispatch(setTicketsLoading(true));
    const response = await TicketsAPI.create(ticketData);
    dispatch(addTicket(response.data));
    return response.data;
  } catch (error) {
    dispatch(setError(error.message || 'Failed to create ticket'));
    throw error;
  } finally {
    dispatch(setTicketsLoading(false));
  }
};

export const updateTicketData = (id, ticketData) => async (dispatch) => {
  try {
    const response = await TicketsAPI.update(id, ticketData);
    dispatch(updateTicket(response.data));
    return response.data;
  } catch (error) {
    dispatch(setError(error.message || 'Failed to update ticket'));
    throw error;
  }
};

export const deleteTicketData = (id) => async (dispatch) => {
  try {
    await TicketsAPI.delete(id);
    dispatch(deleteTicket(id));
    return true;
  } catch (error) {
    dispatch(setError(error.message || 'Failed to delete ticket'));
    throw error;
  }
};

export const changeTicketStatus = (id, status, comment = '') => async (dispatch) => {
  try {
    const response = await TicketsAPI.changeStatus(id, status, comment);
    dispatch(updateTicket(response.data));
    return response.data;
  } catch (error) {
    dispatch(setError(error.message || 'Failed to change ticket status'));
    throw error;
  }
};

export const closeTicket = (id, resolution) => async (dispatch) => {
  try {
    const response = await TicketsAPI.close(id, resolution);
    dispatch(updateTicket(response.data));
    return response.data;
  } catch (error) {
    dispatch(setError(error.message || 'Failed to close ticket'));
    throw error;
  }
};

export const assignTicket = (id, assigneeId) => async (dispatch) => {
  try {
    const response = await TicketsAPI.assign(id, assigneeId);
    dispatch(updateTicket(response.data));
    return response.data;
  } catch (error) {
    dispatch(setError(error.message || 'Failed to assign ticket'));
    throw error;
  }
};

export const performBulkAction = (ticketIds, action, data = {}) => async (dispatch) => {
  try {
    dispatch(setTicketsLoading(true));
    const response = await TicketsAPI.bulkAction(ticketIds, action, data);
    // Refresh tickets after bulk action
    dispatch(fetchTickets());
    return response.data;
  } catch (error) {
    dispatch(setError(error.message || 'Failed to perform bulk action'));
    throw error;
  } finally {
    dispatch(setTicketsLoading(false));
  }
};

export const fetchClosedTickets = (params = {}) => async (dispatch) => {
  try {
    dispatch(setTicketsRefreshing(true));
    const response = await TicketsAPI.getClosed(params);
    dispatch(setClosedTickets(response.data));
    return response.data;
  } catch (error) {
    dispatch(setError(error.message || 'Failed to fetch closed tickets'));
    throw error;
  } finally {
    dispatch(setTicketsRefreshing(false));
  }
};

export const fetchArchivedTickets = (params = {}) => async (dispatch) => {
  try {
    dispatch(setTicketsRefreshing(true));
    const response = await TicketsAPI.getArchived(params);
    dispatch(setArchivedTickets(response.data));
    return response.data;
  } catch (error) {
    dispatch(setError(error.message || 'Failed to fetch archived tickets'));
    throw error;
  } finally {
    dispatch(setTicketsRefreshing(false));
  }
};

export const fetchTicketMetadata = () => async (dispatch) => {
  try {
    const [agents, groups, priorities, types] = await Promise.all([
      TicketsAPI.getAgents(),
      TicketsAPI.getGroups(),
      TicketsAPI.getPriorities(),
      TicketsAPI.getTypes()
    ]);

    dispatch(setAgents(agents.data));
    dispatch(setGroups(groups.data));
    dispatch(setPriorities(priorities.data));
    dispatch(setTypes(types.data));

    return {
      agents: agents.data,
      groups: groups.data,
      priorities: priorities.data,
      types: types.data
    };
  } catch (error) {
    dispatch(setError(error.message || 'Failed to fetch ticket metadata'));
    throw error;
  }
};

export const exportTickets = (format = 'csv', filters = {}) => async (dispatch) => {
  try {
    dispatch(setTicketsLoading(true));
    const response = await TicketsAPI.export(format, filters);
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `tickets_export_${new Date().toISOString().split('T')[0]}.${format}`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);

    return true;
  } catch (error) {
    dispatch(setError(error.message || 'Failed to export tickets'));
    throw error;
  } finally {
    dispatch(setTicketsLoading(false));
  }
};