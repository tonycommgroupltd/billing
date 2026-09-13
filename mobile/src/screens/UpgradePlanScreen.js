// ============================================
// HOMELINK Customer App — Plan Change Screen
// ============================================
// Upgrade or downgrade internet plan with M-Pesa
// Pro-rata billing, instant plan switching
// Premium UI with gradient hero + plan cards
// ============================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, Modal, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import { useAuth } from '../auth/AuthContext';
import api from '../api/client';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Speed sort helper ─────────────────────────────
function parseSpeed(speed) {
  const num = parseInt(speed);
  return isNaN(num) ? 0 : num;
}

export default function UpgradePlanScreen({ navigation, route }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentService, setCurrentService] = useState(null);
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [calculation, setCalculation] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [confirmModal, setConfirmModal] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [resultModal, setResultModal] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all', 'upgrade', 'downgrade'
  const [paymentPolling, setPaymentPolling] = useState(false);
  const [groupLabel, setGroupLabel] = useState('');
  const pollRef = useRef(null);
  const [allServices, setAllServices] = useState([]);
  const [selectedServiceIdx, setSelectedServiceIdx] = useState(0);

  // Load services list from dashboard
  useEffect(() => {
    (async () => {
      try {
        const dash = await api.getDashboard();
        const svcs = dash?.services || [];
        setAllServices(svcs);
        const navServiceId = route?.params?.serviceId;
        if (navServiceId && svcs.length > 0) {
          const idx = svcs.findIndex(s => String(s.id) === String(navServiceId));
          if (idx >= 0) setSelectedServiceIdx(idx);
        }
      } catch {}
    })();
  }, []);

  const selectedService = allServices.length > 0 ? allServices[selectedServiceIdx] || allServices[0] : null;
  const hasMultipleServices = allServices.length > 1;
  const serviceId = selectedService?.id || route?.params?.serviceId || null;

  // ─── Fetch available plans ──────────────────────
  const fetchPlans = useCallback(async () => {
    try {
      const data = await api.getAvailablePlans(serviceId);
      if (data?.error) {
        Alert.alert('Error', data.error);
        return;
      }
      setCurrentService(data.currentService);
      setPlans(data.plans || []);
      setGroupLabel(data.groupLabel || '');
    } catch (err) {
      console.warn('Fetch plans error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [serviceId]);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const onRefresh = () => { setRefreshing(true); fetchPlans(); };

  // ─── Select plan & calculate cost ───────────────
  const handleSelectPlan = async (plan) => {
    setSelectedPlan(plan);
    setCalculating(true);
    setCalculation(null);

    const calc = await api.calculatePlanChange(plan.id, currentService?.id);
    setCalculating(false);

    if (calc?.error) {
      Alert.alert('Error', calc.error);
      return;
    }
    setCalculation(calc);
    setConfirmModal(true);
  };

  // ─── Initiate plan change ──────────────────────
  const handleConfirmChange = async () => {
    setProcessing(true);
    const phone = user?.phone || '';  
    const res = await api.initiatePlanChange(
      selectedPlan.id,
      currentService?.id,
      phone
    );
    setProcessing(false);

    if (!res?.success) {
      Alert.alert('Failed', res?.error || 'Could not initiate plan change');
      return;
    }

    setConfirmModal(false);

    // If already completed (downgrade / zero cost)
    if (res.status === 'completed') {
      setResult({ ...res, type: 'success' });
      setResultModal(true);
      fetchPlans(); // Refresh
      return;
    }

    // For M-Pesa: poll for payment status
    if (res.checkoutRequestId) {
      setResult({ ...res, type: 'pending' });
      setResultModal(true);
      startPolling(res.checkoutRequestId, res.requestId);
    }
  };

  // ─── Poll M-Pesa payment status ───────────────
  const startPolling = (checkoutRequestId, requestId) => {
    setPaymentPolling(true);
    let attempts = 0;
    const maxAttempts = 30; // 60 seconds max

    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts >= maxAttempts) {
        clearInterval(pollRef.current);
        setPaymentPolling(false);
        setResult(prev => ({
          ...prev,
          type: 'timeout',
          message: 'Payment timed out. If you paid, your plan will be updated shortly.',
        }));
        return;
      }

      try {
        const status = await api.checkPaymentStatus(checkoutRequestId);
        
        if (status.status === 'completed') {
          clearInterval(pollRef.current);
          setPaymentPolling(false);
          setResult(prev => ({
            ...prev,
            type: 'success',
            message: 'Payment received! Your plan has been upgraded.',
          }));
          fetchPlans();
        } else if (status.status === 'cancelled' || status.status === 'failed') {
          clearInterval(pollRef.current);
          setPaymentPolling(false);
          setResult(prev => ({
            ...prev,
            type: 'failed',
            message: status.resultDesc || 'Payment was not completed.',
          }));
        }
        // If 'pending', keep polling
      } catch {
        // Ignore query errors, keep trying
      }
    }, 2000);
  };

  // ─── Filter plans (already sorted by speed from API) ──
  const currentPrice = currentService?.price || 0;
  const filteredPlans = plans
    .filter(p => {
      if (filter === 'upgrade') return p.price > currentPrice;
      if (filter === 'downgrade') return p.price < currentPrice;
      return true;
    });
  // Keep speed-sorted order from API (don't re-sort by price)

  const upgradeCount = plans.filter(p => p.price > currentPrice).length;
  const downgradeCount = plans.filter(p => p.price < currentPrice).length;

  // ─── Format helpers ───────────────────────────
  const fmt = (n) => `KES ${Number(n).toLocaleString()}`;
  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // ─── Loading state ────────────────────────────
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading plans...</Text>
      </View>
    );
  }

  // ─── RENDER ───────────────────────────────────
  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero Section ── */}
        <LinearGradient
          colors={['#F58220', '#1B4E79', '#0D47A1']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          {/* ─── Service Picker (inside hero) ─── */}
          {hasMultipleServices && (
            <View style={styles.servicePickerWrap}>
              <View style={styles.servicePickerHeader}>
                <Ionicons name="layers-outline" size={14} color="rgba(255,255,255,0.7)" />
                <Text style={styles.servicePickerLabel}>Select Service ({allServices.length})</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.servicePickerScroll}>
                {allServices.map((svc, idx) => {
                  const selected = idx === selectedServiceIdx;
                  const svcOnline = svc.connectionStatus === 'online';
                  return (
                    <TouchableOpacity
                      key={svc.id}
                      style={[styles.serviceChip, selected && styles.serviceChipActive]}
                      onPress={() => { setSelectedServiceIdx(idx); setLoading(true); }}
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

          <View style={styles.heroContent}>
            <View style={styles.heroIcon}>
              <Ionicons name="swap-vertical" size={28} color="#fff" />
            </View>
            <Text style={styles.heroTitle}>Change Plan</Text>
            <Text style={styles.heroSubtitle}>Upgrade or downgrade your internet plan</Text>
            {groupLabel ? (
              <View style={styles.groupBadge}>
                <Ionicons name="wifi" size={14} color="#fff" />
                <Text style={styles.groupBadgeText}>{groupLabel}</Text>
              </View>
            ) : null}
          </View>

          {/* Current Plan Card */}
          {currentService && (
            <View style={styles.currentPlanCard}>
              <View style={styles.currentLabel}>
                <Ionicons name="checkmark-circle" size={16} color={COLORS.accent} />
                <Text style={styles.currentLabelText}>Current Plan</Text>
              </View>
              <Text style={styles.currentPlanName}>
                {currentService.speed || currentService.planName}
              </Text>
              <View style={styles.currentDetails}>
                <View style={styles.currentDetail}>
                  <Text style={styles.detailLabel}>Monthly</Text>
                  <Text style={styles.detailValue}>{fmt(currentPrice)}</Text>
                </View>
                <View style={[styles.currentDetail, styles.detailBorder]}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <Text style={[styles.detailValue, { color: COLORS.accent }]}>{currentService.status}</Text>
                </View>
                <View style={styles.currentDetail}>
                  <Text style={styles.detailLabel}>Next Bill</Text>
                  <Text style={styles.detailValue}>{formatDate(currentService.billTo)}</Text>
                </View>
              </View>
            </View>
          )}
        </LinearGradient>

        {/* ── Double Speed Promotional Banner ── */}
        <View style={styles.promoWrap}>
          <LinearGradient
            colors={['#F59E0B', '#F97316']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.promoBanner}
          >
            <Ionicons name="flash" size={20} color="#fff" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.promoTitle}>🔥 Double Speed on ALL Plans!</Text>
              <Text style={styles.promoText}>Every plan includes 2× the listed speed as a special offer</Text>
            </View>
          </LinearGradient>
        </View>

        {/* ── Filter Tabs ── */}
        <View style={styles.filterRow}>
          {[
            { key: 'all', label: 'All Plans', count: plans.length },
            { key: 'upgrade', label: 'Upgrade', count: upgradeCount, icon: 'arrow-up' },
            { key: 'downgrade', label: 'Downgrade', count: downgradeCount, icon: 'arrow-down' },
          ].map(f => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterTab, filter === f.key && styles.filterTabActive]}
              onPress={() => setFilter(f.key)}
            >
              {f.icon && <Ionicons name={f.icon} size={14} color={filter === f.key ? '#fff' : COLORS.textSecondary} />}
              <Text style={[styles.filterTabText, filter === f.key && styles.filterTabTextActive]}>
                {f.label} ({f.count})
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Plan Cards ── */}
        <View style={styles.plansContainer}>
          {filteredPlans.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={48} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>No plans available</Text>
            </View>
          ) : (
            filteredPlans.map(plan => {
              const isUpgrade = plan.price > currentPrice;
              const diff = plan.price - currentPrice;
              const accentColor = isUpgrade ? COLORS.primary : COLORS.accent;
              const tag = isUpgrade ? 'UPGRADE' : 'DOWNGRADE';

              return (
                <TouchableOpacity
                  key={plan.id}
                  style={[styles.planCard, { borderLeftColor: accentColor }]}
                  onPress={() => handleSelectPlan(plan)}
                  activeOpacity={0.7}
                >
                  <View style={styles.planHeader}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.speedRow}>
                        <Ionicons name="speedometer" size={22} color={COLORS.primary} />
                        <Text style={styles.planSpeedBig}>{plan.title}</Text>
                      </View>
                      <View style={styles.doubleSpeedBadge}>
                        <Ionicons name="flash" size={11} color="#F59E0B" />
                        <Text style={styles.doubleSpeedText}>2× SPEED OFFER</Text>
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.planPrice}>{fmt(plan.price)}</Text>
                      <Text style={styles.planPeriod}>/month</Text>
                    </View>
                  </View>

                  <View style={styles.planFooter}>
                    <View style={[styles.tagBadge, { backgroundColor: isUpgrade ? COLORS.primaryBg : COLORS.accentBg }]}>
                      <Ionicons name={isUpgrade ? 'arrow-up' : 'arrow-down'} size={12} color={accentColor} />
                      <Text style={[styles.tagText, { color: accentColor }]}>{tag}</Text>
                    </View>
                    <Text style={[styles.diffText, { color: isUpgrade ? COLORS.danger : COLORS.accent }]}>
                      {isUpgrade ? '+' : ''}{fmt(diff)}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
                  </View>

                  {/* Weekly / Bi-weekly prices */}
                  {(plan.weeklyPrice || plan.biWeeklyPrice) && (
                    <View style={styles.altPrices}>
                      {plan.weeklyPrice && (
                        <Text style={styles.altPrice}>Weekly: {fmt(plan.weeklyPrice)}</Text>
                      )}
                      {plan.biWeeklyPrice && (
                        <Text style={styles.altPrice}>Bi-weekly: {fmt(plan.biWeeklyPrice)}</Text>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ═══════════════════════════════════════════
          CONFIRM MODAL
          ═══════════════════════════════════════════ */}
      <Modal visible={confirmModal} transparent animationType="slide" onRequestClose={() => !processing && setConfirmModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {calculating ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.modalLoadingText}>Calculating cost...</Text>
              </View>
            ) : calculation ? (
              <>
                <View style={[styles.modalHeader, { backgroundColor: calculation.changeType === 'upgrade' ? COLORS.primaryBg : COLORS.accentBg }]}>
                  <View style={[styles.modalIcon, { backgroundColor: calculation.changeType === 'upgrade' ? COLORS.primary : COLORS.accent }]}>
                    <Ionicons
                      name={calculation.changeType === 'upgrade' ? 'arrow-up' : 'arrow-down'}
                      size={24} color="#fff"
                    />
                  </View>
                  <Text style={styles.modalTitle}>
                    {calculation.changeType === 'upgrade' ? 'Plan Upgrade' : 'Plan Downgrade'}
                  </Text>
                </View>

                {/* Plan comparison */}
                <View style={styles.comparisonRow}>
                  <View style={styles.comparisonSide}>
                    <Text style={styles.compLabel}>Current</Text>
                    <Text style={styles.compPlan}>{calculation.currentPlan}</Text>
                    <Text style={styles.compPrice}>{fmt(calculation.currentPrice)}/mo</Text>
                  </View>
                  <View style={styles.compArrow}>
                    <Ionicons name="arrow-forward" size={20} color={COLORS.primary} />
                  </View>
                  <View style={styles.comparisonSide}>
                    <Text style={styles.compLabel}>New</Text>
                    <Text style={[styles.compPlan, { color: COLORS.primary }]}>{calculation.newPlan}</Text>
                    <Text style={[styles.compPrice, { color: COLORS.primary }]}>{fmt(calculation.newPrice)}/mo</Text>
                  </View>
                </View>

                {/* Cost breakdown */}
                <View style={styles.breakdownCard}>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Price difference</Text>
                    <Text style={styles.breakdownValue}>{fmt(calculation.priceDifference)}/mo</Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Days remaining</Text>
                    <Text style={styles.breakdownValue}>{calculation.daysRemaining} days</Text>
                  </View>
                  <View style={styles.breakdownDivider} />
                  {calculation.changeType === 'upgrade' ? (
                    <View style={styles.breakdownRow}>
                      <Text style={[styles.breakdownLabel, styles.breakdownTotal]}>Pro-rata charge</Text>
                      <Text style={[styles.breakdownValue, styles.breakdownTotalValue, { color: COLORS.primary }]}>
                        {fmt(calculation.amountToPay)}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.breakdownRow}>
                      <Text style={[styles.breakdownLabel, styles.breakdownTotal]}>Account credit</Text>
                      <Text style={[styles.breakdownValue, styles.breakdownTotalValue, { color: COLORS.accent }]}>
                        {fmt(calculation.creditAmount)}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Summary */}
                <Text style={styles.summaryText}>{calculation.summary}</Text>

                {/* Buttons */}
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => { setConfirmModal(false); setCalculation(null); }}
                    disabled={processing}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.confirmBtn, { backgroundColor: calculation.changeType === 'upgrade' ? COLORS.primary : COLORS.accent }]}
                    onPress={handleConfirmChange}
                    disabled={processing}
                  >
                    {processing ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Ionicons
                          name={calculation.changeType === 'upgrade' ? 'card-outline' : 'checkmark-circle'}
                          size={18} color="#fff"
                        />
                        <Text style={styles.confirmBtnText}>
                          {calculation.changeType === 'upgrade'
                            ? `Pay ${fmt(calculation.amountToPay)}`
                            : 'Confirm Downgrade'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════════
          RESULT MODAL
          ═══════════════════════════════════════════ */}
      <Modal visible={resultModal} transparent animationType="fade" onRequestClose={() => !paymentPolling && setResultModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.resultContent}>
            {result?.type === 'pending' ? (
              <>
                <View style={[styles.resultIcon, { backgroundColor: '#FEF3C7' }]}>
                  {paymentPolling ? (
                    <ActivityIndicator size={32} color={COLORS.warning} />
                  ) : (
                    <Ionicons name="time-outline" size={40} color={COLORS.warning} />
                  )}
                </View>
                <Text style={styles.resultTitle}>Waiting for Payment</Text>
                <Text style={styles.resultMessage}>
                  An M-Pesa prompt has been sent to your phone.{'\n'}
                  Enter your PIN to complete the payment.
                </Text>
                <Text style={styles.resultAmount}>{fmt(result.amountToPay || 0)}</Text>
              </>
            ) : result?.type === 'success' ? (
              <>
                <View style={[styles.resultIcon, { backgroundColor: COLORS.accentBg }]}>
                  <Ionicons name="checkmark-circle" size={48} color={COLORS.accent} />
                </View>
                <Text style={styles.resultTitle}>Plan Changed!</Text>
                <Text style={styles.resultMessage}>{result.message}</Text>
                {result.creditAmount > 0 && (
                  <Text style={styles.resultCredit}>KES {result.creditAmount} credited to your account</Text>
                )}
              </>
            ) : result?.type === 'failed' || result?.type === 'timeout' ? (
              <>
                <View style={[styles.resultIcon, { backgroundColor: '#FEE2E2' }]}>
                  <Ionicons name="close-circle" size={48} color={COLORS.danger} />
                </View>
                <Text style={styles.resultTitle}>
                  {result.type === 'timeout' ? 'Payment Timeout' : 'Payment Failed'}
                </Text>
                <Text style={styles.resultMessage}>{result.message}</Text>
              </>
            ) : null}

            {!paymentPolling && (
              <TouchableOpacity
                style={[styles.resultBtn, { marginTop: 24 }]}
                onPress={() => { setResultModal(false); setResult(null); }}
              >
                <Text style={styles.resultBtnText}>Done</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: 24 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  loadingText: { marginTop: 12, color: COLORS.textSecondary, fontSize: SIZES.body },

  // Hero
  hero: { paddingTop: 20, paddingBottom: 28, paddingHorizontal: SIZES.lg },
  heroContent: { alignItems: 'center', marginBottom: 20 },
  heroIcon: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  heroTitle: { fontSize: SIZES.heading, fontWeight: '700', color: '#fff' },
  heroSubtitle: { fontSize: SIZES.body, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  groupBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    marginTop: 10,
  },
  groupBadgeText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // Current Plan Card
  currentPlanCard: {
    backgroundColor: '#fff', borderRadius: SIZES.radiusLg,
    padding: SIZES.md, ...SHADOWS.medium,
  },
  currentLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  currentLabelText: { fontSize: SIZES.caption, fontWeight: '600', color: COLORS.accent, textTransform: 'uppercase', letterSpacing: 0.5 },
  currentPlanName: { fontSize: SIZES.subtitle, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  currentDetails: { flexDirection: 'row' },
  currentDetail: { flex: 1, alignItems: 'center' },
  detailBorder: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: COLORS.borderLight },
  detailLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '500', marginBottom: 2 },
  detailValue: { fontSize: SIZES.body, fontWeight: '700', color: COLORS.text },

  // Promo Banner
  promoWrap: { marginHorizontal: SIZES.md, marginTop: -12, marginBottom: 4, borderRadius: SIZES.radius, overflow: 'hidden', ...SHADOWS.medium },
  promoBanner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  promoTitle: { fontSize: 14, fontWeight: '800', color: '#fff' },
  promoText: { fontSize: 12, color: 'rgba(255,255,255,0.9)', marginTop: 1 },

  // Filters
  filterRow: {
    flexDirection: 'row', paddingHorizontal: SIZES.md, paddingTop: SIZES.md, gap: 8,
  },
  filterTab: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: SIZES.radiusFull,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  filterTabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterTabText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  filterTabTextActive: { color: '#fff' },

  // Plan Cards
  plansContainer: { paddingHorizontal: SIZES.md, paddingTop: SIZES.md },
  planCard: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radius,
    padding: SIZES.md, marginBottom: 12,
    borderLeftWidth: 4, ...SHADOWS.small,
  },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  planName: { fontSize: SIZES.bodyLg, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  speedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  planSpeedBig: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  doubleSpeedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
    backgroundColor: '#FEF3C7', alignSelf: 'flex-start', marginTop: 4,
  },
  doubleSpeedText: { fontSize: 10, fontWeight: '800', color: '#D97706', letterSpacing: 0.5 },
  planPrice: { fontSize: SIZES.subtitle, fontWeight: '800', color: COLORS.text },
  planPeriod: { fontSize: 11, color: COLORS.textMuted },
  planFooter: {
    flexDirection: 'row', alignItems: 'center', marginTop: 12,
    paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.borderLight,
  },
  tagBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  tagText: { fontSize: 11, fontWeight: '700' },
  diffText: { flex: 1, textAlign: 'right', fontSize: SIZES.body, fontWeight: '700', marginRight: 8 },
  altPrices: {
    flexDirection: 'row', gap: 16, marginTop: 8, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: COLORS.borderLight,
  },
  altPrice: { fontSize: 12, color: COLORS.textSecondary },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { fontSize: SIZES.body, color: COLORS.textMuted, marginTop: 12 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: 32, maxHeight: '85%',
  },
  modalLoading: { alignItems: 'center', padding: 48 },
  modalLoadingText: { marginTop: 12, color: COLORS.textSecondary },
  modalHeader: {
    padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    alignItems: 'center',
  },
  modalIcon: {
    width: 48, height: 48, borderRadius: 24,
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  modalTitle: { fontSize: SIZES.title, fontWeight: '700', color: COLORS.text },

  // Comparison
  comparisonRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  comparisonSide: { flex: 1, alignItems: 'center' },
  compArrow: { paddingHorizontal: 12 },
  compLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: 4 },
  compPlan: { fontSize: SIZES.body, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  compPrice: { fontSize: SIZES.bodyLg, fontWeight: '800', color: COLORS.text, marginTop: 2 },

  // Breakdown
  breakdownCard: {
    marginHorizontal: 20, padding: 16, borderRadius: SIZES.radius,
    backgroundColor: COLORS.background,
  },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  breakdownLabel: { fontSize: SIZES.body, color: COLORS.textSecondary },
  breakdownValue: { fontSize: SIZES.body, fontWeight: '600', color: COLORS.text },
  breakdownDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 8 },
  breakdownTotal: { fontWeight: '700', color: COLORS.text },
  breakdownTotalValue: { fontWeight: '800', fontSize: SIZES.bodyLg },

  // Summary
  summaryText: {
    marginHorizontal: 20, marginTop: 16, fontSize: SIZES.body,
    color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20,
  },

  // Buttons
  modalButtons: { flexDirection: 'row', paddingHorizontal: 20, paddingTop: 20, gap: 12 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: SIZES.radius,
    backgroundColor: COLORS.background, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  cancelBtnText: { fontSize: SIZES.bodyLg, fontWeight: '600', color: COLORS.textSecondary },
  confirmBtn: {
    flex: 2, paddingVertical: 14, borderRadius: SIZES.radius,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
  },
  confirmBtnText: { fontSize: SIZES.bodyLg, fontWeight: '700', color: '#fff' },

  // Result Modal
  resultContent: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 32, alignItems: 'center',
  },
  resultIcon: {
    width: 80, height: 80, borderRadius: 40,
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  resultTitle: { fontSize: SIZES.title, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  resultMessage: { fontSize: SIZES.body, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },
  resultAmount: { fontSize: SIZES.heading, fontWeight: '800', color: COLORS.primary, marginTop: 12 },
  resultCredit: {
    fontSize: SIZES.bodyLg, fontWeight: '700', color: COLORS.accent,
    marginTop: 8, paddingHorizontal: 16, paddingVertical: 6,
    backgroundColor: COLORS.accentBg, borderRadius: 12,
  },
  resultBtn: {
    paddingHorizontal: 48, paddingVertical: 14, borderRadius: SIZES.radius,
    backgroundColor: COLORS.primary,
  },
  resultBtnText: { fontSize: SIZES.bodyLg, fontWeight: '700', color: '#fff' },

  // ── Service Picker (inside hero) ──
  servicePickerWrap: {
    marginBottom: 12,
  },
  servicePickerHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 4, marginBottom: 8,
  },
  servicePickerLabel: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.5 },
  servicePickerScroll: { gap: 8 },
  serviceChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)', minWidth: 160,
  },
  serviceChipActive: { backgroundColor: 'rgba(255,255,255,0.25)', borderColor: 'rgba(255,255,255,0.5)' },
  serviceChipDot: { width: 8, height: 8, borderRadius: 4 },
  dotOnline: { backgroundColor: '#34D399' },
  dotOffline: { backgroundColor: '#F87171' },
  serviceChipName: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  serviceChipNameActive: { color: '#fff' },
  serviceChipPlan: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 1 },
  serviceChipPlanActive: { color: 'rgba(255,255,255,0.85)' },
});
