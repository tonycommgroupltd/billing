import { triggerDataRefresh } from './dataRefresh';

export const STAFF_NOTIFICATION_REFRESH = 'staff-notification-refresh';
export const STAFF_NOTIFICATION_SOUND = 'staff-notification-sound';

export function triggerStaffNotificationRefresh() {
  window.dispatchEvent(new CustomEvent(STAFF_NOTIFICATION_REFRESH));
}

/** Ask the header bell to play the notification sound now. */
export function triggerStaffNotificationSound() {
  window.dispatchEvent(new CustomEvent(STAFF_NOTIFICATION_SOUND));
}

/**
 * After a ticket status change: refresh the bell and play the wav.
 * Backend also creates rows for other staff; this covers the current user immediately.
 * Also nudges open ticket views so lists update without a manual Refresh.
 */
export function announceTicketStatusChange() {
  triggerStaffNotificationSound();
  triggerStaffNotificationRefresh();
  triggerDataRefresh(['tickets']);
}
