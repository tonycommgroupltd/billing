import { http } from '../helpers';
import { clearTicketCache } from './ticketCache';

/**
 * Tickets API - Database Integration
 * Handles all ticket CRUD operations via database API
 * NO localStorage fallback - all data from database
 */

const API_BASE = 'tickets.php';

const TicketsAPI = {
  /**
   * Get ticket statistics
   * @returns {Promise} API response with ticket stats
   */
  getStats: async () => {
    try {
      const response = await http.get(`${API_BASE}/stats`);
      return response.data;
    } catch (error) {
      console.error('Error fetching ticket stats:', error);
      throw error;
    }
  },

  /**
   * Get all tickets with optional filters
   * @param {Object} params - Query parameters (status, priority, search, assigned_to, etc.)
   * @returns {Promise} API response with list of tickets
   */
  getAll: async (params = {}) => {
    try {
      const queryString = new URLSearchParams(params).toString();
      const url = queryString ? `${API_BASE}/list?${queryString}` : `${API_BASE}/list`;
      const response = await http.get(url);
      return response.data;
    } catch (error) {
      console.error('Error fetching tickets:', error);
      throw error;
    }
  },

  /**
   * Slim list — excludes description, smaller payload, supports If-Modified-Since.
   * Use for the main list page. Falls back to getAll on 404 (old server).
   */
  getAllSlim: async (params = {}, lastModified = null) => {
    const queryString = new URLSearchParams(params).toString();
    try {
      const url = queryString ? `${API_BASE}/list-slim?${queryString}` : `${API_BASE}/list-slim`;
      const headers = {};
      if (lastModified) {
        headers['If-Modified-Since'] = lastModified;
      }
      const response = await http.get(url, { headers });
      return { data: response.data, lastModified: response.headers?.['last-modified'] || null, notModified: false };
    } catch (error) {
      // 304 Not Modified — data hasn't changed
      if (error.response && error.response.status === 304) {
        return { data: null, lastModified: null, notModified: true };
      }
      // 404 — server doesn't have the slim endpoint yet, fall back to full list
      if (error.response && error.response.status === 404) {
        const response = await http.get(
          queryString ? `${API_BASE}/list?${queryString}` : `${API_BASE}/list`
        );
        return { data: response.data, lastModified: null, notModified: false };
      }
      console.error('Error fetching tickets (slim):', error);
      throw error;
    }
  },

  /**
   * Get a single ticket by ID
   * @param {number} id - Ticket ID
   * @returns {Promise} API response with ticket data
   */
  getById: async (id) => {
    try {
      const response = await http.get(`${API_BASE}/view/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching ticket:', error);
      throw error;
    }
  },

  /**
   * Create a new ticket
   * @param {Object} ticketData - Ticket data to create
   * @returns {Promise} API response with created ticket
   */
  create: async (ticketData) => {
    try {
      const response = await http.post(`${API_BASE}/add`, ticketData);
      clearTicketCache();
      return response.data;
    } catch (error) {
      console.error('Error creating ticket:', error);
      throw error;
    }
  },

  /**
   * Update an existing ticket
   * @param {number} id - Ticket ID
   * @param {Object} ticketData - Updated ticket data
   * @returns {Promise} API response with updated ticket
   */
  update: async (id, ticketData) => {
    try {
      const response = await http.put(`${API_BASE}/update/${id}`, ticketData);
      clearTicketCache();
      return response.data;
    } catch (error) {
      console.error('Error updating ticket:', error);
      throw error;
    }
  },

  /**
   * Delete/archive a ticket
   * @param {number} id - Ticket ID
   * @returns {Promise} API response
   */
  delete: async (id) => {
    try {
      const response = await http.delete(`${API_BASE}/delete/${id}`);
      clearTicketCache();
      return response.data;
    } catch (error) {
      console.error('Error deleting ticket:', error);
      throw error;
    }
  },

  /**
   * Get tickets for a specific user (assigned to or created by)
   * @param {string} userEmail - User's email address
   * @param {Object} params - Query parameters (page, per_page)
   * @returns {Promise} API response with user's tickets
   */
  getMyTickets: async (userEmail, params = {}) => {
    try {
      const queryString = new URLSearchParams(params).toString();
      const url = queryString 
        ? `${API_BASE}/my-tickets/${encodeURIComponent(userEmail)}?${queryString}` 
        : `${API_BASE}/my-tickets/${encodeURIComponent(userEmail)}`;
      const response = await http.get(url);
      return response.data;
    } catch (error) {
      console.error('Error fetching my tickets:', error);
      throw error;
    }
  },

  // Status Management
  changeStatus: async (id, status, comment = '') => {
    try {
      const response = await http.put(`${API_BASE}/update/${id}`, {
        status,
        comment
      });
      return response.data;
    } catch (error) {
      console.error('Error changing ticket status:', error);
      throw error;
    }
  },

  // Assignment Management
  assign: async (id, assignedTo) => {
    try {
      const response = await http.put(`${API_BASE}/update/${id}`, {
        assignedTo
      });
      return response.data;
    } catch (error) {
      console.error('Error assigning ticket:', error);
      throw error;
    }
  },

  unassign: async (id) => {
    try {
      const response = await http.put(`${API_BASE}/update/${id}`, {
        assignedTo: null
      });
      return response.data;
    } catch (error) {
      console.error('Error unassigning ticket:', error);
      throw error;
    }
  },

  /**
   * Get users available for assignment (Technicians, Engineers)
   * @returns {Promise} List of users
   */
  getAssignmentOptions: async () => {
    try {
      const response = await http.get(`${API_BASE}/assignment-options`);
      return response.data.data || [];
    } catch (error) {
      console.error('Error fetching assignment options:', error);
      return [];
    }
  },

  /**
   * Get users available as watchers (Admins, Managers, etc.)
   * @returns {Promise} List of users
   */
  getWatcherOptions: async () => {
    try {
      const response = await http.get(`${API_BASE}/watcher-options`);
      return response.data.data || [];
    } catch (error) {
      console.error('Error fetching watcher options:', error);
      return [];
    }
  },

  /**
   * Add a reply to a ticket
   * @param {number} ticketId - Ticket ID
   * @param {Object} replyData - Reply data (message, to, cc, bcc, etc.)
   * @returns {Promise} API response
   */
  addReply: async (ticketId, replyData) => {
    try {
      const response = await http.post(`${API_BASE}/reply/${ticketId}`, replyData);
      return response.data;
    } catch (error) {
      console.error('Error adding reply:', error);
      throw error;
    }
  },

  /**
   * Add a note to a ticket
   * @param {number} ticketId - Ticket ID
   * @param {Object} noteData - Note data (message, isPrivate, etc.)
   * @returns {Promise} API response
   */
  addNote: async (ticketId, noteData) => {
    try {
      const response = await http.post(`${API_BASE}/note/${ticketId}`, noteData);
      return response.data;
    } catch (error) {
      console.error('Error adding note:', error);
      throw error;
    }
  },

  /**
   * Add router information to a ticket
   * @param {number} ticketId - Ticket ID
   * @param {Object} routerData - Router data (router_number, images)
   * @returns {Promise} API response
   */
  addRouter: async (ticketId, routerData) => {
    try {
      console.log('TicketsAPI.addRouter - Sending request:', {
        ticketId,
        router_number: routerData.router_number,
        image_count: routerData.images?.length,
        first_image_preview: routerData.images?.[0]?.base64?.substring(0, 50)
      });
      
      const response = await http.post(`${API_BASE}/router/${ticketId}`, routerData);
      
      console.log('TicketsAPI.addRouter - Full API response:', response);
      console.log('TicketsAPI.addRouter - Response data:', response.data);
      console.log('TicketsAPI.addRouter - Images in response:', response.data?.data?.images);
      
      return response.data;
    } catch (error) {
      console.error('Error adding router info:', error);
      console.error('Error details:', error.response?.data);
      throw error;
    }
  },

  /**
   * Get all messages (replies, notes, routers) for a ticket
   * @param {number} ticketId - Ticket ID
   * @returns {Promise} API response with all messages
   */
  getMessages: async (ticketId) => {
    try {
      const response = await http.get(`${API_BASE}/messages/${ticketId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching messages:', error);
      throw error;
    }
  },

  /**
   * Archive a ticket (soft delete)
   * @param {number} id - Ticket ID
   * @param {string} reason - Reason for archiving
   * @returns {Promise} API response
   */
  archive: async (id, reason = '') => {
    try {
      // Archive uses the same delete endpoint (soft delete)
      const response = await http.delete(`${API_BASE}/delete/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error archiving ticket:', error);
      throw error;
    }
  },

  /**
   * Get all archived tickets
   * @param {Object} params - Query parameters (page, per_page, search, etc.)
   * @returns {Promise} API response with list of archived tickets
   */
  getArchived: async (params = {}) => {
    try {
      const queryString = new URLSearchParams(params).toString();
      const url = queryString ? `${API_BASE}/archived?${queryString}` : `${API_BASE}/archived`;
      const response = await http.get(url);
      return response.data;
    } catch (error) {
      console.error('Error fetching archived tickets:', error);
      throw error;
    }
  },

  /**
   * Restore an archived ticket
   * @param {number} id - Ticket ID
   * @returns {Promise} API response
   */
  restore: async (id) => {
    try {
      const response = await http.put(`${API_BASE}/restore/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error restoring ticket:', error);
      throw error;
    }
  },

  /**
   * Get tickets with routers
   * @param {Object} params - Query parameters
   * @returns {Promise} API response
   */
  getRoutersList: async (params = {}) => {
    try {
      const queryString = new URLSearchParams(params).toString();
      const url = queryString ? `${API_BASE}/routers-list?${queryString}` : `${API_BASE}/routers-list`;
      const response = await http.get(url);
      return response.data;
    } catch (error) {
      console.error('Error fetching routers list:', error);
      throw error;
    }
  },

  /**
   * Get total count of tickets with routers (including archived)
   * @returns {Promise} API response with total counts
   */
  getRoutersListTotal: async () => {
    try {
      const response = await http.get(`${API_BASE}/routers-list-total`);
      return response.data;
    } catch (error) {
      console.error('Error fetching routers list total:', error);
      throw error;
    }
  },

  /**
   * Get installation statistics (including archived)
   * @returns {Promise} API response with installation stats
   */
  getInstallationStats: async () => {
    try {
      const response = await http.get(`${API_BASE}/installations-stats`);
      return response.data;
    } catch (error) {
      console.error('Error fetching installation stats:', error);
      throw error;
    }
  },

  /**
   * Permanently delete a ticket
   * @param {number} id - Ticket ID
   * @returns {Promise} API response
   */
  permanentDelete: async (id) => {
    try {
      const response = await http.delete(`${API_BASE}/permanent-delete/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error permanently deleting ticket:', error);
      throw error;
    }
  },

  // ---- Daily Snapshot Tracker ----

  /**
   * Get today's snapshot (auto-creates & syncs)
   */
  getSnapshotToday: async () => {
    try {
      const response = await http.get('ticket-snapshots/today');
      return response.data?.data || response.data;
    } catch (error) {
      console.error('Error fetching today snapshot:', error);
      throw error;
    }
  },

  /**
   * Get snapshot for a specific date
   */
  getSnapshotByDate: async (date) => {
    try {
      const response = await http.get(`ticket-snapshots/date/${date}`);
      return response.data?.data || response.data;
    } catch (error) {
      console.error('Error fetching snapshot:', error);
      throw error;
    }
  },

  /**
   * Get snapshots for a date range (daily summaries)
   */
  getSnapshotRange: async (from, to) => {
    try {
      const response = await http.get(`ticket-snapshots/range?from=${from}&to=${to}`);
      return response.data?.data || response.data;
    } catch (error) {
      console.error('Error fetching snapshot range:', error);
      throw error;
    }
  },

  /**
   * Force re-sync today's snapshot statuses
   */
  syncSnapshotToday: async () => {
    try {
      const response = await http.post('ticket-snapshots/sync');
      return response.data?.data || response.data;
    } catch (error) {
      console.error('Error syncing snapshot:', error);
      throw error;
    }
  }
};

export default TicketsAPI;