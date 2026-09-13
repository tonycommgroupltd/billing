import { http } from './http';

const NotificationsAPI = {
  getNotifications: async () => {
    const res = await http.get('/notifications');
    if (res?.data?.success) {
      return { data: res.data.data || [], unread: res.data.unread || 0 };
    }
    return { data: [], unread: 0 };
  },

  markRead: async (id) => {
    await http.patch(`/notifications/${id}/read`);
  },

  markAllRead: async () => {
    await http.post('/notifications/read-all');
  },
};

export default NotificationsAPI;
