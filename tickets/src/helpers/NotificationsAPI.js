import { http } from '../helpers';

const NotificationsAPI = {
    // Fetch all notifications for a user (returns { data: [...], unread: N })
    getNotifications: async (userId) => {
        if (!userId) return { data: [], unread: 0 };
        const res = await http.get(`/notifications?user_id=${userId}`);
        if (res?.data?.success) return { data: res.data.data || [], unread: res.data.unread || 0 };
        return { data: [], unread: 0 };
    },

    // Mark a single notification as read
    markRead: async (id) => {
        await http.patch(`/notifications/${id}/read`);
    },

    // Mark all notifications as read for a user
    markAllRead: async (userId) => {
        await http.post('/notifications/read-all', { user_id: userId });
    },
};

export default NotificationsAPI;
