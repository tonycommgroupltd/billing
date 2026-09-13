import { useCallback } from 'react';
import { useSelector } from 'react-redux';
import LogsAPI from '../helpers/LogsAPI';

/**
 * Custom hook for automatic activity logging
 * Usage: const logActivity = useActivityLogger();
 *        logActivity('create', 'Created new ticket', 'ticket', ticketId);
 */
export const useActivityLogger = () => {
  const user = useSelector(state => state.auth.currentUser);

  const logActivity = useCallback(async (activityType, description, targetType = null, targetId = null) => {
    try {
      await LogsAPI.logActivity({
        activity_type: activityType,
        activity_description: description,
        target_type: targetType,
        target_id: targetId
      }, user);
    } catch (error) {
      console.error('Failed to log activity:', error);
      // Don't throw errors for logging failures
    }
  }, [user]);

  return logActivity;
};

/**
 * Activity type constants
 */
export const ACTIVITY_TYPES = {
  // Auth activities
  LOGIN: 'login',
  LOGOUT: 'logout',
  
  // CRUD activities
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  VIEW: 'view',
  
  // Specific activities
  CUSTOMER_CREATED: 'customer_created',
  CUSTOMER_UPDATED: 'customer_updated',
  CUSTOMER_DELETED: 'customer_deleted',
  
  TICKET_CREATED: 'ticket_created',
  TICKET_UPDATED: 'ticket_updated',
  TICKET_DELETED: 'ticket_deleted',
  TICKET_ASSIGNED: 'ticket_assigned',
  TICKET_STATUS_CHANGED: 'ticket_status_changed',
  
  PAGE_VIEWED: 'page_viewed',
  
  // System activities
  SYSTEM: 'system'
};

/**
 * Target type constants
 */
export const TARGET_TYPES = {
  TICKET: 'ticket',
  CUSTOMER: 'customer',
  USER: 'user',
  PAGE: 'page',
  SYSTEM: 'system'
};