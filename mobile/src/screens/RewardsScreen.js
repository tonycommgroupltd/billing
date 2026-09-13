// ============================================
// HOMELINK Customer App — Rewards / Loyalty Screen
// ============================================
// Polished rewards UI with blue primary + gold accents
// Token balance, history, redeem flow
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Modal, Alert, TextInput,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import api from '../api/client';

const { width: SW } = Dimensions.get('window');
const AMBER    = '#F59E0B';
const AMBER_DK = '#D97706';
const AMBER_BG = '#FFFBEB';

export default function RewardsScreen({ navigation, route }) {
  const [balance, setBalance] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [redeemVisible, setRedeemVisible] = useState(false);
  const [redeemDays, setRedeemDays] = useState('1');
  const [redeeming, setRedeeming] = useState(false);
  const [resultModal, setResultModal] = useState(null);
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

  /* ── Data ── */
  const fetchData = useCallback(async () => {
    try {
      const [b, h] = await Promise.all([
        api.getLoyaltyBalance(serviceId),
        api.getLoyaltyHistory(serviceId),
      ]);
      if (b) setBalance(b);
      if (h?.history) setHistory(h.history);
    } catch (e) { console.warn('Rewards:', e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [serviceId]);

  useEffect(() => { fetchData(); checkForTokens(true); }, [fetchData]);
  const onRefresh = () => { setRefreshing(true); fetchData(); checkForTokens(true); };

  const checkForTokens = async (silent = false) => {
    if (!silent) setChecking(true);
    try {
      const r = await api.checkLoyaltyTokens();
      if (r?.awarded > 0) {
        const [b, h] = await Promise.all([api.getLoyaltyBalance(serviceId), api.getLoyaltyHistory(serviceId)]);
        if (b) setBalance(b);
        if (h?.history) setHistory(h.history);
        if (!silent) setResultModal({ type: 'earned', message: r.message || `Earned ${r.awarded} token(s)!` });
      } else if (!silent) {
        setResultModal({ type: 'info', message: 'All payments checked — keep paying on time to earn more!' });
      }
    } catch {}
    if (!silent) setChecking(false);
  };

  const handleRedeem = async () => {
    const d = parseInt(redeemDays, 10);
    const maxDays = Number.isFinite(balance?.maxRedeemDays)
      ? balance.maxRedeemDays
      : Math.min(balance?.balance || 0, balance?.maxRedeemPerRequest || 7);
    if (!d || d < 1) return Alert.alert('Invalid', 'Enter at least 1 day');
    if (d > (balance?.balance || 0)) return Alert.alert('Insufficient', `You have ${balance?.balance || 0} token(s).`);
    if (d > maxDays) {
      return Alert.alert(
        'Limit',
        maxDays < 1
          ? 'Billing is already as far ahead as loyalty allows. Pay normally or wait closer to expiry.'
          : `You can redeem at most ${maxDays} day(s) right now.`
      );
    }
    setRedeeming(true);
    try {
      const r = await api.redeemTokens(d, serviceId);
      setRedeemVisible(false);
      if (r?.success) {
        setResultModal({ type: 'redeemed', message: r.message });
        const [b, h] = await Promise.all([api.getLoyaltyBalance(serviceId), api.getLoyaltyHistory(serviceId)]);
        if (b) setBalance(b);
        if (h?.history) setHistory(h.history);
      } else {
        const detail = [r?.error, r?.message].filter(Boolean).join('\n');
        Alert.alert('Redemption Failed', detail || 'Could not redeem tokens. Please try again.');
      }
    } catch (e) {
      Alert.alert('Redemption Failed', e?.message || 'Something went wrong. Check your connection and try again.');
    }
    setRedeeming(false);
  };

  /* ── Helpers ── */
  const fmtDate = d => { if (!d) return '—'; return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
  const fmtShort = d => { if (!d) return '—'; return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
  const fmtTime = d => { if (!d) return ''; const dt = new Date(d); return fmtShort(d) + ' · ' + dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); };
  const addDays = (d, n) => { if (!d) return null; const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const todayLocal = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };

  if (loading) return (
    <View style={s.center}><ActivityIndicator size="large" color={COLORS.primary} /><Text style={s.loadTxt}>Loading rewards...</Text></View>
  );

  const tok = balance?.balance || 0;
  const isExpired = balance?.isExpired;
  const maxRedeemDays = Number.isFinite(balance?.maxRedeemDays)
    ? balance.maxRedeemDays
    : Math.min(tok, balance?.maxRedeemPerRequest || 7);
  const redeemPickDays = [1, 3, 5, maxRedeemDays > 0 ? maxRedeemDays : null]
    .filter((v) => v != null && v >= 1 && v <= maxRedeemDays)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 4);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ═══ HERO ═══ */}
        <LinearGradient colors={[COLORS.primaryDark || '#1B4E79', COLORS.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
          <View style={s.heroDecor1} />
          <View style={s.heroDecor2} />
          <View style={s.heroDecor3} />

          {/* ─── Service Picker (inside hero) ─── */}
          {hasMultipleServices && (
            <View style={s.servicePickerWrap}>
              <View style={s.servicePickerHeader}>
                <Ionicons name="layers-outline" size={14} color="rgba(255,255,255,0.7)" />
                <Text style={s.servicePickerLabel}>Select Service ({allServices.length})</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.servicePickerScroll}>
                {allServices.map((svc, idx) => {
                  const selected = idx === selectedServiceIdx;
                  const svcOnline = svc.connectionStatus === 'online';
                  return (
                    <TouchableOpacity
                      key={svc.id}
                      style={[s.serviceChip, selected && s.serviceChipActive]}
                      onPress={() => { setSelectedServiceIdx(idx); setLoading(true); }}
                      activeOpacity={0.7}
                    >
                      <View style={[s.serviceChipDot, svcOnline ? s.dotOnline : s.dotOffline]} />
                      <View style={{ flexShrink: 1 }}>
                        <Text style={[s.serviceChipName, selected && s.serviceChipNameActive]} numberOfLines={1}>
                          {svc.mikrotikName}
                        </Text>
                        <Text style={[s.serviceChipPlan, selected && s.serviceChipPlanActive]} numberOfLines={1}>
                          {svc.planName} · KSh {svc.price?.toLocaleString()}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          <View style={s.heroInner}>
            {/* Trophy icon */}
            <View style={s.trophyWrap}>
              <LinearGradient colors={['#FBBF24', '#F59E0B']} style={s.trophyCircle}>
                <Ionicons name="trophy" size={26} color="#fff" />
              </LinearGradient>
            </View>

            <Text style={s.heroLabel}>YOUR TOKENS</Text>
            <View style={s.heroNumRow}>
              <Text style={s.heroNum}>{tok}</Text>
              <Text style={s.heroUnit}>{tok === 1 ? 'day' : 'days'}</Text>
            </View>
            <Text style={s.heroSub}>
              {tok > 0 ? `Redeem for ${tok} free day${tok !== 1 ? 's' : ''} of internet` : 'Pay your bill in full to start earning'}
            </Text>

            {/* Mini stats inside hero */}
            <View style={s.heroStats}>
              <View style={s.heroStat}>
                <Text style={s.heroStatNum}>{balance?.totalEarned || 0}</Text>
                <Text style={s.heroStatLabel}>Earned</Text>
              </View>
              <View style={s.heroStatDiv} />
              <View style={s.heroStat}>
                <Text style={s.heroStatNum}>{balance?.totalRedeemed || 0}</Text>
                <Text style={s.heroStatLabel}>Redeemed</Text>
              </View>
              <View style={s.heroStatDiv} />
              <View style={s.heroStat}>
                <Text style={[s.heroStatNum, { color: '#FCD34D' }]}>{tok}</Text>
                <Text style={s.heroStatLabel}>Available</Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        {/* ═══ ACTION BUTTONS ═══ */}
        <View style={s.actions}>
          <TouchableOpacity
            style={s.primaryBtn}
            activeOpacity={0.85}
            onPress={() => {
              if (tok === 0) return Alert.alert('No Tokens', 'You don\'t have any tokens yet. Pay your bills in full to earn tokens!');
              if (maxRedeemDays < 1) {
                return Alert.alert(
                  'Limit reached',
                  `Loyalty can only keep billing up to ${balance?.maxBillAheadDays || 30} days ahead. Pay normally or wait closer to expiry.`
                );
              }
              setRedeemDays('1'); setRedeemVisible(true);
            }}
          >
            <LinearGradient colors={['#F59E0B', '#D97706']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.primaryBtnGrad}>
              <Ionicons name="gift-outline" size={18} color="#fff" />
              <Text style={s.primaryBtnTxt}>{isExpired ? 'Reactivate Account' : 'Redeem Days'}</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={s.secondaryBtn} activeOpacity={0.8} onPress={() => checkForTokens(false)} disabled={checking}>
            {checking
              ? <ActivityIndicator size="small" color={COLORS.primary} />
              : <Ionicons name="sync-outline" size={18} color={COLORS.primary} />}
            <Text style={s.secondaryBtnTxt}>{checking ? 'Checking...' : 'Sync'}</Text>
          </TouchableOpacity>
        </View>

        {/* ═══ PLAN & BILLING ═══ */}
        {balance?.currentBillTo && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <View style={[s.cardIco, { backgroundColor: COLORS.primaryBg || '#FFF4EB' }]}>
                <Ionicons name="calendar-outline" size={16} color={COLORS.primary} />
              </View>
              <Text style={s.cardHeaderTxt}>Your Plan</Text>
            </View>
            <View style={s.planRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.planName}>{balance.planName || '—'}</Text>
                <Text style={s.planPrice}>KES {balance.planPrice?.toLocaleString() || '—'}/mo</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.billLabel}>Next billing</Text>
                <Text style={s.billDate}>{fmtShort(balance.currentBillTo)}</Text>
              </View>
            </View>
            {tok > 0 && (
              <View style={s.planHint}>
                <Ionicons name="sparkles" size={14} color={AMBER_DK} />
                <Text style={s.planHintTxt}>
                  {isExpired
                    ? `Account expired — redeem up to ${maxRedeemDays || 0} day${maxRedeemDays === 1 ? '' : 's'} to reactivate from today`
                    : <>Redeem up to {maxRedeemDays} day{maxRedeemDays === 1 ? '' : 's'} → billing moves to <Text style={{ fontWeight: '700' }}>{fmtShort(addDays(balance.currentBillTo, maxRedeemDays))}</Text></>}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ═══ HOW IT WORKS ═══ */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <View style={[s.cardIco, { backgroundColor: AMBER_BG }]}>
              <Ionicons name="bulb-outline" size={16} color={AMBER_DK} />
            </View>
            <Text style={s.cardHeaderTxt}>How It Works</Text>
          </View>
          <Step num="1" icon="card-outline" color={COLORS.primary} bg={COLORS.primaryBg || '#FFF4EB'} text="Pay your monthly bill in full" />
          <Step num="2" icon="trophy-outline" color={AMBER_DK} bg={AMBER_BG} text="Earn 1 day token per full payment" />
          <Step num="3" icon="calendar-outline" color={COLORS.success || '#10B981'} bg="#ECFDF5" text="Active: extend billing. Expired: redeem N days to reactivate from today" />
          <View style={s.badge}>
            <Ionicons name="shield-checkmark-outline" size={13} color={COLORS.success || '#10B981'} />
            <Text style={s.badgeTxt}>Tokens never expire  •  Max {balance?.maxRedeemPerRequest || 7} days per redeem  •  Cap {balance?.maxBillAheadDays || 30} days ahead</Text>
          </View>
        </View>

        {/* ═══ ACTIVITY ═══ */}
        <View style={{ marginTop: 8 }}>
          <View style={s.secRow}>
            <Text style={s.secTitle}>Activity</Text>
            {history.length > 0 && <Text style={s.secCount}>{history.length} entries</Text>}
          </View>

          {history.length === 0 ? (
            <View style={s.emptyCard}>
              <View style={s.emptyIco}><Ionicons name="hourglass-outline" size={28} color={COLORS.textMuted} /></View>
              <Text style={s.emptyTitle}>No activity yet</Text>
              <Text style={s.emptySub}>Your token history will appear here once you start earning</Text>
            </View>
          ) : (
            <View style={s.histCard}>
              {history.map((item, i) => {
                const isEarn = item.type === 'earned';
                return (
                  <View key={i} style={[s.histRow, i < history.length - 1 && s.histRowBorder]}>
                    <View style={[s.histIco, { backgroundColor: isEarn ? '#ECFDF5' : '#EDE9FE' }]}>
                      <Ionicons
                        name={isEarn ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
                        size={20}
                        color={isEarn ? (COLORS.success || '#10B981') : '#8B5CF6'}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.histTitle}>
                        {isEarn ? 'Token Earned' : 'Days Redeemed'}
                      </Text>
                      <Text style={s.histDesc} numberOfLines={2}>{item.description}</Text>
                      <Text style={s.histDate}>{fmtTime(item.created_at || item.date)}</Text>
                    </View>
                    <View style={[s.histBadge, { backgroundColor: isEarn ? '#ECFDF5' : '#EDE9FE' }]}>
                      <Text style={[s.histBadgeTxt, { color: isEarn ? (COLORS.success || '#10B981') : '#8B5CF6' }]}>
                        {isEarn ? '+' : '−'}{item.amount}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* ═══ REDEEM SHEET ═══ */}
      <Modal visible={redeemVisible} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.handle} />

            {/* Header */}
            <View style={{ alignItems: 'center', marginBottom: 24 }}>
              <LinearGradient colors={['#FBBF24', '#F59E0B']} style={s.sheetIco}>
                <Ionicons name="gift-outline" size={24} color="#fff" />
              </LinearGradient>
              <Text style={s.sheetTitle}>{isExpired ? 'Reactivate Account' : 'Redeem Tokens'}</Text>
              <Text style={s.sheetSub}>
                {isExpired
                  ? 'Redeem tokens to turn service back on from today'
                  : 'Push your billing date forward'}
              </Text>
            </View>

            {/* Input */}
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <Text style={s.inputLabel}>{isExpired ? 'Days to reactivate' : 'Number of days'}</Text>
              <View style={s.inputRow}>
                <TouchableOpacity style={s.stepBtn} onPress={() => setRedeemDays(String(Math.max(1, (parseInt(redeemDays) || 1) - 1)))}>
                  <Ionicons name="remove" size={20} color={COLORS.primary} />
                </TouchableOpacity>
                <TextInput style={s.dayInput} value={redeemDays} onChangeText={setRedeemDays} keyboardType="number-pad" maxLength={3} />
                <TouchableOpacity style={s.stepBtn} onPress={() => setRedeemDays(String(Math.min(maxRedeemDays, (parseInt(redeemDays) || 0) + 1)))}>
                  <Ionicons name="add" size={20} color={COLORS.primary} />
                </TouchableOpacity>
              </View>
              <Text style={s.avail}>
                {tok} token{tok !== 1 ? 's' : ''} available
                {maxRedeemDays < tok ? ` · max ${maxRedeemDays} now` : ''}
              </Text>

              {/* Quick picks */}
              <View style={s.picks}>
                {redeemPickDays.map(v => (
                  <TouchableOpacity key={v} style={[s.pick, parseInt(redeemDays) === v && s.pickActive]} onPress={() => setRedeemDays(String(v))}>
                    <Text style={[s.pickTxt, parseInt(redeemDays) === v && s.pickTxtActive]}>
                      {v === maxRedeemDays && v !== 1 && v !== 3 && v !== 5 ? 'Max' : `${v}d`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Preview */}
            {(isExpired || balance?.currentBillTo) && (
              <View style={s.preview}>
                <View style={s.preRow}>
                  <Text style={s.preLbl}>{isExpired ? 'Status' : 'Current'}</Text>
                  <Text style={s.preVal}>{isExpired ? 'Expired' : fmtDate(balance.currentBillTo)}</Text>
                </View>
                <View style={{ alignItems: 'center', paddingVertical: 4 }}>
                  <Ionicons name="arrow-down" size={14} color={AMBER} />
                </View>
                <View style={s.preRow}>
                  <Text style={s.preLbl}>{isExpired ? 'Active until' : 'New date'}</Text>
                  <Text style={[s.preVal, { color: COLORS.success || '#10B981', fontWeight: '700' }]}>
                    {fmtDate(isExpired
                      ? addDays(todayLocal(), parseInt(redeemDays) || 0)
                      : addDays(balance.currentBillTo, parseInt(redeemDays) || 0))}
                  </Text>
                </View>
              </View>
            )}

            {/* Buttons */}
            <View style={s.sheetBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setRedeemVisible(false)}>
                <Text style={s.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.confirmBtn} onPress={handleRedeem} disabled={redeeming || maxRedeemDays < 1} activeOpacity={0.85}>
                <LinearGradient colors={['#F59E0B', '#D97706']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.confirmGrad}>
                  {redeeming
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <><Ionicons name="checkmark-circle" size={18} color="#fff" /><Text style={s.confirmTxt}>{isExpired ? `Reactivate ${redeemDays} Day${parseInt(redeemDays) !== 1 ? 's' : ''}` : `Redeem ${redeemDays} Day${parseInt(redeemDays) !== 1 ? 's' : ''}`}</Text></>}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═══ RESULT MODAL ═══ */}
      <Modal visible={!!resultModal} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={[s.sheet, { paddingBottom: 24 }]}>
            <View style={{ alignItems: 'center', paddingTop: 28, paddingBottom: 20 }}>
              <View style={[
                s.resultIcoWrap,
                resultModal?.type === 'redeemed' ? { backgroundColor: '#EDE9FE' } :
                resultModal?.type === 'earned'   ? { backgroundColor: AMBER_BG } :
                { backgroundColor: COLORS.primaryBg || '#FFF4EB' },
              ]}>
                <Ionicons
                  name={resultModal?.type === 'redeemed' ? 'checkmark-done-circle' : resultModal?.type === 'earned' ? 'trophy' : 'checkmark-circle'}
                  size={36}
                  color={resultModal?.type === 'redeemed' ? '#8B5CF6' : resultModal?.type === 'earned' ? AMBER : COLORS.primary}
                />
              </View>
              <Text style={s.resultTitle}>
                {resultModal?.type === 'redeemed' ? 'Days Added!' : resultModal?.type === 'earned' ? 'Tokens Earned!' : 'All Up to Date'}
              </Text>
              <Text style={s.resultMsg}>{resultModal?.message}</Text>
            </View>
            <TouchableOpacity style={s.doneBtn} onPress={() => setResultModal(null)} activeOpacity={0.85}>
              <Text style={s.doneTxt}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ── Step Row ── */
function Step({ num, icon, color, bg, text }) {
  return (
    <View style={s.step}>
      <View style={[s.stepIco, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={s.stepTxt}>{text}</Text>
    </View>
  );
}

/* ═══════════ STYLES ═══════════ */
const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  loadTxt: { marginTop: 12, fontSize: 14, color: COLORS.textSecondary },

  /* Hero */
  hero: { paddingTop: 16, paddingBottom: 28, paddingHorizontal: 20, overflow: 'hidden', position: 'relative' },
  heroDecor1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.05)', top: -60, right: -40 },
  heroDecor2: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.04)', bottom: -20, left: -30 },
  heroDecor3: { position: 'absolute', width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.06)', top: 20, left: 30 },
  heroInner: { alignItems: 'center', zIndex: 1 },

  trophyWrap: { marginBottom: 16 },
  trophyCircle: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#F59E0B', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },

  heroLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 2, marginBottom: 4 },
  heroNumRow: { flexDirection: 'row', alignItems: 'baseline' },
  heroNum: { fontSize: 56, fontWeight: '800', color: '#fff', lineHeight: 62 },
  heroUnit: { fontSize: 18, fontWeight: '600', color: 'rgba(255,255,255,0.7)', marginLeft: 8 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 6, textAlign: 'center' },

  heroStats: { flexDirection: 'row', marginTop: 20, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 8, width: '100%' },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatNum: { fontSize: 18, fontWeight: '700', color: '#fff' },
  heroStatLabel: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.55)', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  heroStatDiv: { width: 1, backgroundColor: 'rgba(255,255,255,0.15)' },

  /* Action Buttons */
  actions: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginTop: -14 },
  primaryBtn: { flex: 3, borderRadius: 12, overflow: 'hidden', ...SHADOWS.medium },
  primaryBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 8 },
  primaryBtnTxt: { fontSize: 14, fontWeight: '700', color: '#fff' },
  secondaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 14, borderRadius: 12, backgroundColor: '#fff', ...SHADOWS.small },
  secondaryBtnTxt: { fontSize: 12, fontWeight: '600', color: COLORS.primary },

  /* Cards */
  card: { backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16, borderRadius: 14, padding: 16, ...SHADOWS.small },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  cardIco: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  cardHeaderTxt: { fontSize: 15, fontWeight: '700', color: COLORS.text },

  /* Plan card */
  planRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  planPrice: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  billLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '500' },
  billDate: { fontSize: 16, fontWeight: '700', color: COLORS.primary, marginTop: 2 },
  planHint: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: COLORS.borderLight,
  },
  planHintTxt: { fontSize: 12, color: AMBER_DK, flex: 1 },

  /* Steps */
  step: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  stepIco: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  stepTxt: { flex: 1, fontSize: 14, fontWeight: '500', color: COLORS.text },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: COLORS.borderLight,
  },
  badgeTxt: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '500' },

  /* Section */
  secRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 16, marginTop: 24, marginBottom: 10 },
  secTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  secCount: { fontSize: 12, color: COLORS.textMuted, fontWeight: '500' },

  /* Empty */
  emptyCard: { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 14, padding: 36, alignItems: 'center', ...SHADOWS.small },
  emptyIco: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.borderLight, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.textSecondary },
  emptySub: { fontSize: 13, color: COLORS.textMuted, marginTop: 4, textAlign: 'center', lineHeight: 18 },

  /* History */
  histCard: { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 14, ...SHADOWS.small, overflow: 'hidden' },
  histRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  histRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  histIco: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  histTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  histDesc: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  histDate: { fontSize: 11, color: COLORS.textMuted, marginTop: 3 },
  histBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  histBadgeTxt: { fontSize: 14, fontWeight: '700' },

  /* Modals */
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 34 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.borderLight, alignSelf: 'center', marginBottom: 16 },

  sheetIco: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center', marginBottom: 12, elevation: 2, shadowColor: '#F59E0B', shadowOpacity: 0.3, shadowRadius: 6 },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  sheetSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },

  inputLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted, marginBottom: 10, letterSpacing: 0.5, textTransform: 'uppercase' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.primaryBg || '#FFF4EB', justifyContent: 'center', alignItems: 'center' },
  dayInput: { width: 80, height: 56, borderWidth: 2, borderColor: COLORS.primary, borderRadius: 14, textAlign: 'center', fontSize: 28, fontWeight: '700', color: COLORS.text },
  avail: { fontSize: 12, color: COLORS.textMuted, marginTop: 8 },

  picks: { flexDirection: 'row', gap: 8, marginTop: 14 },
  pick: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.borderLight },
  pickActive: { backgroundColor: COLORS.primaryBg || '#FFF4EB', borderWidth: 1.5, borderColor: COLORS.primary },
  pickTxt: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  pickTxtActive: { color: COLORS.primary },

  preview: { backgroundColor: COLORS.background, borderRadius: 14, padding: 14, marginBottom: 20 },
  preRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  preLbl: { fontSize: 13, color: COLORS.textSecondary },
  preVal: { fontSize: 15, fontWeight: '600', color: COLORS.text },

  sheetBtns: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center' },
  cancelTxt: { fontSize: 15, fontWeight: '600', color: COLORS.textSecondary },
  confirmBtn: { flex: 2, borderRadius: 12, overflow: 'hidden' },
  confirmGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 8 },
  confirmTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },

  /* Result */
  resultIcoWrap: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  resultTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  resultMsg: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: 10 },
  doneBtn: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  doneTxt: { fontSize: 15, fontWeight: '700', color: '#fff' },

  /* Service Picker (inside hero) */
  servicePickerWrap: {
    marginBottom: 12,
    zIndex: 1,
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
