import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

class PushNotificationService {
  async initialize() {
    // Only works on native mobile platforms
    if (!Capacitor.isNativePlatform()) {
      console.log('Push notifications only available on mobile devices');
      return;
    }

    try {
      // Request permission to use push notifications
      let permStatus = await PushNotifications.checkPermissions();
      
      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive !== 'granted') {
        console.warn('User denied push notification permissions');
        return;
      }

      // Register with Apple / Google to receive push notifications
      await PushNotifications.register();

      // On success, we get the device token
      PushNotifications.addListener('registration', (token) => {
        console.log('Push registration success, token: ' + token.value);
        this.saveTokenToBackend(token.value);
      });

      // Handle registration errors
      PushNotifications.addListener('registrationError', (error) => {
        console.error('Push registration error: ' + JSON.stringify(error));
      });

      // Show notifications received while app is in foreground
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('Push notification received: ' + JSON.stringify(notification));
        
        // You can show custom in-app notification here
        // For now, we'll just log it
        if (notification.title && notification.body) {
          // Could show a toast or custom notification UI
          alert(`${notification.title}\n${notification.body}`);
        }
      });

      // Handle notification tap - user clicked on notification
      PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
        console.log('Push notification action performed: ' + JSON.stringify(notification));
        
        const data = notification.notification.data;
        
        // Navigate to relevant page based on notification type
        if (data.type === 'inventory_request') {
          window.location.href = '/admin/inventory/request';
        } else if (data.type === 'ticket') {
          window.location.href = `/admin/tickets/details/${data.ticket_id}`;
        } else if (data.type === 'disbursement') {
          window.location.href = '/admin/inventory/disbursed';
        }
      });

      console.log('Push notification service initialized successfully');
    } catch (error) {
      console.error('Error initializing push notifications:', error);
    }
  }

  async saveTokenToBackend(token) {
    try {
      const userId = localStorage.getItem('user_id');
      const platform = Capacitor.getPlatform(); // 'ios' or 'android'
      
      // Send token to your PHP backend
      const response = await fetch(`${process.env.REACT_APP_API_URL}/save-push-token.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify({
          user_id: userId,
          push_token: token,
          platform: platform,
          device_info: {
            model: Capacitor.getPlatform(),
            version: navigator.userAgent
          }
        })
      });

      if (response.ok) {
        console.log('Push token saved to backend successfully');
      } else {
        console.error('Failed to save push token to backend');
      }
    } catch (error) {
      console.error('Error saving push token:', error);
    }
  }

  async getDeliveredNotifications() {
    if (!Capacitor.isNativePlatform()) {
      return [];
    }

    try {
      const notificationList = await PushNotifications.getDeliveredNotifications();
      console.log('Delivered notifications:', notificationList);
      return notificationList.notifications;
    } catch (error) {
      console.error('Error getting delivered notifications:', error);
      return [];
    }
  }

  async removeAllDeliveredNotifications() {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    try {
      await PushNotifications.removeAllDeliveredNotifications();
      console.log('All delivered notifications removed');
    } catch (error) {
      console.error('Error removing notifications:', error);
    }
  }
}

export default new PushNotificationService();
