/**
 * BonusAPI.js - API wrapper for bonus system V2
 * Uses ticket_bonus_records table as single source of truth
 */

import axios from 'axios';

// Prefer env var, otherwise use same-origin `/api` (works in production subdomain deployments)
const API_BASE_URL = process.env.REACT_APP_API_URL || `${window.location.origin}/api`;

const getAuthHeaders = () => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token') || 
                localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
  
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

const BonusAPI = {
  /**
   * Sync bonuses from tickets (recalculates everything)
   */
  syncBonuses: async (startDate = null, endDate = null, clear = false) => {
    try {
      const params = new URLSearchParams({ action: 'sync' });
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (clear) params.append('clear', 'true');
      
      const response = await axios.get(
        `${API_BASE_URL}/bonus-v2.php?${params.toString()}`,
        { headers: getAuthHeaders(), withCredentials: true }
      );
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  /**
   * Get ticket-level bonus list with filters and pagination
   */
  getTicketBonusList: async (filters = {}) => {
    try {
      const params = new URLSearchParams({ action: 'list' });
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);
      if (filters.technician) params.append('technician', filters.technician);
      if (filters.payment_status) params.append('payment_status', filters.payment_status);
      if (filters.type_filter) params.append('type_filter', filters.type_filter);
      if (filters.limit) params.append('limit', filters.limit);
      if (filters.offset) params.append('offset', filters.offset);
      
      const response = await axios.get(
        `${API_BASE_URL}/bonus-v2.php?${params.toString()}`,
        { headers: getAuthHeaders(), withCredentials: true }
      );
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  /**
   * Get single technician's bonus information
   */
  getTechnicianBonus: async (email) => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/bonus-v2.php?action=technician&email=${encodeURIComponent(email)}`,
        { headers: getAuthHeaders(), withCredentials: true }
      );
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  /**
   * Add a technician to a ticket's bonus
   */
  addTechnicianToBonus: async (ticketId, technicianEmail) => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/bonus-v2.php?action=add-tech`,
        { ticket_id: ticketId, technician_email: technicianEmail },
        { headers: getAuthHeaders(), withCredentials: true }
      );
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  /**
   * Mark bonuses as paid
   */
  payBonus: async (technicianId, recordIds = [], reference = '') => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/bonus-v2.php?action=pay`,
        { technician_id: technicianId, record_ids: recordIds, reference: reference },
        { headers: getAuthHeaders(), withCredentials: true }
      );
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  /**
   * Get overall statistics
   */
  getStats: async (startDate = null, endDate = null) => {
    try {
      const params = new URLSearchParams({ action: 'stats' });
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      
      const response = await axios.get(
        `${API_BASE_URL}/bonus-v2.php?${params.toString()}`,
        { headers: getAuthHeaders(), withCredentials: true }
      );
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  /**
   * Get list of all technicians and engineers for dropdown selection
   * (Still uses old endpoint)
   */
  getTechnicians: async () => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/bonus-system.php?action=get-technicians`,
        { headers: getAuthHeaders(), withCredentials: true }
      );
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },

  // ============ Legacy methods for backward compatibility ============
  
  getDailyBonuses: async () => {
    return BonusAPI.getStats();
  },
  
  getBonusSummary: async () => {
    return BonusAPI.getStats();
  },
  
  completeInstallation: async (ticketId) => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/bonus-system.php?action=complete-installation`,
        { ticket_id: ticketId },
        { headers: getAuthHeaders(), withCredentials: true }
      );
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },
  
  completeOtherTicket: async (ticketId) => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/bonus-system.php?action=complete-other-ticket`,
        { ticket_id: ticketId },
        { headers: getAuthHeaders(), withCredentials: true }
      );
      return response.data;
    } catch (error) {
      throw error.response?.data || error.message;
    }
  },
  
  getPaymentHistory: async () => {
    return { success: true, data: [] };
  },
  
  resetDailyCounters: async () => {
    return { success: true, message: 'Not needed with V2 system' };
  }
};

export default BonusAPI;
