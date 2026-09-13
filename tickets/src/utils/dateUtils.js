/**
 * Date/Time Utility Functions
 * Handles timezone conversion and formatting for the ticketing system
 * 
 * IMPORTANT: Dates from API are already in Africa/Nairobi timezone (UTC+3)
 * and include timezone offset (e.g., "2024-01-15T14:30:00+03:00")
 * JavaScript's Date object will automatically parse the timezone offset correctly
 */

import moment from 'moment';

/**
 * Format a date string to local display format
 * Dates from API include timezone offset (e.g., +03:00), so JavaScript will parse correctly
 * @param {string|Date} dateValue - Date string with timezone or Date object
 * @param {string} format - Moment.js format string (optional)
 * @returns {string} Formatted date string
 */
export const formatTicketDate = (dateValue, format = 'YYYY-MM-DD HH:mm') => {
  if (!dateValue) return 'N/A';
  
  try {
    // Parse the date - if it has timezone offset (e.g., +03:00), moment will use it
    // If not, we assume it's already in the correct timezone from API
    const date = moment(dateValue);
    
    if (!date.isValid()) {
      return 'Invalid Date';
    }
    
    // Format the date - moment preserves the timezone from the input
    return date.format(format);
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid Date';
  }
};

/**
 * Format date for display in ticket list (short format)
 * @param {string|Date} dateValue - Date string with timezone or Date object
 * @returns {string} Formatted date string (e.g., "Jan 15, 2024 2:30 PM")
 */
export const formatTicketDateShort = (dateValue) => {
  if (!dateValue) return 'N/A';
  
  try {
    // Parse with timezone awareness
    const date = moment(dateValue);
    
    if (!date.isValid()) {
      return 'Invalid Date';
    }
    
    // Format preserving the timezone from input
    return date.format('MMM DD, YYYY h:mm A');
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid Date';
  }
};

/**
 * Format date for display in ticket list (very short format)
 * @param {string|Date} dateValue - Date string with timezone or Date object
 * @returns {string} Formatted date string (e.g., "1/15/2024 2:30 PM")
 */
export const formatTicketDateVeryShort = (dateValue) => {
  if (!dateValue) return 'N/A';
  
  try {
    // Parse with timezone awareness - moment will use the timezone offset if present
    const date = moment(dateValue);
    
    if (!date.isValid()) {
      return 'Invalid Date';
    }
    
    // Format preserving the timezone from input
    return date.format('M/D/YYYY h:mm A');
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid Date';
  }
};

/**
 * Format date with time only
 * @param {string|Date} dateValue - Date string or Date object
 * @returns {string} Formatted time string (e.g., "2:30 PM")
 */
export const formatTicketTime = (dateValue) => {
  if (!dateValue) return 'N/A';
  
  try {
    const date = moment(dateValue);
    
    if (!date.isValid()) {
      return 'Invalid Date';
    }
    
    return date.format('h:mm A');
  } catch (error) {
    console.error('Error formatting time:', error);
    return 'Invalid Date';
  }
};

/**
 * Get relative time (e.g., "2 hours ago", "3 days ago")
 * @param {string|Date} dateValue - Date string with timezone or Date object
 * @returns {string} Relative time string
 */
export const getTimeAgo = (dateValue) => {
  if (!dateValue) return 'N/A';
  
  try {
    // Parse with timezone awareness
    const date = moment(dateValue);
    
    if (!date.isValid()) {
      return 'Invalid Date';
    }
    
    return date.fromNow();
  } catch (error) {
    console.error('Error getting time ago:', error);
    return 'Invalid Date';
  }
};

/**
 * Format date for API (convert to ISO string)
 * @param {Date|string} dateValue - Date to format
 * @returns {string} ISO formatted date string
 */
export const formatDateForAPI = (dateValue) => {
  if (!dateValue) return null;
  
  try {
    const date = moment(dateValue);
    
    if (!date.isValid()) {
      return null;
    }
    
    return date.format('YYYY-MM-DDTHH:mm:ss');
  } catch (error) {
    console.error('Error formatting date for API:', error);
    return null;
  }
};

/**
 * Get current date/time as ISO string
 * @returns {string} Current date/time in ISO format
 */
export const getCurrentNairobiTime = () => {
  return moment().format('YYYY-MM-DDTHH:mm:ss');
};

/**
 * Check if a date is today
 * @param {string|Date} dateValue - Date to check
 * @returns {boolean} True if date is today
 */
export const isToday = (dateValue) => {
  if (!dateValue) return false;
  
  try {
    const date = moment(dateValue);
    const today = moment();
    
    return date.isSame(today, 'day');
  } catch (error) {
    return false;
  }
};

/**
 * Check if a date is in the current month
 * @param {string|Date} dateValue - Date to check
 * @returns {boolean} True if date is in current month
 */
export const isCurrentMonth = (dateValue) => {
  if (!dateValue) return false;
  
  try {
    const date = moment(dateValue);
    const now = moment();
    
    return date.isSame(now, 'month');
  } catch (error) {
    return false;
  }
};

