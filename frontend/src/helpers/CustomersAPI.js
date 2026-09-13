import { http as laravelHttp } from './http';
import { ticketsHttp } from './ticketsHttp';

/**
 * Reads that only exist on the tickets PHP API use ticketsHttp.
 * Customer create/update must use Laravel (same path as Customers → Add).
 */
const CustomersAPI = {
  /**
   * Search customers by partial phone or name (typeahead/autocomplete)
   * @param {string} query - Partial phone number or name
   * @param {number} limit - Max results
   * @returns {Promise} API response with customers list
   */
  searchCustomers: async (query, limit = 8) => {
    try {
      const response = await ticketsHttp.get('/list-customers', {
        params: { q: query, per_page: limit }
      });
      return response.data;
    } catch (error) {
      console.error('Error searching customers:', error);
      throw error;
    }
  },

  /**
   * Search customer by phone number
   * @param {string} phone - Phone number to search
   * @returns {Promise} API response with customer data or not found
   */
  searchByPhone: async (phone) => {
    try {
      const response = await ticketsHttp.get('/search-customer-by-phone', {
        params: { phone }
      });
      return response.data;
    } catch (error) {
      console.error('Error searching customer by phone:', error);
      throw error;
    }
  },

  /**
   * Get all customers with pagination
   * @param {Object} params - Query parameters (page, per_page, search, status)
   * @returns {Promise} API response with customers list
   */
  getAll: async (params = {}) => {
    try {
      const response = await ticketsHttp.get('/list-customers', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching customers:', error);
      throw error;
    }
  },

  /**
   * Get customer by ID
   * @param {number} id - Customer ID
   * @returns {Promise} API response with customer details
   */
  getById: async (id) => {
    try {
      const response = await ticketsHttp.get(`/view-customer/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching customer:', error);
      throw error;
    }
  },

  /**
   * Create a new customer via Laravel (production ISP API).
   * @param {Object} customerData - Customer data
   * @returns {Promise} API response
   */
  create: async (customerData) => {
    try {
      const payload = { ...customerData };
      if (!String(payload.email || '').trim()) {
        delete payload.email;
      }
      const response = await laravelHttp.post('/add-customers', payload);
      return response.data;
    } catch (error) {
      console.error('Error creating customer:', error);
      throw error;
    }
  },

  /**
   * Update customer via Laravel
   * @param {number} id - Customer ID
   * @param {Object} customerData - Updated customer data
   * @returns {Promise} API response
   */
  update: async (id, customerData) => {
    try {
      const response = await laravelHttp.put(`/update-customer/${id}`, customerData);
      return response.data;
    } catch (error) {
      console.error('Error updating customer:', error);
      throw error;
    }
  },

  /**
   * Update customer location coordinates
   * @param {number} id - Customer ID
   * @param {Object} locationData - { latitude, longitude }
   * @returns {Promise} API response
   */
  updateCustomerLocation: async (id, locationData) => {
    try {
      const response = await ticketsHttp.post(`/update-customer-location/${id}`, locationData);
      return response.data;
    } catch (error) {
      console.error('Error updating customer location:', error);
      throw error;
    }
  },

  /**
   * Get customer location coordinates
   * @param {number} id - Customer ID
   * @returns {Promise} API response with location data
   */
  getCustomerLocation: async (id) => {
    try {
      const response = await ticketsHttp.get(`/get-customer-location/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching customer location:', error);
      throw error;
    }
  }
};

export default CustomersAPI;

