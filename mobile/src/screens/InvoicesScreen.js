// ============================================
// HOMELINK Customer App — Invoices Screen
// ============================================
// Professional invoice list with summary header,
// filter tabs, and clean card-based rows.
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import api from '../api/client';

const FILTERS = [
  { key: 'all',    label: 'All' },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'paid',   label: 'Paid' },
];

export default function InvoicesScreen({ navigation }) {
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [services, setServices] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [invData, payData, dashData] = await Promise.all([
        api.getInvoices(),
        api.getPayments(),
        api.getDashboard(),
      ]);
      setInvoices(Array.isArray(invData) ? invData : []);
      setPayments(Array.isArray(payData) ? payData : []);
      if (dashData?.services?.length) setServices(dashData.services);
    } catch (err) {
      console.warn('Invoices fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  // ── Derived data ──
  const unpaidList = invoices.filter(i => i.status !== 'Paid');
  const paidList   = invoices.filter(i => i.status === 'Paid');
  const totalUnpaid = unpaidList.reduce((s, i) => s + (i.total - (i.paidAmount || 0)), 0);
  const totalPaid   = paidList.reduce((s, i) => s + i.total, 0);

  const filtered = filter === 'all' ? invoices
    : filter === 'unpaid' ? unpaidList
    : paidList;

  // ── Formatters ──
  const fmtDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const fmtShort = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  const getDaysUntilDue = (dueDate) => {
    if (!dueDate) return null;
    const diff = Math.ceil((new Date(dueDate) - new Date()) / 86400000);
    return diff;
  };

  // ─── Row renderer ───
  const renderInvoice = ({ item: inv }) => {
    const isPaid = inv.status === 'Paid';
    const daysLeft = getDaysUntilDue(inv.dueDate);
    const isOverdue = !isPaid && daysLeft !== null && daysLeft < 0;
    const remaining = inv.total - (inv.paidAmount || 0);

    return (
      <TouchableOpacity
        style={styles.invoiceCard}
        onPress={() => {
          if (!isPaid) navigation.navigate('Payment', { invoice: inv, services, allInvoices: invoices });
        }}
        activeOpacity={isPaid ? 1 : 0.7}
      >
        {/* Left: icon + details */}
        <View style={[styles.invoiceIcon, isPaid ? styles.iconPaid : isOverdue ? styles.iconOverdue : styles.iconUnpaid]}>
          <Ionicons
            name={isPaid ? 'checkmark-circle' : isOverdue ? 'alert-circle' : 'time'}
            size={20}
            color={isPaid ? COLORS.success : isOverdue ? COLORS.danger : COLORS.warning}
          />
        </View>

        <View style={styles.invoiceBody}>
          <View style={styles.invoiceTopRow}>
            <Text style={styles.invoiceId}>INV-{String(inv.id).padStart(4, '0')}</Text>
            <Text style={styles.invoiceAmount}>KSh {inv.total.toLocaleString()}</Text>
          </View>
          <View style={styles.invoiceBottomRow}>
            <Text style={styles.invoiceDate}>{fmtDate(inv.date)}</Text>
            <View style={[styles.badge, isPaid ? styles.badgePaid : isOverdue ? styles.badgeOverdue : styles.badgeUnpaid]}>
              <Text style={[
                styles.badgeText,
                isPaid ? { color: COLORS.success }
                  : isOverdue ? { color: COLORS.danger }
                  : { color: COLORS.warning },
              ]}>
                {isPaid ? 'Paid' : isOverdue ? 'Overdue' : 'Unpaid'}
              </Text>
            </View>
          </View>

          {/* Due / remaining line for unpaid */}
          {!isPaid && (
            <View style={styles.invoiceMeta}>
              <Text style={styles.metaText}>
                Due {fmtShort(inv.dueDate)}
                {daysLeft !== null && (
                  daysLeft > 0
                    ? ` · ${daysLeft}d left`
                    : daysLeft === 0 ? ' · Due today' : ` · ${Math.abs(daysLeft)}d overdue`
                )}
              </Text>
              {inv.paidAmount > 0 && (
                <Text style={styles.metaRemaining}>
                  Remaining: KSh {remaining.toLocaleString()}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Chevron for unpaid (tappable) */}
        {!isPaid && (
          <Ionicons name="chevron-forward" size={18} color={COLORS.borderLight} style={{ marginLeft: 4 }} />
        )}
      </TouchableOpacity>
    );
  };

  // ─── Loading ───
  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading invoices...</Text>
      </View>
    );
  }

  // ─── Main ───
  return (
    <View style={styles.container}>
      {/* ── Summary Header ── */}
      <LinearGradient
        colors={[COLORS.primaryDark, COLORS.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.summaryHeader}
      >
        <View style={styles.summaryRow}>
          <View style={styles.summaryBlock}>
            <Text style={styles.summaryLabel}>Total Outstanding</Text>
            <Text style={styles.summaryValue}>KSh {totalUnpaid.toLocaleString()}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryBlock}>
            <Text style={styles.summaryLabel}>Total Paid</Text>
            <Text style={styles.summaryValue}>KSh {totalPaid.toLocaleString()}</Text>
          </View>
        </View>
        <View style={styles.summaryCounts}>
          <View style={styles.countChip}>
            <Text style={styles.countNum}>{invoices.length}</Text>
            <Text style={styles.countLabel}>Total</Text>
          </View>
          <View style={styles.countChip}>
            <Text style={[styles.countNum, { color: '#FDE68A' }]}>{unpaidList.length}</Text>
            <Text style={styles.countLabel}>Unpaid</Text>
          </View>
          <View style={styles.countChip}>
            <Text style={[styles.countNum, { color: '#A7F3D0' }]}>{paidList.length}</Text>
            <Text style={styles.countLabel}>Paid</Text>
          </View>
        </View>
        {/* Decorative */}
        <View style={styles.heroCircle1} />
        <View style={styles.heroCircle2} />
      </LinearGradient>

      {/* ── Filter Tabs ── */}
      <View style={styles.filterWrap}>
        <View style={styles.filterRow}>
          {FILTERS.map(f => {
            const active = filter === f.key;
            const count = f.key === 'all' ? invoices.length
              : f.key === 'unpaid' ? unpaidList.length : paidList.length;
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterTab, active && styles.filterActive]}
                onPress={() => setFilter(f.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {f.label}
                </Text>
                <View style={[styles.filterCount, active && styles.filterCountActive]}>
                  <Text style={[styles.filterCountText, active && styles.filterCountTextActive]}>
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Invoice List ── */}
      <FlatList
        data={filtered}
        keyExtractor={item => item.id.toString()}
        renderItem={renderInvoice}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="receipt-outline" size={40} color={COLORS.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No invoices found</Text>
            <Text style={styles.emptySub}>
              {filter !== 'all'
                ? `No ${filter} invoices. Try changing the filter.`
                : 'Your invoices will appear here.'}
            </Text>
          </View>
        }
        ListFooterComponent={
          payments.length > 0 ? (
            <View style={styles.txSection}>
              <View style={styles.txHeader}>
                <Text style={styles.txTitle}>Recent Transactions</Text>
                <TouchableOpacity onPress={() => navigation.navigate('Statement')}>
                  <Text style={styles.txViewAll}>Full Statement →</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.txCard}>
                {payments.slice(0, 6).map((tx, idx) => (
                  <View
                    key={tx.id}
                    style={[
                      styles.txRow,
                      idx < Math.min(payments.length, 6) - 1 && styles.txRowBorder,
                    ]}
                  >
                    <View style={styles.txIconWrap}>
                      <Ionicons name="arrow-down-circle" size={18} color={COLORS.success} />
                    </View>
                    <View style={styles.txBody}>
                      <Text style={styles.txType}>
                        {tx.type || 'Payment'}
                      </Text>
                      <Text style={styles.txDate}>{fmtDate(tx.date)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.txAmount}>+ KSh {tx.amount.toLocaleString()}</Text>
                      {tx.transId ? (
                        <Text style={styles.txRef} numberOfLines={1}>{tx.transId}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : null
        }
      />
    </View>
  );
}

// ============ Styles ============
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  loadingText: { marginTop: 12, fontSize: SIZES.body, color: COLORS.textSecondary },

  // ── Summary Header ──
  summaryHeader: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryBlock: { flex: 1 },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.65)',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 16,
  },
  summaryCounts: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  countChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  countNum: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  countLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
  },
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

  // ── Filter Tabs ──
  filterWrap: {
    paddingHorizontal: SIZES.md,
    paddingTop: SIZES.md,
  },
  filterRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 4,
    ...SHADOWS.small,
  },
  filterTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  filterActive: {
    backgroundColor: COLORS.primary,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  filterTextActive: { color: '#fff' },
  filterCount: {
    backgroundColor: COLORS.borderLight,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 10,
  },
  filterCountActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  filterCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  filterCountTextActive: { color: '#fff' },

  // ── Invoice List ──
  listContent: {
    padding: SIZES.md,
    paddingTop: SIZES.sm,
    paddingBottom: SIZES.xxl,
  },

  invoiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    ...SHADOWS.card,
  },
  invoiceIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconPaid: { backgroundColor: COLORS.accentBg },
  iconUnpaid: { backgroundColor: '#FEF3C7' },
  iconOverdue: { backgroundColor: '#FEE2E2' },
  invoiceBody: { flex: 1 },
  invoiceTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  invoiceId: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  invoiceAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  invoiceBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  invoiceDate: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  badgePaid: { backgroundColor: COLORS.accentBg },
  badgeUnpaid: { backgroundColor: '#FEF3C7' },
  badgeOverdue: { backgroundColor: '#FEE2E2' },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },

  invoiceMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  metaText: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  metaRemaining: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primary,
  },

  // ── Empty State ──
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 8,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  emptySub: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    maxWidth: 240,
  },

  // ── Transactions Footer ──
  txSection: {
    marginTop: SIZES.lg,
  },
  txHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SIZES.sm,
  },
  txTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  txViewAll: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  txCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  txRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  txIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.accentBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  txBody: { flex: 1 },
  txType: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  txDate: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  txAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.success,
  },
  txRef: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
    maxWidth: 100,
  },
});
