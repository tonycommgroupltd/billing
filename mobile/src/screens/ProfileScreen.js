// ============================================
// HOMELINK Customer App — Profile Screen
// ============================================
// Professional profile page with real API data
// Shows: personal info, all services, quick actions, logout
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, Linking, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import { useAuth } from '../auth/AuthContext';
import api from '../api/client';

export default function ProfileScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState(null);

  const fetchProfile = useCallback(async () => {
    try {
      const data = await api.getProfile();
      if (data) setProfile(data);
    } catch (err) {
      console.warn('Profile load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  // Re-fetch profile when returning from EditProfile
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (profile) fetchProfile(); // Only re-fetch if already loaded once
    });
    return unsubscribe;
  }, [navigation, profile]);

  const onRefresh = () => { setRefreshing(true); fetchProfile(); };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      // Alert.alert callbacks are unreliable on web — use native confirm
      const confirmed = window.confirm('Are you sure you want to sign out?');
      if (confirmed) {
        logout();
      }
      return;
    }
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          logout();
        },
      },
    ]);
  };

  // Helpers
  const services = profile?.services || [];
  const initials = (profile?.name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const memberSince = profile?.memberSince
    ? new Date(profile.memberSince).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : '—';

  // ── Loading ──
  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Profile Header ── */}
      <LinearGradient
        colors={[COLORS.primaryDark, COLORS.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.onlineBadge}>
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
          </View>
        </View>
        <Text style={styles.heroName}>{profile?.name || 'Customer'}</Text>
        <Text style={styles.heroPhone}>{profile?.phone || user?.phone || ''}</Text>
        <View style={styles.heroBadge}>
          <Ionicons name="shield-checkmark" size={12} color={COLORS.primary} />
          <Text style={styles.heroBadgeText}>Customer ID: {profile?.customerId || '—'}</Text>
        </View>
        <View style={styles.heroCircle1} />
        <View style={styles.heroCircle2} />
      </LinearGradient>

      {/* ── Stats Row ── */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{services.length}</Text>
          <Text style={styles.statLabel}>{services.length === 1 ? 'Service' : 'Services'}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{memberSince.split(' ')[0]}</Text>
          <Text style={styles.statLabel}>{memberSince.split(' ')[1] || 'Member'}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: COLORS.success }]}>
            {services.filter(s => s.status === 'Active').length}
          </Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
      </View>

      {/* ── Personal Information ── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIconWrap}>
            <Ionicons name="person-outline" size={16} color={COLORS.primary} />
          </View>
          <Text style={styles.cardTitle}>Personal Information</Text>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => navigation.navigate('EditProfile', { profile })}
            activeOpacity={0.7}
          >
            <Ionicons name="create-outline" size={14} color={COLORS.primary} />
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
        </View>
        <InfoRow icon="person-outline" label="Full Name" value={profile?.name} />
        <InfoRow icon="call-outline" label="Phone Number" value={profile?.phone} />
        <InfoRow icon="location-outline" label="Address" value={profile?.address || 'Not set'} />
        <InfoRow icon="business-outline" label="City" value={profile?.city || 'Not set'} />
        <InfoRow icon="calendar-outline" label="Member Since" value={memberSince} isLast />
      </View>

      {/* ── Services ── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIconWrap}>
            <Ionicons name="server-outline" size={16} color={COLORS.primary} />
          </View>
          <Text style={styles.cardTitle}>
            {services.length > 1 ? `Your Services (${services.length})` : 'Service Details'}
          </Text>
        </View>

        {services.length === 0 ? (
          <View style={styles.emptyService}>
            <Ionicons name="wifi-outline" size={28} color={COLORS.textMuted} />
            <Text style={styles.emptyServiceText}>No active services</Text>
          </View>
        ) : (
          services.map((svc, idx) => (
            <ServiceCard key={svc.id} service={svc} isLast={idx === services.length - 1} />
          ))
        )}
      </View>

      {/* ── Account Actions ── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIconWrap}>
            <Ionicons name="settings-outline" size={16} color={COLORS.primary} />
          </View>
          <Text style={styles.cardTitle}>Account</Text>
        </View>

        <ActionRow
          icon="wifi-outline"
          iconBg={COLORS.primaryBg}
          iconColor={COLORS.primary}
          label="Change WiFi Password"
          sub="Update your WiFi name and password"
          onPress={() => navigation.navigate('ChangePassword')}
        />
        <ActionRow
          icon="document-text-outline"
          iconBg={COLORS.secondaryBg}
          iconColor={COLORS.secondary}
          label="View Invoices"
          sub="See all your invoices and payments"
          onPress={() => navigation.navigate('Invoices')}
        />
        <ActionRow
          icon="receipt-outline"
          iconBg="#E8F5E9"
          iconColor={COLORS.success}
          label="Account Statement"
          sub="Download a detailed statement (PDF)"
          onPress={() => navigation.navigate('Statement')}
        />
        <ActionRow
          icon="hardware-chip-outline"
          iconBg="#FFF3E0"
          iconColor="#F57C00"
          label="My Network"
          sub="View signal, ONU & connection details"
          onPress={() => navigation.navigate('MyNetwork')}
          isLast
        />
      </View>

      {/* ── Support ── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIconWrap}>
            <Ionicons name="help-circle-outline" size={16} color={COLORS.primary} />
          </View>
          <Text style={styles.cardTitle}>Support</Text>
        </View>

        <ActionRow
          icon="call-outline"
          iconBg="#E3F2FD"
          iconColor="#1565C0"
          label="Call Support"
          sub="+254 700 000 000"
          onPress={() => Linking.openURL('tel:+254110345166')}
        />
        <ActionRow
          icon="logo-whatsapp"
          iconBg="#E8F5E9"
          iconColor="#2E7D32"
          label="WhatsApp"
          sub="Chat with us"
          onPress={() => Linking.openURL('https://wa.me/254110345166')}
        />
        <ActionRow
          icon="mail-outline"
          iconBg="#FFF3E0"
          iconColor="#E65100"
          label="Email"
          sub="support@homelink.local"
          onPress={() => Linking.openURL('mailto:support@homelink.local')}
          isLast
        />
      </View>

      {/* ── Logout ── */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
        <View style={styles.logoutIconWrap}>
          <Ionicons name="log-out-outline" size={18} color={COLORS.danger} />
        </View>
        <Text style={styles.logoutText}>Sign Out</Text>
        <Ionicons name="chevron-forward" size={18} color={COLORS.danger} />
      </TouchableOpacity>

      {/* ── Footer ── */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Powered by HOMELINK Group Ltd</Text>
        <Text style={styles.footerVersion}>HOMELINK v1.0.0</Text>
      </View>
    </ScrollView>
  );
}

