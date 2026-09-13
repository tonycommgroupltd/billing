import { Capacitor } from '@capacitor/core';

class OneSignalService {
  async initialize() {
    // Only initialize on mobile devices
    if (!Capacitor.isNativePlatform()) {
      console.log('OneSignal only works on mobile devices');
      return;
    }

    try {
      // Dynamically import OneSignal plugin
      const OneSignal = window.OneSignal;
      
      if (!OneSignal) {
        console.error('OneSignal plugin not found');
        return;
      }

      // Initialize with your OneSignal App ID
      const APP_ID = "YOUR_ONESIGNAL_APP_ID";
      
      OneSignal.setAppId(APP_ID);
      console.log('OneSignal initialized with App ID: ' + APP_ID);

      // Prompt for push notifications permission
      OneSignal.promptForPushNotificationsWithUserResponse((accepted) => {
        console.log("User " + (accepted ? "accepted" : "denied") + " push notifications");
      });

      // Get device state and player ID
      OneSignal.getDeviceState((device) => {
        const playerId = device.userId;
        console.log('OneSignal Player ID:', playerId);
        this.savePlayerIdToBackend(playerId);
      });

      // Handle notification received while app is in foreground
      OneSignal.setNotificationWillShowInForegroundHandler((notificationReceivedEvent) => {
        const notification = notificationReceivedEvent.getNotification();
        console.log("Notification received in foreground: ", notification);
        
        // Display the notification even when app is open
        notificationReceivedEvent.complete(notification);
      });

      // Handle notification opened/clicked
      OneSignal.setNotificationOpenedHandler((notification) => {
        console.log("Notification opened: ", notification);
        
        // Get notification data and navigate
        const additionalData = notification.notification.additionalData;
        if (additionalData && additionalData.page) {
          window.location.href = additionalData.page;
        }
      });

      // Tag user with their role for segmentation
      const userRole = localStorage.getItem('user_role');
      const userId = localStorage.getItem('user_id');
      
      if (userRole) {
        OneSignal.sendTag("role", userRole);
      }
      
      if (userId) {
        OneSignal.setExternalUserId(userId);
      }

      console.log('OneSignal service initialized successfully');
    } catch (error) {
      console.error('Error initializing OneSignal:', error);
    }
  }

  async savePlayerIdToBackend(playerId) {
    try {
      const userId = localStorage.getItem('user_id');
      const userRole = localStorage.getItem('user_role');
      
      const response = await fetch(`${process.env.REACT_APP_API_URL}/save-onesignal-player.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify({
          player_id: playerId,
          user_id: userId,
          role: userRole
        })
      });

      if (response.ok) {
        console.log('OneSignal player ID saved to backend');
      } else {
        console.error('Failed to save player ID to backend');
      }
    } catch (error) {
      console.error('Error saving player ID:', error);
    }
  }

  // Send notification to specific player
  static sendNotification(playerIds, title, message, data = {}) {
    // This would be called from your backend
    // Frontend can't send directly - use backend endpoint instead
    console.log('Use backend to send notifications');
  }

  // Set external user ID (call when user logs in)
  setUserId(userId) {
    try {
      const OneSignal = window.OneSignal;
      if (OneSignal) {
        OneSignal.setExternalUserId(userId);
        localStorage.setItem('user_id', userId);
      }
    } catch (error) {
      console.error('Error setting OneSignal user ID:', error);
    }
  }

  // Add tag for segmentation
  addTag(key, value) {
    try {
      const OneSignal = window.OneSignal;
      if (OneSignal) {
        OneSignal.sendTag(key, value);
      }
    } catch (error) {
      console.error('Error adding OneSignal tag:', error);
    }
  }

  // Remove user on logout
  logout() {
    try {
      const OneSignal = window.OneSignal;
      if (OneSignal) {
        OneSignal.removeExternalUserId();
      }
    } catch (error) {
      console.error('Error logging out from OneSignal:', error);
    }
  }
}

export default new OneSignalService();
