import { http } from '../helpers';

/**
 * Roles API Helper
 * Handles all role management operations via REST API
 */

const API_BASE = 'roles-management.php';

const RolesAPI = {
  /**
   * Get all roles with pagination
   * @param {Object} params - Query parameters (page, per_page, search)
   * @returns {Promise} API response with roles list
   */
  getAll: async (params = {}) => {
    try {
      const queryString = new URLSearchParams(params).toString();
      const url = queryString ? `${API_BASE}/list?${queryString}` : `${API_BASE}/list`;
      const response = await http.get(url);
      return response.data;
    } catch (error) {
      console.error('Error fetching roles:', error);
      throw error;
    }
  },

  /**
   * Create a new role
   * @param {Object} roleData - Role data (name, display_name, description)
   * @returns {Promise} API response with created role
   */
  create: async (roleData) => {
    try {
      const response = await http.post(`${API_BASE}/add`, roleData);
      return response.data;
    } catch (error) {
      console.error('Error creating role:', error);
      throw error;
    }
  },

  /**
   * Get a single role with all its permissions
   * @param {number} id - Role ID
   * @returns {Promise} API response with role data and permissions
   */
  getById: async (id) => {
    try {
      const response = await http.get(`${API_BASE}/view/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching role:', error);
      throw error;
    }
  },

  /**
   * Update role information
   * @param {number} id - Role ID
   * @param {Object} roleData - Role data to update (display_name, description)
   * @returns {Promise} API response with updated role
   */
  update: async (id, roleData) => {
    try {
      const response = await http.put(`${API_BASE}/update/${id}`, roleData);
      return response.data;
    } catch (error) {
      console.error('Error updating role:', error);
      throw error;
    }
  },

  /**
   * Delete a role (only if no users have it)
   * @param {number} id - Role ID
   * @returns {Promise} API response
   */
  delete: async (id) => {
    try {
      const response = await http.delete(`${API_BASE}/delete/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting role:', error);
      throw error;
    }
  },

  /**
   * Get all available permissions
   * @returns {Promise} API response with list of all permissions
   */
  getPermissions: async () => {
    try {
      const response = await http.get(`${API_BASE}/permissions`);
      return response.data;
    } catch (error) {
      console.error('Error fetching permissions:', error);
      throw error;
    }
  },

  /**
   * Assign a permission to a role
   * @param {number} roleId - Role ID
   * @param {number} permissionId - Permission ID
   * @returns {Promise} API response
   */
  assignPermission: async (roleId, permissionId) => {
    try {
      const response = await http.post(`${API_BASE}/assign-permission/${roleId}`, {
        permission_id: permissionId
      });
      return response.data;
    } catch (error) {
      console.error('Error assigning permission:', error);
      throw error;
    }
  },

  /**
   * Remove a permission from a role
   * @param {number} roleId - Role ID
   * @param {number} permissionId - Permission ID
   * @returns {Promise} API response
   */
  revokePermission: async (roleId, permissionId) => {
    try {
      const response = await http.post(`${API_BASE}/revoke-permission/${roleId}`, {
        permission_id: permissionId
      });
      return response.data;
    } catch (error) {
      console.error('Error revoking permission:', error);
      throw error;
    }
  },

  /**
   * Export roles and permissions as JSON
   * @returns {Promise} Downloads JSON file with all roles and permissions
   */
  export: async () => {
    try {
      // The API returns file download in handleExportRoles
      window.location.href = `${API_BASE}/export`;
      
      return { success: true, message: 'Roles exported successfully' };
    } catch (error) {
      console.error('Error exporting roles:', error);
      throw error;
    }
  }
};

export default RolesAPI;
