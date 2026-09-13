import { http } from './http';

const CustomersAPI = {
  /**
   * Search customers by partial phone or name (typeahead/autocomplete)
   * @param {string} query - Partial phone number or name
   * @param {number} limit - Max results
   * @returns {Promise} API response with customers list
   */
  searchCustomers: async (query, limit = 8) => {
    try {
      const response = await http.get('/list-customers', {
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
      console.log('CustomersAPI - Searching for phone:', phone);
      const response = await http.get('/search-customer-by-phone', {
        params: { phone }
      });
      console.log('CustomersAPI - Search response:', response.data);
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
      const response = await http.get('/list-customers', { params });
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
      const response = await http.get(`/view-customer/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching customer:', error);
      throw error;
    }
  },

  /**
   * Create a new customer
   * @param {Object} customerData - Customer data
   * @returns {Promise} API response
   */
  create: async (customerData) => {
    try {
      const response = await http.post('/add-customers', customerData);
      return response.data;
    } catch (error) {
      console.error('Error creating customer:', error);
      throw error;
    }
  },

  /**
   * Update customer
   * @param {number} id - Customer ID
   * @param {Object} customerData - Updated customer data
   * @returns {Promise} API response
   */
  update: async (id, customerData) => {
    try {
      const response = await http.put(`/update-customer/${id}`, customerData);
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
      const response = await http.post(`/update-customer-location/${id}`, locationData);
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
      const response = await http.get(`/get-customer-location/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching customer location:', error);
      throw error;
    }
  }
};

export default CustomersAPI;

