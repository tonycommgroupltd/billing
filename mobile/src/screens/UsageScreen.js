// ============================================
// HOMELINK Customer App — Usage & Services Screen
// ============================================
// Hub for: Plan Upgrade, Speed Test, Connection Info
// Replaces Statement in bottom tabs
// Premium UI consistent with the rest of the app
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Dimensions, Linking, Platform, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import { useAuth } from '../auth/AuthContext';
import api from '../api/client';
import ConnectedDevicesPanel from '../components/ConnectedDevicesPanel';
import ParentalWifiPanel from '../components/ParentalWifiPanel';

const { width: SCREEN_W } = Dimensions.get('window');

export default function UsageScreen({ navigation }) {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 768;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(null);
  const [selectedServiceIdx, setSelectedServiceIdx] = useState(0);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [connectedDevices, setConnectedDevices] = useState(null);
  const [devicesMessage, setDevicesMessage] = useState(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const result = await api.getDashboard();
      if (result) setData(result);
    } catch (err) {
      console.warn('Usage fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const allServices = data?.services || [];
  const service = allServices.length > 0 ? allServices[selectedServiceIdx] || allServices[0] : data?.service;
  const serviceId = service?.id;

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const fetchConnectedDevices = useCallback(async () => {
    if (!serviceId || !isDesktopWeb) {
      setConnectedDevices(null);
      return;
    }
    setDevicesLoading(true);
    setDevicesMessage(null);
    try {
      const result = await api.getConnectedDevices(serviceId);
      if (result.error) {
        setDevicesMessage(result.error);
        setConnectedDevices([]);
      } else if (!result.onuFound) {
        setDevicesMessage(result.message || 'Your router is not on SmartOLT remote management.');
        setConnectedDevices([]);
      } else {
        setConnectedDevices(result.connectedDevices || []);
        setDevicesMessage(null);
      }
    } catch {
      setDevicesMessage('Could not load connected devices.');
      setConnectedDevices([]);
    } finally {
      setDevicesLoading(false);
    }
  }, [serviceId, isDesktopWeb]);

  useEffect(() => {
    fetchConnectedDevices();
  }, [fetchConnectedDevices]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboard();
    fetchConnectedDevices();
  };

  const hasMultipleServices = allServices.length > 1;
  const isOnline = service?.connectionStatus === 'online';

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
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
      {/* ── Hero ── */}
      <LinearGradient
        colors={['#F58220', '#1B4E79', '#0D47A1']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroContent}>
          <View style={styles.heroIconWrap}>
            <Ionicons name="analytics" size={28} color="#fff" />
          </View>
          <Text style={styles.heroTitle}>{hasMultipleServices ? 'My Services' : 'My Service'}</Text>
          <Text style={styles.heroSub}>
            {hasMultipleServices
              ? `Managing ${allServices.length} services — select one below`
              : 'Manage your internet plan & connection'}
          </Text>
        </View>

        {/* ─── Service Picker (inside hero) ─── */}
        {hasMultipleServices && (
          <View style={styles.servicePickerWrap}>
            <View style={styles.servicePickerHeader}>
              <Ionicons name="layers-outline" size={14} color="rgba(255,255,255,0.7)" />
              <Text style={styles.servicePickerLabel}>
                Select Service ({allServices.length})
              </Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.servicePickerScroll}
            >
              {allServices.map((svc, idx) => {
                const selected = idx === selectedServiceIdx;
                const svcOnline = svc.connectionStatus === 'online';
                return (
                  <TouchableOpacity
                    key={svc.id}
                    style={[styles.serviceChip, selected && styles.serviceChipActive]}
                    onPress={() => setSelectedServiceIdx(idx)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.serviceChipDot, svcOnline ? styles.dotOnline : styles.dotOffline]} />
                    <View style={{ flexShrink: 1 }}>
                      <Text style={[styles.serviceChipName, selected && styles.serviceChipNameActive]} numberOfLines={1}>
                        {svc.mikrotikName}
                      </Text>
                      <Text style={[styles.serviceChipPlan, selected && styles.serviceChipPlanActive]} numberOfLines={1}>
                        {svc.planName} · KSh {svc.price?.toLocaleString()}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Current Plan Summary */}
        {service && (
          <View style={styles.planSummary}>
            <View style={styles.planSummaryLeft}>
              <Text style={styles.planLabel}>Active Plan</Text>
              <Text style={styles.planName}>{service.planName || 'No Plan'}</Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: isOnline ? COLORS.accent : COLORS.danger }]} />
                <Text style={[styles.statusText, { color: isOnline ? COLORS.accent : COLORS.danger }]}>
                  {isOnline ? 'Online' : 'Offline'}
                </Text>
              </View>
            </View>
            <View style={styles.planSummaryRight}>
              <Text style={styles.planPriceLabel}>Monthly</Text>
              <Text style={styles.planPrice}>KES {service.price?.toLocaleString()}</Text>
            </View>
          </View>
        )}
      </LinearGradient>

      {/* ── Double Speed Banner ── */}
      <View style={styles.offerBanner}>
        <LinearGradient
          colors={['#F59E0B', '#F97316']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.offerGradient}
        >
          <Ionicons name="flash" size={22} color="#fff" />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.offerTitle}>🔥 Double Speed Offer!</Text>
            <Text style={styles.offerText}>All plans come with DOUBLE the advertised speed</Text>
          </View>
          <Ionicons name="rocket" size={20} color="rgba(255,255,255,0.7)" />
        </LinearGradient>
      </View>

      {/* ── Connected Devices (desktop / web — SmartOLT customers) ── */}
      {isDesktopWeb && (
        <View style={styles.devicesSection}>
          <View style={styles.devicesSectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Connected Devices</Text>
              <Text style={styles.devicesSub}>
                Devices currently online on your router (SmartOLT)
              </Text>
            </View>
            <TouchableOpacity
              style={styles.devicesRefreshBtn}
              onPress={fetchConnectedDevices}
              disabled={devicesLoading}
            >
              <Ionicons name="refresh" size={18} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
          <View style={styles.devicesCard}>
            <ConnectedDevicesPanel
              devices={connectedDevices || []}
              loading={devicesLoading}
              emptyMessage={devicesMessage || 'No devices detected, or ONU is offline.'}
            />
            <TouchableOpacity
              style={styles.devicesLink}
              onPress={() => navigation.navigate('MyNetwork', { serviceId })}
            >
              <Text style={styles.devicesLinkText}>View full network details</Text>
              <Ionicons name="arrow-forward" size={16} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Parental WiFi control ── */}
      {service?.id && (
        <View style={{ paddingHorizontal: SIZES.lg, marginBottom: SIZES.lg }}>
          <ParentalWifiPanel serviceId={service.id} />
        </View>
      )}

      {/* ── Service Cards Grid ── */}
      <View style={styles.cardsGrid}>
        {/* Change WiFi Password */}
        <TouchableOpacity
          style={styles.serviceCard}
          onPress={() => navigation.navigate('Dashboard', { screen: 'ChangePassword', params: { serviceId: service?.id, tab: 'wifi' } })}
          activeOpacity={0.7}
        >
          <View style={[styles.cardIcon, { backgroundColor: '#F3E8FF' }]}>
            <Ionicons name="wifi" size={24} color="#8B5CF6" />
          </View>
          <Text style={styles.cardTitle}>WiFi Password</Text>
          <Text style={styles.cardDesc}>Change WiFi name & password</Text>
          <View style={styles.cardArrow}>
            <Ionicons name="arrow-forward" size={16} color={COLORS.primary} />
          </View>
        </TouchableOpacity>

        {/* Upgrade / Change Plan */}
        <TouchableOpacity
          style={styles.serviceCard}
          onPress={() => navigation.navigate('ChangePlan', { serviceId: service?.id })}
          activeOpacity={0.7}
        >
          <View style={[styles.cardIcon, { backgroundColor: '#EDE9FE' }]}>
            <Ionicons name="swap-vertical" size={24} color="#8B5CF6" />
          </View>
          <Text style={styles.cardTitle}>Change Plan</Text>
          <Text style={styles.cardDesc}>Upgrade or downgrade your speed</Text>
          <View style={styles.cardArrow}>
            <Ionicons name="arrow-forward" size={16} color={COLORS.primary} />
          </View>
        </TouchableOpacity>

        {/* Speed Test */}
        <TouchableOpacity
          style={styles.serviceCard}
          onPress={() => Linking.openURL('https://fast.com')}
          activeOpacity={0.7}
        >
          <View style={[styles.cardIcon, { backgroundColor: COLORS.accentBg }]}>
            <Ionicons name="speedometer" size={24} color={COLORS.accent} />
          </View>
          <Text style={styles.cardTitle}>Speed Test</Text>
          <Text style={styles.cardDesc}>Check your current internet speed</Text>
          <View style={styles.cardArrow}>
            <Ionicons name="arrow-forward" size={16} color={COLORS.primary} />
          </View>
        </TouchableOpacity>

        {/* My Network */}
        <TouchableOpacity
          style={styles.serviceCard}
          onPress={() => navigation.navigate('MyNetwork', { serviceId: service?.id })}
          activeOpacity={0.7}
        >
          <View style={[styles.cardIcon, { backgroundColor: COLORS.primaryBg }]}>
            <Ionicons name="hardware-chip" size={24} color={COLORS.primary} />
          </View>
          <Text style={styles.cardTitle}>My Network</Text>
          <Text style={styles.cardDesc}>Signal, connected devices & WiFi</Text>
          <View style={styles.cardArrow}>
            <Ionicons name="arrow-forward" size={16} color={COLORS.primary} />
          </View>
        </TouchableOpacity>

        {/* Data Usage */}
        <TouchableOpacity
          style={styles.serviceCard}
          onPress={() => navigation.navigate('DataUsage', { serviceId: service?.id })}
          activeOpacity={0.7}
        >
          <View style={[styles.cardIcon, { backgroundColor: '#EFF6FF' }]}>
            <Ionicons name="bar-chart" size={24} color="#3B82F6" />
          </View>
          <Text style={styles.cardTitle}>Data Usage</Text>
          <Text style={styles.cardDesc}>View bandwidth usage & graphs</Text>
          <View style={styles.cardArrow}>
            <Ionicons name="arrow-forward" size={16} color={COLORS.primary} />
          </View>
        </TouchableOpacity>

        {/* All Plans */}
        <TouchableOpacity
          style={styles.serviceCard}
          onPress={() => navigation.navigate('ChangePlan')}
          activeOpacity={0.7}
        >
          <View style={[styles.cardIcon, { backgroundColor: '#FEF3C7' }]}>
            <Ionicons name="pricetags" size={24} color="#F59E0B" />
          </View>
          <Text style={styles.cardTitle}>View Plans</Text>
          <Text style={styles.cardDesc}>Browse all available packages</Text>
          <View style={styles.cardArrow}>
            <Ionicons name="arrow-forward" size={16} color={COLORS.primary} />
          </View>
        </TouchableOpacity>

        {/* Loyalty Rewards */}
        <TouchableOpacity
          style={styles.serviceCard}
          onPress={() => navigation.navigate('Rewards', { serviceId: service?.id })}
          activeOpacity={0.7}
        >
          <View style={[styles.cardIcon, { backgroundColor: '#FFFBEB' }]}>
            <Ionicons name="star" size={24} color="#D97706" />
          </View>
          <Text style={styles.cardTitle}>Rewards</Text>
          <Text style={styles.cardDesc}>Earn free days with loyalty tokens</Text>
          <View style={styles.cardArrow}>
            <Ionicons name="arrow-forward" size={16} color={COLORS.primary} />
          </View>
        </TouchableOpacity>
      </View>

      {/* ── Connection Quick Stats ── */}
      {service && (
        <View style={styles.statsSection}>
          <Text style={styles.sectionTitle}>Connection Details</Text>
          <View style={styles.statsCard}>
            <StatRow icon="person-outline" label="Service Name" value={service.mikrotikName || '—'} />
            <StatRow icon="at-outline" label="PPPoE Username" value={service.pppoeUsername || service.mikrotikName || '—'} />
            <StatRow icon="calendar-outline" label="Next Billing" value={service.billTo ? new Date(service.billTo).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'} />
            <StatRow icon="time-outline" label="Days Until Bill" value={service.daysUntilBill != null ? `${service.daysUntilBill} days` : '—'} />
            <StatRow icon="globe-outline" label="Status" value={service.status || (isOnline ? 'Online' : 'Offline')} valueColor={isOnline ? COLORS.accent : COLORS.danger} last />
          </View>
        </View>
      )}

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

// ── Stat row component ──
function StatRow({ icon, label, value, valueColor, last }) {
  return (
    <View style={[styles.statRow, !last && styles.statRowBorder]}>
      <View style={styles.statLeft}>
        <Ionicons name={icon} size={18} color={COLORS.textMuted} />
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <Text style={[styles.statValue, valueColor && { color: valueColor }]}>{value}</Text>
    </View>
  );
}

// ── Styles ──
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: 20 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  loadingText: { marginTop: 12, color: COLORS.textSecondary, fontSize: SIZES.body },

  // Hero
  hero: { paddingTop: 20, paddingBottom: 24, paddingHorizontal: SIZES.lg },
  heroContent: { alignItems: 'center', marginBottom: 20 },
  heroIconWrap: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  heroTitle: { fontSize: SIZES.heading, fontWeight: '700', color: '#fff' },
  heroSub: { fontSize: SIZES.body, color: 'rgba(255,255,255,0.8)', marginTop: 4 },

  // Plan Summary
  planSummary: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: SIZES.radiusLg,
    padding: SIZES.md, ...SHADOWS.medium,
  },
  planSummaryLeft: { flex: 1 },
  planSummaryRight: { alignItems: 'flex-end', justifyContent: 'center' },
  planLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  planName: { fontSize: SIZES.subtitle, fontWeight: '700', color: COLORS.text, marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '600' },
  planPriceLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '500' },
  planPrice: { fontSize: SIZES.title, fontWeight: '800', color: COLORS.primary, marginTop: 2 },

  // Offer Banner
  offerBanner: { marginHorizontal: SIZES.md, marginTop: -12, marginBottom: 8, borderRadius: SIZES.radius, overflow: 'hidden', ...SHADOWS.medium },
  offerGradient: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  offerTitle: { fontSize: 14, fontWeight: '800', color: '#fff' },
  offerText: { fontSize: 12, color: 'rgba(255,255,255,0.9)', marginTop: 1 },

  // Cards Grid
  cardsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: SIZES.md, paddingTop: SIZES.md,
    gap: 12,
  },
  serviceCard: {
    width: (SCREEN_W - SIZES.md * 2 - 12) / 2,
    backgroundColor: COLORS.surface, borderRadius: SIZES.radius,
    padding: 16, ...SHADOWS.small,
  },
  cardIcon: {
    width: 44, height: 44, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  cardTitle: { fontSize: SIZES.bodyLg, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  cardDesc: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 16 },
  cardArrow: {
    position: 'absolute', top: 16, right: 16,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: COLORS.primaryBg,
    justifyContent: 'center', alignItems: 'center',
  },

  // Connected devices (web/desktop)
  devicesSection: {
    marginTop: 20,
    marginHorizontal: SIZES.md,
    maxWidth: 960,
    alignSelf: 'center',
    width: '100%',
  },
  devicesSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  devicesSub: {
    fontSize: SIZES.caption,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  devicesRefreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primaryBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  devicesCard: {
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.radiusLg,
    padding: SIZES.lg,
    borderWidth: 2,
    borderColor: COLORS.primary,
    ...SHADOWS.small,
  },
  devicesLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: SIZES.md,
    paddingTop: SIZES.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  devicesLinkText: {
    fontSize: SIZES.body,
    fontWeight: '600',
    color: COLORS.primary,
  },

  // Stats Section
  sectionTitle: {
    fontSize: SIZES.bodyLg, fontWeight: '700', color: COLORS.text,
    paddingHorizontal: SIZES.md, marginBottom: 10,
  },
  statsSection: { marginTop: 20 },
  statsCard: {
    marginHorizontal: SIZES.md, backgroundColor: COLORS.surface,
    borderRadius: SIZES.radius, padding: 4, ...SHADOWS.small,
  },
  statRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 13, paddingHorizontal: 14,
  },
  statRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  statLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statLabel: { fontSize: SIZES.body, color: COLORS.textSecondary },
  statValue: { fontSize: SIZES.body, fontWeight: '600', color: COLORS.text },

  // ── Service Picker (inside hero) ──
  servicePickerWrap: {
    marginTop: 16,
    marginBottom: 4,
  },
  servicePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  servicePickerLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  servicePickerScroll: {
    gap: 8,
  },
  serviceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    minWidth: 160,
  },
  serviceChipActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderColor: 'rgba(255,255,255,0.5)',
  },
  serviceChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotOnline: { backgroundColor: '#34D399' },
  dotOffline: { backgroundColor: '#F87171' },
  serviceChipName: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
  },
  serviceChipNameActive: {
    color: '#fff',
  },
  serviceChipPlan: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 1,
  },
  serviceChipPlanActive: {
    color: 'rgba(255,255,255,0.85)',
  },
});
