import { ticketsHttp as http } from './ticketsHttp';

/**
 * Customer Creator API - Database Integration
 * Handles CRUD operations for potential customers (prospects)
 * All data stored in database via API endpoints
 * NO localStorage fallback - all data from database
 */

const API_BASE = 'customer-creators.php';

const CustomerCreaterAPI = {
  /**
   * Create a new customer creator (prospect)
   * @param {Object} payload - Customer creator data
   * @returns {Promise} API response with created customer creator
   */
  create: async (payload) => {
    try {
      const response = await http.post(`${API_BASE}/add`, payload);
      return response.data;
    } catch (error) {
      console.error('Error creating customer creator:', error);
      throw error;
    }
  },

  /**
   * Get all customer creators
   * @param {Object} params - Query parameters (page, per_page, status, search)
   * @returns {Promise} API response with list of customer creators
   */
  list: async (params = {}) => {
    try {
      const queryString = new URLSearchParams(params).toString();
      const url = queryString ? `${API_BASE}/list?${queryString}` : `${API_BASE}/list`;
      const response = await http.get(url);
      return response.data;
    } catch (error) {
      console.error('Error fetching customer creators:', error);
      throw error;
    }
  },

  /**
   * Get customer creators created by a specific user
   * @param {string} email - Email of the user who created them
   * @param {Object} params - Query parameters (page, per_page)
   * @returns {Promise} API response with filtered customer creators
   */
  listByUser: async (email, params = {}) => {
    try {
      const queryString = new URLSearchParams(params).toString();
      const url = queryString 
        ? `${API_BASE}/by-user/${encodeURIComponent(email)}?${queryString}` 
        : `${API_BASE}/by-user/${encodeURIComponent(email)}`;
      const response = await http.get(url);
      return response.data;
    } catch (error) {
      console.error('Error fetching customer creators by user:', error);
      throw error;
    }
  },

  /**
   * Get a single customer creator by ID
   * @param {number} id - Customer creator ID
   * @returns {Promise} API response with customer creator data
   */
  getById: async (id) => {
    try {
      const response = await http.get(`${API_BASE}/view/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching customer creator:', error);
      throw error;
    }
  },

  /**
   * Update an existing customer creator
   * @param {number} id - Customer creator ID
   * @param {Object} payload - Updated customer creator data
   * @returns {Promise} API response with updated customer creator
   */
  update: async (id, payload) => {
    try {
      const response = await http.put(`${API_BASE}/update/${id}`, payload);
      return response.data;
    } catch (error) {
      console.error('Error updating customer creator:', error);
      throw error;
    }
  },

  /**
   * Delete a customer creator
   * @param {number} id - Customer creator ID
   * @returns {Promise} API response
   */
  delete: async (id) => {
    try {
      const response = await http.delete(`${API_BASE}/delete/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting customer creator:', error);
      throw error;
    }
  },

  /**
   * Get customer creator statistics
   * @param {Object} params - Query parameters (created_by for filtering)
   * @returns {Promise} API response with statistics
   */
  getStats: async (params = {}) => {
    try {
      const queryString = new URLSearchParams(params).toString();
      const url = queryString ? `${API_BASE}/stats?${queryString}` : `${API_BASE}/stats`;
      const response = await http.get(url);
      return response.data;
    } catch (error) {
      console.error('Error fetching customer creator stats:', error);
      throw error;
    }
  }
};

export default CustomerCreaterAPI;
