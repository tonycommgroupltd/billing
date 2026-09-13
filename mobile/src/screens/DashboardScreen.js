// ============================================
// HOMELINK Customer App — Dashboard Screen
// ============================================
// Professional ISP customer dashboard
// Theme: Indigo primary + Blue secondary + Emerald accent
// Clean flat design – minimal gradients
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Dimensions, Linking, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import { useAuth } from '../auth/AuthContext';
import api from '../api/client';

const { width: SCREEN_W } = Dimensions.get('window');

const PROMO_BANNERS = [
  { id: '1', image: require('../../assets/token-adv.webp'), alt: 'Loyalty Rewards' },
  { id: '2', image: require('../../assets/knock-adv.webp'), alt: 'Discover HOMELINK' },
  { id: '3', image: require('../../assets/get-double-adv.webp'), alt: 'Double Speed' },
];

export default function DashboardScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedServiceIdx, setSelectedServiceIdx] = useState(0);
  const [loyalty, setLoyalty] = useState(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const [result, loyaltyData] = await Promise.all([
        api.getDashboard(),
        api.checkLoyaltyTokens().then(() => api.getLoyaltyBalance()),
      ]);
      if (result) setData(result);
      if (loyaltyData) setLoyalty(loyaltyData);
    } catch (err) {
      console.warn('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const onRefresh = () => { setRefreshing(true); fetchDashboard(); };

  // Helpers
  const firstName = (data?.customer?.name || user?.name || 'Customer').split(' ')[0];
  const allServices = data?.services || [];
  const service = allServices.length > 0 ? allServices[selectedServiceIdx] || allServices[0] : data?.service;
  const hasMultipleServices = allServices.length > 1;
  const isOnline = service?.connectionStatus === 'online';
  const balance = data?.summary?.balance || 0;
  const daysUntilBill = data?.summary?.daysUntilBill;
  const invoices = data?.invoices || [];
  const unpaid = invoices.find(i => i.status !== 'Paid');

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatShortDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  // ============ LOADING ============
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading your dashboard...</Text>
      </View>
    );
  }

  // ============ MAIN RENDER ============
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* ─── Hero Header ─── */}
      <LinearGradient
        colors={[COLORS.primaryDark, COLORS.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroGreeting}>Good {getGreeting()},</Text>
            <Text style={styles.heroName}>{firstName}</Text>
          </View>
          {service && (
            <TouchableOpacity
              style={[styles.statusChip, isOnline ? styles.chipOnline : styles.chipOffline]}
              onPress={() => navigation.navigate('MyNetwork')}
              activeOpacity={0.8}
            >
              <View style={[styles.statusDot, isOnline ? styles.dotOnline : styles.dotOffline]} />
              <Text style={styles.statusChipText}>{isOnline ? 'Online' : 'Offline'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Balance summary inside hero */}
        <View style={styles.heroBalance}>
          <View>
            <Text style={styles.heroBalanceLabel}>Outstanding Balance</Text>
            <Text style={styles.heroBalanceAmount}>KSh {balance.toLocaleString()}</Text>
          </View>
          {unpaid && (
            <TouchableOpacity
              style={styles.heroPayBtn}
              onPress={() => navigation.navigate('Payment', { invoice: unpaid, services: allServices, allInvoices: invoices })}
              activeOpacity={0.85}
            >
              <Text style={styles.heroPayText}>Pay Now</Text>
              <Ionicons name="arrow-forward" size={14} color={COLORS.primary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Decorative shapes */}
        <View style={styles.heroCircle1} />
        <View style={styles.heroCircle2} />
      </LinearGradient>

      {/* ─── Service Picker (multi-service customers) ─── */}
      {hasMultipleServices && (
        <View style={styles.servicePickerCard}>
          <View style={styles.servicePickerHeader}>
            <Ionicons name="layers-outline" size={16} color={COLORS.primary} />
            <Text style={styles.servicePickerLabel}>
              Your Services ({allServices.length})
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

      {/* ─── Stat Cards ─── */}
      <View style={styles.statsRow}>
        <StatCard
          icon="wifi"
          iconBg={COLORS.primaryBg}
          iconColor={COLORS.primary}
          title="Current Plan"
          value={service?.planName || 'No Plan'}
          sub={`KSh ${service?.price?.toLocaleString() || '—'}/mo`}
          onPress={() => navigation.navigate('Usage')}
        />
        <StatCard
          icon="calendar"
          iconBg={COLORS.secondaryBg}
          iconColor={COLORS.secondary}
          title="Next Bill"
          value={formatShortDate(service?.billTo)}
          sub={daysUntilBill != null ? (daysUntilBill > 0 ? `${daysUntilBill} days left` : 'Due now') : '—'}
          onPress={() => navigation.navigate('Invoices')}
        />
      </View>

      {/* ─── Loyalty Rewards Card ─── */}
      {loyalty && (
        <TouchableOpacity
          style={styles.rewardsCard}
          onPress={() => navigation.navigate('Rewards')}
          activeOpacity={0.85}
        >
          <View style={styles.rewardsInner}>
            <View style={styles.rewardsLeft}>
              <LinearGradient
                colors={['#F59E0B', '#FBBF24']}
                style={styles.rewardsIconWrap}
              >
                <Ionicons name="diamond" size={18} color="#fff" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.rewardsTitle}>Loyalty Rewards</Text>
                  {(loyalty.balance || 0) > 0 && (
                    <View style={styles.rewardsTokenBadge}>
                      <Text style={styles.rewardsTokenBadgeText}>{loyalty.balance}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.rewardsSub}>
                  {(loyalty.balance || 0) > 0
                    ? `${loyalty.balance} free day${loyalty.balance !== 1 ? 's' : ''} ready to claim`
                    : 'Pay in full to earn free days'}
                </Text>
              </View>
            </View>
            <View style={styles.rewardsArrow}>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
            </View>
          </View>
        </TouchableOpacity>
      )}

      {/* ─── Unpaid Invoice Alert ─── */}
      {unpaid && (
        <TouchableOpacity
          style={styles.alertCard}
          onPress={() => navigation.navigate('Payment', { invoice: unpaid, services: allServices, allInvoices: invoices })}
          activeOpacity={0.85}
        >
          <View style={styles.alertIconWrap}>
            <Ionicons name="alert-circle" size={22} color={COLORS.warning} />
          </View>
          <View style={styles.alertBody}>
            <Text style={styles.alertTitle}>Invoice Due</Text>
            <Text style={styles.alertSub}>
              KSh {unpaid.total.toLocaleString()} · Due {formatShortDate(unpaid.dueDate)}
            </Text>
          </View>
          <View style={styles.alertActionBtn}>
            <Text style={styles.alertActionText}>Pay</Text>
            <Ionicons name="arrow-forward" size={13} color="#fff" />
          </View>
        </TouchableOpacity>
      )}

      {/* ─── Service / Account Info ─── */}
      {service && (
        <View style={styles.accountCard}>
          <View style={styles.accountHeader}>
            <View style={styles.accountIconWrap}>
              <Ionicons name="server-outline" size={18} color={COLORS.primary} />
            </View>
            <Text style={styles.accountHeaderText}>Account Overview</Text>
          </View>
          <View style={styles.accountBody}>
            <InfoRow icon="wifi-outline" label="Plan" value={service.planName} />
            <InfoRow icon="person-outline" label="PPPoE Username" value={service.mikrotikName || '—'} />
            <InfoRow
              icon="calendar-outline"
              label="Billing Period"
              value={`${formatShortDate(service.startDate)} – ${formatShortDate(service.billTo)}`}
            />
            <InfoRow icon="cash-outline" label="Monthly Rate" value={`KSh ${service.price?.toLocaleString()}`} />
            <InfoRow
              icon="radio-button-on"
              label="Connection"
              value={isOnline ? 'Online' : 'Offline'}
              valueColor={isOnline ? COLORS.success : COLORS.danger}
              isLast
            />
          </View>
        </View>
      )}

      {/* ─── Quick Actions ─── */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.actionsRow}>
        <QuickAction
          icon="card-outline"
          label="Pay"
          color={COLORS.accent}
          bg={COLORS.accentBg}
          onPress={() => {
            if (unpaid) navigation.navigate('Payment', { invoice: unpaid, services: allServices, allInvoices: invoices });
            else navigation.navigate('Payment', { services: allServices, allInvoices: invoices });
          }}
        />
        <QuickAction
          icon="document-text-outline"
          label="Invoices"
          color={COLORS.secondary}
          bg={COLORS.secondaryBg}
          onPress={() => navigation.navigate('Invoices')}
        />
        <QuickAction
          icon="rocket-outline"
          label="Upgrade"
          color="#8B5CF6"
          bg="#F5F3FF"
          onPress={() => navigation.navigate('ChangePlan')}
        />
        <QuickAction
          icon="key-outline"
          label="Password"
          color={COLORS.primaryDark}
          bg={COLORS.primaryBg}
          onPress={() => navigation.navigate('ChangePassword', { tab: 'wifi' })}
        />
        <QuickAction
          icon="bar-chart-outline"
          label="Data Usage"
          color={COLORS.primary}
          bg={COLORS.primaryBg}
          onPress={() => navigation.navigate('DataUsage')}
        />
        <QuickAction
          icon="wifi-outline"
          label="Network"
          color="#059669"
          bg="#ECFDF5"
          onPress={() => navigation.navigate('MyNetwork')}
        />
      </View>

      {/* ─── Recent Invoices ─── */}
      {invoices.length > 0 && (
        <View style={styles.invoicesSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitleInline}>Recent Invoices</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Invoices')}>
              <Text style={styles.viewAllLink}>View All</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.invoicesCard}>
            {invoices.slice(0, 3).map((inv, idx) => (
              <TouchableOpacity
                key={inv.id}
                style={[
                  styles.invoiceRow,
                  idx < Math.min(invoices.length, 3) - 1 && styles.invoiceRowBorder,
                ]}
                activeOpacity={0.7}
                onPress={() => {
                  if (inv.status !== 'Paid') {
                    navigation.navigate('Payment', { invoice: inv, services: allServices, allInvoices: invoices });
                  }
                }}
              >
                <View style={[
                  styles.invoiceIcon,
                  inv.status === 'Paid'
                    ? { backgroundColor: COLORS.accentBg }
                    : { backgroundColor: '#FEF3C7' },
                ]}>
                  <Ionicons
                    name={inv.status === 'Paid' ? 'checkmark-circle' : 'time'}
                    size={18}
                    color={inv.status === 'Paid' ? COLORS.success : COLORS.warning}
                  />
                </View>
                <View style={styles.invoiceContent}>
                  <Text style={styles.invoiceTitle}>Invoice #{inv.number || inv.id}</Text>
                  <Text style={styles.invoiceDate}>{formatDate(inv.date)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.invoiceAmount}>KSh {inv.total.toLocaleString()}</Text>
                  <View style={[
                    styles.statusBadge,
                    inv.status === 'Paid' ? styles.badgePaid : styles.badgeUnpaid,
                  ]}>
                    <Text style={[
                      styles.statusText,
                      inv.status === 'Paid' ? styles.statusPaid : styles.statusUnpaid,
                    ]}>{inv.status}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* ─── Explore & Discover ─── */}
      <View style={styles.exploreSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleInline}>Explore & Discover</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.bannerScroll}
          decelerationRate="fast"
          snapToInterval={SCREEN_W * 0.78 + 12}
          snapToAlignment="start"
        >
          {PROMO_BANNERS.map((banner) => (
            <View key={banner.id} style={styles.bannerCard}>
              <Image
                source={banner.image}
                style={styles.bannerImage}
                resizeMode="cover"
              />
            </View>
          ))}
        </ScrollView>
      </View>

      {/* ─── Support ─── */}
      <Text style={[styles.sectionTitle, { marginTop: SIZES.lg }]}>Need Help?</Text>
      <View style={styles.supportCard}>
        <SupportOption
          icon="call"
          label="Call Us"
          sub="+254 700 000 000"
          onPress={() => Linking.openURL('tel:+254110345166')}
        />
        <SupportOption
          icon="logo-whatsapp"
          label="WhatsApp"
          sub="Chat with us"
          onPress={() => Linking.openURL('https://wa.me/254110345166')}
        />
        <SupportOption
          icon="mail"
          label="Email"
          sub="support@acs.tcom.co.ke/homelink"
          onPress={() => Linking.openURL('mailto:support@acs.tcom.co.ke/homelink')}
        />
      </View>

      {/* ─── Footer ─── */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Powered by HOMELINK Group Ltd</Text>
        <Text style={styles.footerVersion}>HOMELINK v1.0</Text>
      </View>
    </ScrollView>
  );
}

// ============ Helpers ============

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

// ============ Sub-Components ============

function StatCard({ icon, iconBg, iconColor, title, value, sub, onPress }) {
  return (
    <TouchableOpacity style={styles.statCard} activeOpacity={0.7} onPress={onPress}>
      <View style={[styles.statIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text style={styles.statLabel}>{title}</Text>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.statSub}>{sub}</Text>
    </TouchableOpacity>
  );
}

function InfoRow({ icon, label, value, valueColor, isLast }) {
  return (
    <View style={[styles.infoRow, !isLast && styles.infoRowBorder]}>
      <View style={styles.infoLeft}>
        <Ionicons name={icon} size={16} color={COLORS.textMuted} />
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text style={[styles.infoValue, valueColor && { color: valueColor }]}>{value}</Text>
    </View>
  );
}

function QuickAction({ icon, label, color, bg, onPress }) {
  return (
    <TouchableOpacity style={styles.actionItem} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.actionIconCircle, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function SupportOption({ icon, label, sub, onPress }) {
  return (
    <TouchableOpacity style={styles.supportOption} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.supportIconWrap}>
        <Ionicons name={icon} size={18} color={COLORS.secondary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.supportLabel}>{label}</Text>
        <Text style={styles.supportSub} numberOfLines={1}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={COLORS.borderLight} />
    </TouchableOpacity>
  );
}

// ============ Styles ============
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: 30 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  loadingText: { marginTop: 12, fontSize: SIZES.body, color: COLORS.textSecondary },

  // ── Hero ──
  hero: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    overflow: 'hidden',
    position: 'relative',
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroGreeting: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 0.3,
  },
  heroName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 2,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  chipOnline: { backgroundColor: 'rgba(16,185,129,0.18)' },
  chipOffline: { backgroundColor: 'rgba(239,68,68,0.18)' },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  dotOnline: { backgroundColor: '#34D399' },
  dotOffline: { backgroundColor: '#F87171' },
  statusChipText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  heroBalance: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    padding: 16,
  },
  heroBalanceLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 2,
  },
  heroBalanceAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  heroPayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  heroPayText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  heroCircle1: {
    position: 'absolute',
    top: -50,
    right: -30,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  heroCircle2: {
    position: 'absolute',
    bottom: -40,
    left: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },

  // ── Service Picker ──
  servicePickerCard: {
    marginHorizontal: SIZES.md,
    marginTop: 8,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 12,
    ...SHADOWS.card,
  },
  servicePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  servicePickerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  servicePickerScroll: {
    gap: 8,
    paddingRight: 4,
  },
  serviceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
    minWidth: 160,
    maxWidth: 220,
  },
  serviceChipActive: {
    backgroundColor: COLORS.primaryBg,
    borderColor: COLORS.primary,
  },
  serviceChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  serviceChipName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  serviceChipNameActive: {
    color: COLORS.primary,
  },
  serviceChipPlan: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  serviceChipPlanActive: {
    color: COLORS.primaryDark,
  },

  // ── Stat Cards ──
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: SIZES.md,
    marginTop: -12,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    ...SHADOWS.card,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  statSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },

  // ── Loyalty Rewards Card ──
  rewardsCard: {
    marginHorizontal: SIZES.md,
    marginTop: SIZES.md,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
    ...SHADOWS.small,
  },
  rewardsInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  rewardsLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rewardsIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rewardsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  rewardsTokenBadge: {
    backgroundColor: '#F59E0B',
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  rewardsTokenBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  rewardsSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  rewardsArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },

  // ── Unpaid Alert ──
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SIZES.md,
    marginTop: SIZES.md,
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  alertIconWrap: { marginRight: 12 },
  alertBody: { flex: 1 },
  alertTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  alertSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  alertActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  alertActionText: { color: '#fff', fontWeight: '600', fontSize: 13 },

  // ── Account Card ──
  accountCard: {
    marginHorizontal: SIZES.md,
    marginTop: SIZES.lg,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    gap: 10,
  },
  accountIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: COLORS.primaryBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountHeaderText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  accountBody: { paddingHorizontal: 16 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
  },
  infoRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  infoLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoLabel: { fontSize: 13, color: COLORS.textSecondary },
  infoValue: { fontSize: 13, fontWeight: '600', color: COLORS.text },

  // ── Quick Actions ──
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginHorizontal: SIZES.md,
    marginTop: SIZES.lg,
    marginBottom: SIZES.sm,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: SIZES.md,
    gap: 0,
    justifyContent: 'flex-start',
  },
  actionItem: {
    alignItems: 'center',
    width: (SCREEN_W - SIZES.md * 2) / 3,
    paddingVertical: 8,
  },
  actionIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },

  // ── Recent Invoices ──
  invoicesSection: { marginTop: SIZES.lg },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: SIZES.md,
    marginBottom: SIZES.sm,
  },
  sectionTitleInline: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  viewAllLink: { fontSize: 13, fontWeight: '600', color: COLORS.secondary },
  invoicesCard: {
    marginHorizontal: SIZES.md,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  invoiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  invoiceRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  invoiceIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  invoiceContent: { flex: 1 },
  invoiceTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  invoiceDate: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  invoiceAmount: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  badgePaid: { backgroundColor: COLORS.accentBg },
  badgeUnpaid: { backgroundColor: '#FEF3C7' },
  statusText: { fontSize: 11, fontWeight: '600' },
  statusPaid: { color: COLORS.success },
  statusUnpaid: { color: COLORS.warning },

  // ── Explore & Discover ──
  exploreSection: {
    marginTop: SIZES.lg,
  },
  bannerScroll: {
    paddingLeft: SIZES.md,
    paddingRight: 4,
    paddingBottom: 4,
  },
  bannerCard: {
    width: SCREEN_W * 0.78,
    height: (SCREEN_W * 0.78) * 0.50,
    borderRadius: 14,
    overflow: 'hidden',
    marginRight: 12,
    backgroundColor: COLORS.surface,
    ...SHADOWS.card,
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },

  // ── Support ──
  supportCard: {
    marginHorizontal: SIZES.md,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  supportOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    gap: 12,
  },
  supportIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.secondaryBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  supportLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  supportSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },

  // ── Footer ──
  footer: {
    alignItems: 'center',
    marginTop: SIZES.xl,
    paddingBottom: SIZES.md,
    gap: 4,
  },
  footerText: { fontSize: 12, color: COLORS.textMuted },
  footerVersion: { fontSize: 11, color: COLORS.textMuted, opacity: 0.6 },
});
