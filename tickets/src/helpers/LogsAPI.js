import { http } from '../helpers';

/**
 * Activity Logs API Helper
 * Handles all activity logging operations
 */

const API_BASE = 'logs.php';

const LogsAPI = {
  /**
   * Get all activity logs with filters
   * @param {Object} params - Query parameters (page, limit, activity_type, user_name, etc.)
   * @returns {Promise} API response with logs and pagination
   */
  getAll: async (params = {}) => {
    try {
      const queryString = new URLSearchParams(params).toString();
      const url = queryString ? `${API_BASE}/list?${queryString}` : `${API_BASE}/list`;
      const response = await http.get(url);
      return response.data;
    } catch (error) {
      console.error('Error fetching logs:', error);
      throw error;
    }
  },

  /**
   * Create a new log entry
   * @param {Object} logData - Log entry data
   * @returns {Promise} API response
   */
  log: async (logData) => {
    try {
      const response = await http.post(`${API_BASE}/log`, logData);
      return response.data;
    } catch (error) {
      console.error('Error creating log entry:', error);
      throw error;
    }
  },

  /**
   * Get activity statistics
   * @returns {Promise} API response with stats
   */
  getStats: async () => {
    try {
      const response = await http.get(`${API_BASE}/stats`);
      return response.data;
    } catch (error) {
      console.error('Error fetching activity stats:', error);
      throw error;
    }
  },

  /**
   * Get logs for a specific user
   * @param {number} userId - User ID
   * @returns {Promise} API response with user logs
   */
  getUserLogs: async (userId) => {
    try {
      const response = await http.get(`${API_BASE}/user/${userId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching user logs:', error);
      throw error;
    }
  },

  /**
   * Get available activity types
   * @returns {Promise} API response with activity types
   */
  getActivityTypes: async () => {
    try {
      const response = await http.get(`${API_BASE}/types`);
      return response.data;
    } catch (error) {
      console.error('Error fetching activity types:', error);
      throw error;
    }
  },

  /**
   * Helper function to log user activities automatically
   * @param {Object} activityData - Activity details
   * @param {Object} user - Current user object
   */
  logActivity: async (activityData, user = null) => {
    try {
      // Validate required fields
      if (!activityData?.activity_type || !activityData?.activity_description) {
        console.warn('LogsAPI.logActivity: Missing required fields', activityData);
        return null;
      }
      
      const logData = {
        activity_type: activityData.activity_type,
        activity_description: activityData.activity_description,
        target_type: activityData.target_type || null,
        target_id: activityData.target_id || null,
        user_id: user?.id || null,
        user_name: user?.display_name || user?.name || user?.username || 'Anonymous',
        user_email: user?.email || null,
        timestamp: new Date().toISOString()
      };
      
      console.log('LogsAPI.logActivity: Sending log data', logData);
      
      return await LogsAPI.log(logData);
    } catch (error) {
      // Don't throw errors for logging failures to avoid breaking main functionality
      console.error('Failed to log activity:', error);
    }
  }
};

export default LogsAPI;