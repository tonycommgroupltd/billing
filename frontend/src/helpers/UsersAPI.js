import { ticketsHttp as http } from './ticketsHttp';

/**
 * Users API Helper
 * Handles all user management operations via REST API
 */

const API_BASE = 'users-management.php';

const UsersAPI = {
  /**
   * Create a new user
   * @param {Object} userData - User data (name, email, password, phone, role_id)
   * @returns {Promise} API response with created user
   */
  create: async (userData) => {
    try {
      const response = await http.post(`${API_BASE}/add`, userData);
      return response.data;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  },

  /**
   * Get all users with optional filters
   * @param {Object} params - Query parameters (page, per_page, search, role_id)
   * @returns {Promise} API response with users list and pagination
   */
  getAll: async (params = {}) => {
    try {
      const queryString = new URLSearchParams(params).toString();
      const url = queryString ? `${API_BASE}/list?${queryString}` : `${API_BASE}/list`;
      const response = await http.get(url);
      return response.data;
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  },

  /**
   * Get a single user by ID
   * @param {number} id - User ID
   * @returns {Promise} API response with user data including roles and permissions
   */
  getById: async (id) => {
    try {
      const response = await http.get(`${API_BASE}/view/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching user:', error);
      throw error;
    }
  },

  /**
   * Update user information
   * @param {number} id - User ID
   * @param {Object} userData - User data to update (name, email, phone)
   * @returns {Promise} API response with updated user
   */
  update: async (id, userData) => {
    try {
      const response = await http.put(`${API_BASE}/update/${id}`, userData);
      return response.data;
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  },

  /**
   * Soft delete a user
   * @param {number} id - User ID
   * @returns {Promise} API response
   */
  delete: async (id) => {
    try {
      const response = await http.delete(`${API_BASE}/delete/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  },

  /**
   * Assign role to user
   * @param {number} userId - User ID
   * @param {number} roleId - Role ID
   * @returns {Promise} API response
   */
  assignRole: async (userId, roleId) => {
    try {
      const response = await http.post(`${API_BASE}/assign-role/${userId}`, { role_id: roleId });
      return response.data;
    } catch (error) {
      console.error('Error assigning role:', error);
      throw error;
    }
  },

  /**
   * Change user password
   * @param {Object} data - Password change data (user_id, old_password, new_password)
   * @returns {Promise} API response
   */
  changePassword: async (data) => {
    try {
      const response = await http.post(`${API_BASE}/change-password`, data);
      return response.data;
    } catch (error) {
      console.error('Error changing password:', error);
      throw error;
    }
  },

  /**
   * Search users by name, email, or phone
   * @param {string} query - Search query (minimum 2 characters)
   * @returns {Promise} API response with matching users
   */
  search: async (query) => {
    try {
      const response = await http.get(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
      return response.data;
    } catch (error) {
      console.error('Error searching users:', error);
      throw error;
    }
  },

  /**
   * Get user statistics
   * @returns {Promise} API response with statistics
   */
  getStats: async () => {
    try {
      // This would need to be implemented in the API
      // For now, we can calculate from getAll
      const response = await http.get(`${API_BASE}/list?per_page=1`);
      const totalUsers = response.data.pagination.total;
      
      return {
        success: true,
        data: {
          totalUsers,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('Error fetching user statistics:', error);
      throw error;
    }
  },

  /**
   * Export users list as JSON
   * @returns {Promise} API response with export data
   */
  export: async () => {
    try {
      // Fetch and trigger download
      const response = await http.get(`${API_BASE}/export`);
      
      // Create blob and download
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `users_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      return { success: true, message: 'Users exported successfully' };
    } catch (error) {
      console.error('Error exporting users:', error);
      throw error;
    }
  }
};

export default UsersAPI;
