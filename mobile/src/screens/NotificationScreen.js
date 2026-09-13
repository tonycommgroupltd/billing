// ============================================
// HOMELINK Customer App — Notifications Screen
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import api from '../api/client';

const TYPE_CONFIG = {
  ticket: { icon: 'ticket-outline', color: '#F58220', bg: '#FFF4EB', label: 'Ticket' },
  invoice: { icon: 'receipt-outline', color: '#D97706', bg: '#FEF3C7', label: 'Invoice' },
  network: { icon: 'wifi-outline', color: '#059669', bg: '#ECFDF5', label: 'Network' },
  announcement: { icon: 'megaphone-outline', color: '#7C3AED', bg: '#EDE9FE', label: 'Announcement' },
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function NotificationScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pushStatus, setPushStatus] = useState(null); // null, 'registering', 'registered', 'error'

  // Manual push token registration with visible feedback
  const handleEnablePush = async () => {
    setPushStatus('registering');
    try {
      // Step 1: Request permissions
      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        Alert.alert('Permission Denied', 'Please enable notifications in your device settings.');
        setPushStatus('error');
        return;
      }

      // Step 2: Get push token
      const projectId = Constants.expoConfig?.extra?.eas?.projectId 
        || 'd676ab3d-d9fc-4cb7-8c8a-a79907cb0a53';
      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      const pushToken = tokenData.data;

      // Step 3: Send to API
      const result = await api.registerPushToken(pushToken, Platform.OS);
      if (result.success) {
        setPushStatus('registered');
        Alert.alert('Success', 'Push notifications enabled! You will now receive alerts.');
      } else {
        setPushStatus('error');
        Alert.alert('Error', 'Failed to register push token with server.');
      }
    } catch (err) {
      setPushStatus('error');
      Alert.alert('Push Setup Error', err.message || 'Unknown error');
    }
  };

  const fetchNotifications = useCallback(async () => {
    try {
      const result = await api.getNotifications();
      setNotifications(result.notifications || []);
      // Clear app icon badge when user views notifications
      Notifications.setBadgeCountAsync(0).catch(() => {});
    } catch (err) {
      console.warn('Notification load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  // Re-fetch on focus
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      if (!loading) fetchNotifications();
    });
    return unsub;
  }, [navigation, loading]);

  const onRefresh = () => { setRefreshing(true); fetchNotifications(); };

  const handleMarkAllRead = async () => {
    await api.markAllNotificationsRead();
    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
  };

  const handleTap = async (notification) => {
    // Mark as read
    if (!notification.is_read) {
      api.markNotificationRead(notification.id);
      setNotifications(prev =>
        prev.map(n => n.id === notification.id ? { ...n, is_read: 1 } : n)
      );
    }

    // Navigate based on type
    const data = notification.data || {};
    switch (notification.type) {
      case 'ticket':
        if (data.ticketId) {
          navigation.navigate('Dashboard', {
            screen: 'DashboardHome',
          });
        }
        break;
      case 'invoice':
        navigation.navigate('Invoices');
        break;
      case 'network':
        navigation.navigate('Usage');
        break;
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  // ── Loading ──
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading notifications...</Text>
      </View>
    );
  }

  // ── Empty ──
  if (notifications.length === 0) {
    return (
      <View style={styles.center}>
        <View style={styles.emptyIcon}>
          <Ionicons name="notifications-off-outline" size={48} color={COLORS.textMuted} />
        </View>
        <Text style={styles.emptyTitle}>No Notifications</Text>
        <Text style={styles.emptyText}>
          You'll see ticket updates, invoice{'\n'}reminders, and network alerts here.
        </Text>
        {pushStatus !== 'registered' && (
          <TouchableOpacity style={styles.enableBtn} onPress={handleEnablePush} disabled={pushStatus === 'registering'}>
            <Ionicons name="notifications" size={18} color="#fff" />
            <Text style={styles.enableBtnText}>
              {pushStatus === 'registering' ? 'Enabling...' : 'Enable Push Notifications'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const renderItem = ({ item }) => {
    const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.announcement;
    const isUnread = !item.is_read;

    return (
      <TouchableOpacity
        style={[styles.card, isUnread && styles.cardUnread]}
        onPress={() => handleTap(item)}
        activeOpacity={0.7}
      >
        {/* Unread dot */}
        {isUnread && <View style={styles.unreadDot} />}

        {/* Icon */}
        <View style={[styles.iconWrap, { backgroundColor: config.bg }]}>
          <Ionicons name={config.icon} size={20} color={config.color} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, isUnread && styles.titleBold]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
          </View>
          <Text style={styles.message} numberOfLines={2}>{item.message}</Text>
          <View style={styles.typeBadge}>
            <Text style={[styles.typeBadgeText, { color: config.color }]}>{config.label}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Push notification enable banner */}
      {pushStatus !== 'registered' && (
        <TouchableOpacity style={styles.pushBanner} onPress={handleEnablePush} disabled={pushStatus === 'registering'}>
          <Ionicons name="notifications" size={18} color="#fff" />
          <Text style={styles.pushBannerText}>
            {pushStatus === 'registering' ? 'Enabling...' : 'Tap to enable push notifications'}
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Mark all read header */}
      {unreadCount > 0 && (
        <TouchableOpacity style={styles.markAllBar} onPress={handleMarkAllRead}>
          <Ionicons name="checkmark-done-outline" size={18} color={COLORS.primary} />
          <Text style={styles.markAllText}>Mark all as read ({unreadCount})</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={notifications}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 14, color: COLORS.textMuted },

  // Empty state
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  emptyText: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },

  // Enable push button
  enableBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 12, marginTop: 20,
  },
  enableBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // Push banner (above list)
  pushBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#F59E0B', paddingVertical: 10, paddingHorizontal: 16,
  },
  pushBannerText: { color: '#fff', fontSize: 13, fontWeight: '600', flex: 1 },

  // Mark all bar
  markAllBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, gap: 6,
    backgroundColor: COLORS.primaryBg, borderBottomWidth: 1, borderBottomColor: '#DBEAFE',
  },
  markAllText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },

  // List
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  separator: { height: 1, backgroundColor: '#F1F5F9', marginLeft: 60 },

  // Card
  card: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 14, paddingHorizontal: 4,
    gap: 12, position: 'relative',
  },
  cardUnread: { backgroundColor: '#FAFBFF' },
  unreadDot: {
    position: 'absolute', left: -4, top: 20,
    width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
    marginTop: 2,
  },
  content: { flex: 1 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  title: { fontSize: 14, color: COLORS.text, flex: 1, marginRight: 8 },
  titleBold: { fontWeight: '700' },
  time: { fontSize: 11, color: COLORS.textMuted },
  message: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 18, marginBottom: 6 },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 2,
    backgroundColor: '#F1F5F9', borderRadius: 6,
  },
  typeBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
});