// ============ Sub-Components ============

function InfoRow({ icon, label, value, isLast }) {
  return (
    <View style={[styles.infoRow, !isLast && styles.infoRowBorder]}>
      <View style={styles.infoLeft}>
        <Ionicons name={icon} size={16} color={COLORS.textMuted} />
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text style={styles.infoValue} numberOfLines={1}>{value || '—'}</Text>
    </View>
  );
}

function ServiceCard({ service, isLast }) {
  const isActive = service.status === 'Active';
  const billTo = service.billTo
    ? new Date(service.billTo).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

  return (
    <View style={[styles.serviceCard, !isLast && styles.serviceCardBorder]}>
      <View style={styles.serviceTop}>
        <View style={styles.serviceInfo}>
          <Text style={styles.serviceName}>{service.mikrotikName}</Text>
          <Text style={styles.servicePlan}>{service.planName}</Text>
        </View>
        <View style={[styles.statusBadge, isActive ? styles.statusActive : styles.statusInactive]}>
          <View style={[styles.statusDot, isActive ? styles.dotActive : styles.dotInactive]} />
          <Text style={[styles.statusText, isActive ? styles.statusTextActive : styles.statusTextInactive]}>
            {service.status}
          </Text>
        </View>
      </View>
      <View style={styles.serviceDetails}>
        <View style={styles.serviceDetail}>
          <Ionicons name="cash-outline" size={13} color={COLORS.textMuted} />
          <Text style={styles.serviceDetailText}>KSh {service.price?.toLocaleString()}/mo</Text>
        </View>
        <View style={styles.serviceDetail}>
          <Ionicons name="calendar-outline" size={13} color={COLORS.textMuted} />
          <Text style={styles.serviceDetailText}>Bill to: {billTo}</Text>
        </View>
      </View>
    </View>
  );
}

