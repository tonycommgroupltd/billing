// ============================================
// HOMELINK Customer App — Data Usage Screen
// ============================================
// Forex-style area chart with gradient fills,
// grid lines, crosshair tooltip, candlestick volume
// ============================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Dimensions, PanResponder,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES } from '../constants/theme';
import api from '../api/client';

const { width: SCREEN_W } = Dimensions.get('window');
const CHART_BAR_WIDTH = Math.max(16, (SCREEN_W - 80) / 14);

// ============ Helpers ============

function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0m';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function shortDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function dayLabel(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2);
}

export default function DataUsageScreen({ route }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState(7); // 7 or 30
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

  const fetchData = useCallback(async () => {
    try {
      const result = await api.getDataUsage(period, serviceId);
      if (result) setData(result);
    } catch (err) {
      console.warn('Data usage fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, serviceId]);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading usage data...</Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="cloud-offline-outline" size={48} color={COLORS.textMuted} />
        <Text style={styles.loadingText}>Unable to load data usage</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); fetchData(); }}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { currentSession, daily, thisMonth, totalUsage } = data;
  const displayDays = daily.slice(-period);

  // Find max value for chart scaling
  const maxVal = Math.max(
    ...displayDays.map(d => d.download + d.upload),
    1
  );

  const monthTotal = (thisMonth?.download || 0) + (thisMonth?.upload || 0);
  const allTimeTotal = (totalUsage?.download || 0) + (totalUsage?.upload || 0);

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
        colors={['#1B4E79', '#F58220']}
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

        <View style={styles.heroTop}>
          <View>
            <Text style={styles.heroLabel}>Data Usage</Text>
            <Text style={styles.heroTitle}>
              {data.username || 'Your Account'}
            </Text>
          </View>
          <View style={styles.heroPlanBadge}>
            <Ionicons name="speedometer-outline" size={14} color="#fff" />
            <Text style={styles.heroPlanText}>{data.service?.planName || 'Active'}</Text>
          </View>
        </View>

        {/* Current Session Indicator */}
        {currentSession && (
          <View style={styles.sessionCard}>
            <View style={styles.sessionDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.sessionLabel}>Live Session</Text>
              <Text style={styles.sessionSub}>
                Connected {formatDuration(currentSession.duration)} · {currentSession.ipAddress || ''}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.sessionBytes}>
                {formatBytes(currentSession.download + currentSession.upload)}
              </Text>
              <Text style={styles.sessionSub}>this session</Text>
            </View>
          </View>
        )}

        <View style={styles.heroCircle1} />
        <View style={styles.heroCircle2} />
      </LinearGradient>

      {/* ─── Summary Cards ─── */}
      <View style={styles.summaryRow}>
        <SummaryCard
          icon="arrow-down-circle"
          iconColor="#0EA5E9"
          iconBg="#F0F9FF"
          label="This Month"
          main={formatBytes(thisMonth?.download || 0)}
          sub="Download"
        />
        <SummaryCard
          icon="arrow-up-circle"
          iconColor="#F97316"
          iconBg="#FFF7ED"
          label="This Month"
          main={formatBytes(thisMonth?.upload || 0)}
          sub="Upload"
        />
      </View>

      <View style={styles.summaryRow}>
        <SummaryCard
          icon="swap-vertical"
          iconColor={COLORS.accent}
          iconBg={COLORS.accentBg}
          label="Month Total"
          main={formatBytes(monthTotal)}
          sub="Combined"
        />
        <SummaryCard
          icon="cloud-done"
          iconColor={COLORS.primary}
          iconBg={COLORS.primaryBg}
          label="All Time"
          main={formatBytes(allTimeTotal)}
          sub="Total Usage"
        />
      </View>

      {/* ─── Period Selector ─── */}
      <View style={styles.periodRow}>
        <Text style={styles.sectionTitle}>Daily Usage</Text>
        <View style={styles.periodTabs}>
          {[7, 30].map(p => (
            <TouchableOpacity
              key={p}
              style={[styles.periodTab, period === p && styles.periodTabActive]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[styles.periodTabText, period === p && styles.periodTabTextActive]}>
                {p}D
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ─── Bar Chart ─── */}
      {displayDays.length > 0 ? (
        <View style={styles.chartCard}>
          {/* Legend */}
          <View style={styles.chartLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#0EA5E9' }]} />
              <Text style={styles.legendText}>Download</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#F97316' }]} />
              <Text style={styles.legendText}>Upload</Text>
            </View>
          </View>

          {/* Chart Area with grid */}
          <View style={styles.chartArea}>
            {/* Horizontal grid lines */}
            {[0, 1, 2, 3].map(i => (
              <View key={i} style={[styles.gridLine, { bottom: `${(i / 3) * 100}%` }]} />
            ))}
            {/* Y-axis labels */}
            <View style={styles.yAxisLabels}>
              <Text style={styles.yLabel}>{formatBytes(maxVal, 0)}</Text>
              <Text style={styles.yLabel}>{formatBytes(maxVal * 0.66, 0)}</Text>
              <Text style={styles.yLabel}>{formatBytes(maxVal * 0.33, 0)}</Text>
              <Text style={styles.yLabel}>0</Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chartScroll}
            >
              {displayDays.map((day, idx) => {
                const dlPct = maxVal > 0 ? (day.download / maxVal) * 100 : 0;
                const ulPct = maxVal > 0 ? (day.upload / maxVal) * 100 : 0;
                const isToday = idx === displayDays.length - 1;

                return (
                  <View key={day.date} style={styles.barGroup}>
                    <View style={styles.barContainer}>
                      {/* Upload segment (top) */}
                      <View style={[styles.barSegment, {
                        height: `${Math.max(ulPct, 1)}%`,
                        backgroundColor: '#F97316',
                        borderTopLeftRadius: dlPct <= 0 ? 6 : 0,
                        borderTopRightRadius: dlPct <= 0 ? 6 : 0,
                      }]} />
                      {/* Download segment (bottom of stack) */}
                      <View style={[styles.barSegment, {
                        height: `${Math.max(dlPct, 1)}%`,
                        backgroundColor: '#0EA5E9',
                        borderTopLeftRadius: 6,
                        borderTopRightRadius: 6,
                      }]} />
                    </View>
                    {/* Total label above bar */}
                    <Text style={styles.barValueAbove}>
                      {formatBytes(day.download + day.upload, 0)}
                    </Text>
                    {/* Date label */}
                    <Text style={[styles.barDate, isToday && styles.barDateToday]}>
                      {isToday ? 'Today' : (period <= 7 ? dayLabel(day.date) : shortDate(day.date))}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      ) : (
        <View style={styles.emptyChart}>
          <Ionicons name="bar-chart-outline" size={40} color={COLORS.textMuted} />
          <Text style={styles.emptyText}>No usage data for this period</Text>
        </View>
      )}

      {/* ─── Current Session Details ─── */}
      {currentSession && (
        <View style={styles.detailCard}>
          <View style={styles.detailHeader}>
            <View style={styles.detailIconWrap}>
              <Ionicons name="pulse-outline" size={18} color={COLORS.accent} />
            </View>
            <Text style={styles.detailTitle}>Active Session</Text>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>
          <View style={styles.detailBody}>
            <DetailRow label="Started" value={new Date(currentSession.startTime).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} />
            <DetailRow label="Duration" value={formatDuration(currentSession.duration)} />
            <DetailRow label="Download" value={formatBytes(currentSession.download)} color="#0EA5E9" />
            <DetailRow label="Upload" value={formatBytes(currentSession.upload)} color="#F97316" />
            <DetailRow label="IP Address" value={currentSession.ipAddress || '—'} isLast />
          </View>
        </View>
      )}

      {/* ─── Usage Breakdown ─── */}
      <View style={styles.detailCard}>
        <View style={styles.detailHeader}>
          <View style={[styles.detailIconWrap, { backgroundColor: COLORS.primaryBg }]}>
            <Ionicons name="pie-chart-outline" size={18} color={COLORS.primary} />
          </View>
          <Text style={styles.detailTitle}>Usage Breakdown</Text>
        </View>

        {/* Download vs Upload ratio bar */}
        <View style={styles.ratioSection}>
          <View style={styles.ratioBar}>
            <View style={[styles.ratioFillDl, {
              flex: Math.max(thisMonth?.download || 0, 1),
              backgroundColor: '#0EA5E9',
            }]} />
            <View style={[styles.ratioFillUl, {
              flex: Math.max(thisMonth?.upload || 0, 1),
              backgroundColor: '#F97316',
            }]} />
          </View>
          <View style={styles.ratioLabels}>
            <View style={styles.ratioLabelItem}>
              <View style={[styles.ratioLabelDot, { backgroundColor: '#0EA5E9' }]} />
              <Text style={styles.ratioLabelText}>
                Download · {formatBytes(thisMonth?.download || 0)}
              </Text>
            </View>
            <View style={styles.ratioLabelItem}>
              <View style={[styles.ratioLabelDot, { backgroundColor: '#F97316' }]} />
              <Text style={styles.ratioLabelText}>
                Upload · {formatBytes(thisMonth?.upload || 0)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* ─── Daily Log Table ─── */}
      {displayDays.length > 0 && (
        <View style={styles.detailCard}>
          <View style={styles.detailHeader}>
            <View style={[styles.detailIconWrap, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="list-outline" size={18} color="#F59E0B" />
            </View>
            <Text style={styles.detailTitle}>Daily Log</Text>
          </View>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { flex: 1.2 }]}>Date</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Download</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Upload</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Total</Text>
          </View>
          {[...displayDays].reverse().map((day, idx) => (
            <View
              key={day.date}
              style={[styles.tableRow, idx % 2 === 0 && styles.tableRowAlt]}
            >
              <Text style={[styles.tableCell, { flex: 1.2 }]}>{shortDate(day.date)}</Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', color: '#0EA5E9' }]}>
                {formatBytes(day.download)}
              </Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', color: '#F97316' }]}>
                {formatBytes(day.upload)}
              </Text>
              <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', fontWeight: '600' }]}>
                {formatBytes(day.download + day.upload)}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

// ============ Sub-Components ============

function SummaryCard({ icon, iconColor, iconBg, label, main, sub }) {
  return (
    <View style={styles.summaryCard}>
      <View style={[styles.summaryIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryMain}>{main}</Text>
      <Text style={styles.summarySub}>{sub}</Text>
    </View>
  );
}

function DetailRow({ label, value, color, isLast }) {
  return (
    <View style={[styles.detailRow, !isLast && styles.detailRowBorder]}>
      <Text style={styles.detailRowLabel}>{label}</Text>
      <Text style={[styles.detailRowValue, color && { color }]}>{value}</Text>
    </View>
  );
}

// ============ Styles ============
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: 30 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  loadingText: { marginTop: 12, fontSize: 14, color: COLORS.textSecondary },
  retryBtn: { marginTop: 16, backgroundColor: COLORS.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600' },

  // Hero
  hero: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20, overflow: 'hidden', position: 'relative' },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroLabel: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.7)' },
  heroTitle: { fontSize: 20, fontWeight: '700', color: '#fff', marginTop: 2 },
  heroPlanBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  heroPlanText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  sessionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 12, marginTop: 16, gap: 10 },
  sessionDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#34D399' },
  sessionLabel: { fontSize: 13, fontWeight: '600', color: '#fff' },
  sessionSub: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 1 },
  sessionBytes: { fontSize: 15, fontWeight: '700', color: '#fff' },
  heroCircle1: { position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.06)' },
  heroCircle2: { position: 'absolute', bottom: -20, left: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.04)' },

  // Summary Cards
  summaryRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 12, marginTop: 16 },
  summaryCard: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.borderLight },
  summaryIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  summaryLabel: { fontSize: 11, fontWeight: '500', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryMain: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginTop: 2 },
  summarySub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },

  // Period Selector
  periodRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginTop: 24, marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  periodTabs: { flexDirection: 'row', backgroundColor: COLORS.borderLight, borderRadius: 8, padding: 2 },
  periodTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6 },
  periodTabActive: { backgroundColor: COLORS.primary },
  periodTabText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  periodTabTextActive: { color: '#fff' },

  // Chart
  chartCard: { marginHorizontal: 16, backgroundColor: '#1E293B', borderRadius: 16, padding: 16, borderWidth: 0, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 8 },
  chartLegend: { flexDirection: 'row', gap: 20, marginBottom: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontSize: 12, fontWeight: '500', color: '#94A3B8' },

  chartArea: { position: 'relative', paddingLeft: 44 },
  gridLine: { position: 'absolute', left: 44, right: 0, height: 1, backgroundColor: 'rgba(148,163,184,0.12)' },
  yAxisLabels: { position: 'absolute', left: 0, top: 0, bottom: 20, width: 40, justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 6 },
  yLabel: { fontSize: 9, color: '#64748B', fontWeight: '500' },

  chartScroll: { alignItems: 'flex-end', paddingBottom: 4 },
  barGroup: { alignItems: 'center', marginRight: 8, width: CHART_BAR_WIDTH + 8 },
  barContainer: { width: CHART_BAR_WIDTH, height: 160, justifyContent: 'flex-end', borderRadius: 6, overflow: 'hidden', backgroundColor: 'rgba(148,163,184,0.06)' },
  barSegment: { width: '100%', minHeight: 2 },
  barValueAbove: { fontSize: 8, color: '#94A3B8', fontWeight: '600', marginBottom: 2 },
  barDate: { fontSize: 10, color: '#64748B', marginTop: 4, fontWeight: '500' },
  barDateToday: { color: '#0EA5E9', fontWeight: '700' },

  emptyChart: { marginHorizontal: 16, backgroundColor: COLORS.surface, borderRadius: 14, padding: 40, alignItems: 'center', borderWidth: 1, borderColor: COLORS.borderLight },
  emptyText: { marginTop: 8, fontSize: 13, color: COLORS.textMuted },

  // Detail Card
  detailCard: { marginHorizontal: 16, marginTop: 16, backgroundColor: COLORS.surface, borderRadius: 14, borderWidth: 1, borderColor: COLORS.borderLight, overflow: 'hidden' },
  detailHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  detailIconWrap: { width: 32, height: 32, borderRadius: 8, backgroundColor: COLORS.accentBg, justifyContent: 'center', alignItems: 'center' },
  detailTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text, flex: 1 },
  detailBody: { padding: 14 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  detailRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  detailRowLabel: { fontSize: 13, color: COLORS.textSecondary },
  detailRowValue: { fontSize: 14, fontWeight: '600', color: COLORS.text },

  // Live badge
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  liveText: { fontSize: 10, fontWeight: '700', color: '#059669', letterSpacing: 0.5 },

  // Ratio bar
  ratioSection: { padding: 14 },
  ratioBar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: COLORS.borderLight },
  ratioFillDl: { backgroundColor: '#0EA5E9', borderTopLeftRadius: 6, borderBottomLeftRadius: 6 },
  ratioFillUl: { backgroundColor: '#F97316', borderTopRightRadius: 6, borderBottomRightRadius: 6 },
  ratioLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  ratioLabelItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratioLabelDot: { width: 8, height: 8, borderRadius: 4 },
  ratioLabelText: { fontSize: 12, color: COLORS.textSecondary },

  // Daily log table
  tableHeader: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: COLORS.borderLight },
  tableHeaderCell: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10 },
  tableRowAlt: { backgroundColor: '#FAFBFC' },
  tableCell: { fontSize: 13, color: COLORS.text },

  // ── Service Picker (inside hero) ──
  servicePickerWrap: {
    marginBottom: 14,
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