function ActionRow({ icon, iconBg, iconColor, label, sub, onPress, isLast }) {
  return (
    <TouchableOpacity
      style={[styles.actionRow, !isLast && styles.actionRowBorder]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={[styles.actionIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={17} color={iconColor} />
      </View>
      <View style={styles.actionBody}>
        <Text style={styles.actionLabel}>{label}</Text>
        {sub ? <Text style={styles.actionSub}>{sub}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
}

// ============ Styles ============
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: 30 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: COLORS.textSecondary },

  // ── Hero ──
  hero: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 28,
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  avatarWrap: { position: 'relative', marginBottom: 14 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  avatarText: { fontSize: 28, fontWeight: '700', color: '#fff' },
  onlineBadge: {
    position: 'absolute',
    bottom: 0,
    right: -2,
    backgroundColor: COLORS.success,
    borderRadius: 10,
    width: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.primaryDark,
  },
  heroName: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 2 },
  heroPhone: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 10 },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  heroBadgeText: { fontSize: 11, fontWeight: '600', color: COLORS.primaryDark },
  heroCircle1: {
    position: 'absolute', top: -40, right: -25,
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  heroCircle2: {
    position: 'absolute', bottom: -30, left: -15,
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },

  // ── Stats Bar ──
  statsBar: {
    flexDirection: 'row',
    marginHorizontal: SIZES.md,
    marginTop: -14,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    ...SHADOWS.card,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  statLabel: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: COLORS.borderLight, marginVertical: 4 },

  // ── Card ──
  card: {
    marginHorizontal: SIZES.md,
    marginTop: SIZES.md,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  cardIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: COLORS.primaryBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, flex: 1 },

  // ── Edit Button ──
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16,
    backgroundColor: COLORS.primaryBg,
  },
  editBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.primary },

  // ── Info Row ──
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  infoLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoLabel: { fontSize: 13, color: COLORS.textSecondary },
  infoValue: { fontSize: 13, fontWeight: '600', color: COLORS.text, maxWidth: '55%', textAlign: 'right' },

  // ── Service Card ──
  serviceCard: { padding: 14 },
  serviceCardBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  serviceTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  serviceInfo: { flexShrink: 1, marginRight: 10 },
  serviceName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  servicePlan: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusActive: { backgroundColor: COLORS.accentBg },
  statusInactive: { backgroundColor: '#FEE2E2' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  dotActive: { backgroundColor: COLORS.success },
  dotInactive: { backgroundColor: COLORS.danger },
  statusText: { fontSize: 11, fontWeight: '600' },
  statusTextActive: { color: COLORS.success },
  statusTextInactive: { color: COLORS.danger },
  serviceDetails: { flexDirection: 'row', gap: 16, marginTop: 10 },
  serviceDetail: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  serviceDetailText: { fontSize: 12, color: COLORS.textMuted },

  emptyService: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyServiceText: { fontSize: 13, color: COLORS.textMuted },

  // ── Action Row ──
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
  },
  actionRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBody: { flex: 1 },
  actionLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  actionSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },

  // ── Logout ──
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SIZES.md,
    marginTop: SIZES.md,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    gap: 12,
    ...SHADOWS.card,
  },
  logoutIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutText: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.danger },

  // ── Footer ──
  footer: { alignItems: 'center', marginTop: SIZES.xl, paddingBottom: SIZES.md },
  footerText: { fontSize: 12, color: COLORS.textMuted },
  footerVersion: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
});
