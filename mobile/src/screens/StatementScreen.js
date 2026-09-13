// ============================================
// HOMELINK Customer App — Statement Screen
// ============================================
// Bank-style statement matching PHP CustomerStatement
// Shows: date picker, customer info, opening balance,
// transaction table with running balance, period summary
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, Platform, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import api from '../api/client';
import LOGO_BASE64 from '../constants/logoBase64';

// Platform-specific PDF imports (native only — web uses CDN)
let Print, Sharing;
if (Platform.OS !== 'web') {
  Print = require('expo-print');
  Sharing = require('expo-sharing');
}

// Dynamically load html2pdf.js from CDN for web (avoids Metro bundler crash)
function loadHtml2Pdf() {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.html2pdf) {
      return resolve(window.html2pdf);
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.2/html2pdf.bundle.min.js';
    script.onload = () => resolve(window.html2pdf);
    script.onerror = () => reject(new Error('Failed to load html2pdf.js'));
    document.head.appendChild(script);
  });
}

// Quick period presets
const PRESETS = [
  { label: '3 Months', months: 3 },
  { label: '6 Months', months: 6 },
  { label: '1 Year', months: 12 },
  { label: 'All Time', months: 36 },
];

function dateStr(d) {
  return d.toISOString().slice(0, 10);
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtMoney(n) {
  return (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export default function StatementScreen() {
  const [activePreset, setActivePreset] = useState(3);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(null);
  const [showCustom, setShowCustom] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Set initial dates
  useEffect(() => {
    applyPreset(3);
  }, []);

  const applyPreset = (months) => {
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - months);
    setStartDate(dateStr(start));
    setEndDate(dateStr(end));
    setActivePreset(months);
    setShowCustom(false);
  };

  const applyCustom = () => {
    if (customStart && customEnd) {
      setStartDate(customStart);
      setEndDate(customEnd);
      setActivePreset(null);
      setShowCustom(false);
    }
  };

  const loadStatement = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    try {
      const result = await api.getStatement(startDate, endDate);
      setData(result);
    } catch (err) {
      console.warn('Statement load failed:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { loadStatement(); }, [loadStatement]);

  const onRefresh = () => { setRefreshing(true); loadStatement(); };

  // ── Generate PDF matching PHP CustomerStatement template ──
  const handleDownloadPDF = async () => {
    if (!data) return;
    try {
      const transactionRows = (data.transactions || []).map((tx, idx) => {
        const rowClass = tx.type === 'INVOICE' ? 'debit-row' : 'credit-row';
        const altBg = idx % 2 === 0 ? '' : 'style="background-color:#fafafa;"';
        return `
          <tr class="${rowClass}" ${altBg}>
            <td>${fmtDate(tx.date)}</td>
            <td>${escHtml(tx.description)}${tx.reference ? `<br><small style="color:#666;">${escHtml(tx.reference)}</small>` : ''}</td>
            <td>${escHtml(tx.reference || '—')}</td>
            <td class="amount debit">${tx.debit > 0 ? fmtMoney(tx.debit) : '—'}</td>
            <td class="amount credit">${tx.credit > 0 ? fmtMoney(tx.credit) : '—'}</td>
            <td class="amount balance"><strong>${fmtMoney(tx.balance)}</strong></td>
          </tr>`;
      }).join('');

      const today = new Date();
      const generatedDate = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Customer Statement - ${escHtml(data.customer?.name)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #333; line-height: 1.4; font-size: 12px; }
    .statement-container { max-width: 800px; margin: 0 auto; background: white; }
    .letterhead { border-bottom: 3px solid #F58220; margin-bottom: 20px; padding-bottom: 15px; }
    .company-info { display: flex; justify-content: space-between; align-items: flex-start; }
    .company-details h1 { color: #F58220; font-size: 22px; margin: 0 0 8px 0; font-weight: bold; }
    .company-details p { margin: 2px 0; color: #666; font-size: 11px; }
    .logo { max-width: 120px; height: auto; }
    .statement-header { background: #FFF4EB; padding: 15px; margin: 15px 0; border-radius: 8px; }
    .statement-title { font-size: 24px; color: #F58220; margin: 0 0 12px 0; text-align: center; }
    .statement-info { display: flex; justify-content: space-between; }
    .customer-info, .period-info { flex: 1; }
    .customer-info h3, .period-info h3 { font-size: 13px; color: #F58220; margin: 0 0 6px 0; }
    .customer-info p, .period-info p { margin: 2px 0; font-size: 11px; }
    .section-title { color: #F58220; font-size: 14px; border-bottom: 2px solid #F58220; padding-bottom: 5px; margin: 20px 0 10px 0; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
    th { background: #F58220; color: white; font-weight: bold; }
    .amount { text-align: right; font-weight: bold; }
    .total-row { background: #FFF4EB; font-weight: bold; }
    .balance-section { margin-bottom: 15px; padding: 12px; background-color: #FFF4EB; border: 2px solid #F58220; border-radius: 8px; }
    .balance-row td { padding: 10px; font-size: 13px; background-color: #DBEAFE; }
    .debit-row { background-color: #fff5f5; }
    .credit-row { background-color: #f0fff4; }
    .debit { color: #d32f2f; font-weight: bold; }
    .credit { color: #2e7d32; font-weight: bold; }
    .balance { color: #1565c0; font-weight: bold; }
    .footer { margin-top: 25px; text-align: center; color: #666; font-size: 10px; border-top: 1px solid #e5e7eb; padding-top: 15px; }
    .verification-box { margin-top: 20px; padding: 12px; border: 1.5px solid #F58220; border-radius: 8px; background: #FFF4EB; }
    .verification-box h3 { color: #F58220; font-size: 13px; margin: 0 0 8px 0; text-align: center; }
    .verification-box p { margin: 4px 0; font-size: 11px; }
    .verification-box code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-size: 11px; }
    @media print { body { margin: 0; padding: 10px; } }
  </style>
</head>
<body>
  <div class="statement-container">
    <!-- Company Letterhead -->
    <div class="letterhead">
      <div class="company-info">
        <div class="company-details">
          <h1>TONYCOMM GROUP LTD</h1>
          <p>P.O Box 441-20100, NAKURU, KENYA</p>
          <p>Email: support@homelink.local</p>
          <p>Website: www.acs.tcom.co.ke/homelink</p>
          <p>Phone: +254 700 000 000</p>
        </div>
        <div class="logo-section">
          <img src="${LOGO_BASE64}" alt="Company Logo" class="logo">
        </div>
      </div>
    </div>

    <!-- Statement Header -->
    <div class="statement-header">
      <h2 class="statement-title">CUSTOMER STATEMENT</h2>
      <div class="statement-info">
        <div class="customer-info">
          <h3>Customer Details</h3>
          <p><strong>Name:</strong> ${escHtml(data.customer?.name)}</p>
          <p><strong>Phone:</strong> ${escHtml(data.customer?.phone)}</p>
          <p><strong>Customer ID:</strong> ${data.customer?.id || '—'}</p>
          ${data.service ? `<p><strong>Service:</strong> ${escHtml(data.service.mikrotikName)} (${escHtml(data.service.planName)})</p>` : ''}
        </div>
        <div class="period-info">
          <h3>Statement Period</h3>
          <p><strong>From:</strong> ${fmtDate(data.period?.start)}</p>
          <p><strong>To:</strong> ${fmtDate(data.period?.end)}</p>
          <p><strong>Generated:</strong> ${generatedDate}</p>
          <p><strong>Statement ID:</strong> ${data.statementId || '—'}</p>
        </div>
      </div>
    </div>

    <!-- Opening Balance -->
    <div class="balance-section">
      <h3 class="section-title" style="margin-top:0;">Opening Balance</h3>
      <table>
        <tr class="balance-row">
          <td><strong>Balance Brought Forward</strong></td>
          <td class="amount"><strong>KES ${fmtMoney(data.openingBalance)}</strong></td>
        </tr>
      </table>
    </div>

    <!-- Transaction History -->
    <h3 class="section-title">Transaction History</h3>
    ${(data.transactions || []).length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Description</th>
          <th>Reference</th>
          <th class="amount">Debit (KES)</th>
          <th class="amount">Credit (KES)</th>
          <th class="amount">Balance (KES)</th>
        </tr>
      </thead>
      <tbody>
        ${transactionRows}
      </tbody>
    </table>
    ` : `<div style="text-align:center;padding:30px;color:#666;"><p><strong>No transactions found for this period.</strong></p></div>`}

    <!-- Summary -->
    <h3 class="section-title">Period Summary</h3>
    <table>
      <tr>
        <td><strong>Opening Balance</strong></td>
        <td class="amount"><strong>KES ${fmtMoney(data.openingBalance)}</strong></td>
      </tr>
      <tr class="debit-row">
        <td><strong>Total Debits (Invoices)</strong></td>
        <td class="amount debit"><strong>KES ${fmtMoney(data.totals?.debits)}</strong></td>
      </tr>
      <tr class="credit-row">
        <td><strong>Total Credits (Payments)</strong></td>
        <td class="amount credit"><strong>KES ${fmtMoney(data.totals?.credits)}</strong></td>
      </tr>
      <tr class="total-row">
        <td><strong>Closing Balance</strong></td>
        <td class="amount balance"><strong>KES ${fmtMoney(data.closingBalance)}</strong></td>
      </tr>
    </table>

    <!-- Verification -->
    <div class="verification-box">
      <h3>Electronic Statement Verification</h3>
      <p><strong>Statement ID:</strong> <code>${data.statementId || '—'}</code></p>
      <p><strong>Generated:</strong> ${generatedDate}</p>
      <p style="font-size:10px;color:#666;">This is a computer-generated statement and does not require a signature.</p>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p>This is a computer-generated statement and does not require a signature.</p>
      <p>For any queries regarding this statement, please contact us at support@homelink.local</p>
      <p>&copy; ${today.getFullYear()} TONYCOMM GROUP LTD. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

      const filename = `Statement_${(data.customer?.name || 'Customer').replace(/[^A-Za-z0-9]/g, '_')}_${dateStr(new Date())}.pdf`;

      if (Platform.OS === 'web') {
        // Web: dynamically load html2pdf.js from CDN, then generate + download PDF
        const html2pdf = await loadHtml2Pdf();

        await html2pdf().set({
          margin:       [10, 10, 10, 10],
          filename:     filename,
          image:        { type: 'jpeg', quality: 0.98 },
          html2canvas:  { scale: 2, useCORS: true },
          jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
        }).from(html, 'string').save();
      } else {
        // Native: use expo-print + expo-sharing
        const { uri } = await Print.printToFileAsync({ html, base64: false });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Download Statement PDF',
            UTI: 'com.adobe.pdf',
          });
        } else {
          Alert.alert('PDF Generated', `Statement saved to:\n${uri}`);
        }
      }
    } catch (err) {
      console.warn('PDF generation failed:', err);
      Alert.alert('Error', 'Failed to generate PDF. Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <LinearGradient
          colors={[COLORS.primaryDark, COLORS.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroIcon}>
            <Ionicons name="document-text" size={24} color="#fff" />
          </View>
          <Text style={styles.heroTitle}>Account Statement</Text>
          <Text style={styles.heroSub}>Generate a detailed statement of your account</Text>
          <View style={styles.heroCircle1} />
          <View style={styles.heroCircle2} />
        </LinearGradient>

        {/* ── Period Presets ── */}
        <View style={styles.presetsCard}>
          <Text style={styles.presetsLabel}>Statement Period</Text>
          <View style={styles.presetsRow}>
            {PRESETS.map(p => {
              const active = activePreset === p.months && !showCustom;
              return (
                <TouchableOpacity
                  key={p.months}
                  style={[styles.presetChip, active && styles.presetActive]}
                  onPress={() => applyPreset(p.months)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.presetText, active && styles.presetTextActive]}>{p.label}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[styles.presetChip, showCustom && styles.presetActive]}
              onPress={() => setShowCustom(!showCustom)}
              activeOpacity={0.7}
            >
              <Ionicons
                name="calendar-outline"
                size={14}
                color={showCustom ? '#fff' : COLORS.textSecondary}
              />
              <Text style={[styles.presetText, showCustom && styles.presetTextActive]}>Custom</Text>
            </TouchableOpacity>
          </View>

          {/* Custom date inputs */}
          {showCustom && (
            <View style={styles.customDates}>
              <View style={styles.dateField}>
                <Text style={styles.dateLabel}>From</Text>
                <TextInput
                  style={styles.dateInput}
                  value={customStart}
                  onChangeText={setCustomStart}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={COLORS.textMuted}
                  maxLength={10}
                />
              </View>
              <View style={styles.dateField}>
                <Text style={styles.dateLabel}>To</Text>
                <TextInput
                  style={styles.dateInput}
                  value={customEnd}
                  onChangeText={setCustomEnd}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={COLORS.textMuted}
                  maxLength={10}
                />
              </View>
              <TouchableOpacity style={styles.applyBtn} onPress={applyCustom}>
                <Text style={styles.applyBtnText}>Apply</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Current range display */}
          <View style={styles.rangeDisplay}>
            <Ionicons name="calendar" size={14} color={COLORS.primary} />
            <Text style={styles.rangeText}>
              {fmtDate(startDate)} — {fmtDate(endDate)}
            </Text>
          </View>
        </View>

        {/* ── Loading ── */}
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Generating statement...</Text>
          </View>
        ) : data ? (
          <>
            {/* ── Customer Info ── */}
            <View style={styles.infoCard}>
              <View style={styles.infoHeader}>
                <Ionicons name="person-outline" size={16} color={COLORS.primary} />
                <Text style={styles.infoHeaderText}>Customer Information</Text>
              </View>
              <InfoRow label="Name" value={data.customer?.name} />
              <InfoRow label="Customer ID" value={data.customer?.id} />
              <InfoRow label="Phone" value={data.customer?.phone} />
              {data.service && (
                <>
                  <InfoRow label="Username" value={data.service.mikrotikName} />
                  <InfoRow label="Plan" value={`${data.service.planName} (KSh ${data.service.price?.toLocaleString()}/mo)`} isLast />
                </>
              )}
              {!data.service && <InfoRow label="Service" value="—" isLast />}
            </View>

            {/* ── Period Summary ── */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Period Summary</Text>
              <View style={styles.summaryGrid}>
                <SummaryTile
                  label="Opening Balance"
                  value={data.openingBalance}
                  icon="wallet-outline"
                  color={COLORS.primary}
                  bg={COLORS.primaryBg}
                />
                <SummaryTile
                  label="Total Debits"
                  value={data.totals?.debits}
                  icon="arrow-up-circle-outline"
                  color={COLORS.danger}
                  bg="#FEE2E2"
                />
                <SummaryTile
                  label="Total Credits"
                  value={data.totals?.credits}
                  icon="arrow-down-circle-outline"
                  color={COLORS.success}
                  bg={COLORS.accentBg}
                />
                <SummaryTile
                  label="Closing Balance"
                  value={data.closingBalance}
                  icon="calculator-outline"
                  color={data.closingBalance <= 0 ? COLORS.success : COLORS.danger}
                  bg={data.closingBalance <= 0 ? COLORS.accentBg : '#FEE2E2'}
                />
              </View>
            </View>

            {/* ── Transaction Table ── */}
            <View style={styles.tableCard}>
              <View style={styles.tableHeader}>
                <Text style={styles.tableTitle}>Transaction History</Text>
                <Text style={styles.tableCount}>{data.transactions?.length || 0} entries</Text>
              </View>

              {/* Table column headers */}
              <View style={styles.colHeaders}>
                <Text style={[styles.colH, { flex: 2.5 }]}>Description</Text>
                <Text style={[styles.colH, styles.colRight, { flex: 1 }]}>Debit</Text>
                <Text style={[styles.colH, styles.colRight, { flex: 1 }]}>Credit</Text>
                <Text style={[styles.colH, styles.colRight, { flex: 1.2 }]}>Balance</Text>
              </View>

              {/* Opening balance row */}
              <View style={[styles.txRow, styles.txRowAlt]}>
                <View style={{ flex: 2.5 }}>
                  <Text style={[styles.txDesc, { fontStyle: 'italic', color: COLORS.textSecondary }]}>
                    Opening Balance
                  </Text>
                </View>
                <Text style={[styles.txAmount, styles.colRight, { flex: 1 }]}>—</Text>
                <Text style={[styles.txAmount, styles.colRight, { flex: 1 }]}>—</Text>
                <Text style={[styles.txBalance, styles.colRight, { flex: 1.2 }]}>
                  {fmtMoney(data.openingBalance)}
                </Text>
              </View>

              {/* Transactions */}
              {(data.transactions || []).map((tx, idx) => {
                const isInvoice = tx.type === 'INVOICE';
                const isAlt = (idx + 1) % 2 === 0;
                return (
                  <View key={`${tx.type}-${tx.reference}-${idx}`} style={[styles.txRow, isAlt && styles.txRowAlt]}>
                    <View style={{ flex: 2.5 }}>
                      <View style={styles.txDescRow}>
                        <View style={[styles.txDot, { backgroundColor: isInvoice ? COLORS.danger : COLORS.success }]} />
                        <Text style={styles.txDesc} numberOfLines={2}>{tx.description}</Text>
                      </View>
                      <View style={styles.txMeta}>
                        <Text style={styles.txMetaText}>{fmtDate(tx.date)}</Text>
                        {tx.reference ? <Text style={styles.txRef}>{tx.reference}</Text> : null}
                      </View>
                    </View>
                    <Text style={[
                      styles.txAmount, styles.colRight, { flex: 1 },
                      tx.debit > 0 && { color: COLORS.danger },
                    ]}>
                      {tx.debit > 0 ? fmtMoney(tx.debit) : '—'}
                    </Text>
                    <Text style={[
                      styles.txAmount, styles.colRight, { flex: 1 },
                      tx.credit > 0 && { color: COLORS.success },
                    ]}>
                      {tx.credit > 0 ? fmtMoney(tx.credit) : '—'}
                    </Text>
                    <Text style={[styles.txBalance, styles.colRight, { flex: 1.2 }]}>
                      {fmtMoney(tx.balance)}
                    </Text>
                  </View>
                );
              })}

              {/* Closing balance row */}
              <View style={[styles.txRow, styles.closingRow]}>
                <View style={{ flex: 2.5 }}>
                  <Text style={[styles.txDesc, { fontWeight: '700' }]}>Closing Balance</Text>
                </View>
                <Text style={[styles.txAmount, styles.colRight, { flex: 1, fontWeight: '700' }]}>
                  {fmtMoney(data.totals?.debits)}
                </Text>
                <Text style={[styles.txAmount, styles.colRight, { flex: 1, fontWeight: '700' }]}>
                  {fmtMoney(data.totals?.credits)}
                </Text>
                <Text style={[styles.txBalance, styles.colRight, { flex: 1.2, fontWeight: '800' }]}>
                  {fmtMoney(data.closingBalance)}
                </Text>
              </View>

              {data.transactions?.length === 0 && (
                <View style={styles.emptyState}>
                  <Ionicons name="document-outline" size={32} color={COLORS.textMuted} />
                  <Text style={styles.emptyText}>No transactions in this period</Text>
                </View>
              )}
            </View>

            {/* ── Download PDF ── */}
            <TouchableOpacity style={styles.shareBtn} onPress={handleDownloadPDF} activeOpacity={0.7}>
              <Ionicons name="download-outline" size={18} color="#fff" />
              <Text style={styles.shareBtnText}>Download PDF</Text>
            </TouchableOpacity>

            {/* ── Statement footer ── */}
            {data.statementId && (
              <View style={styles.stmtFooter}>
                <Text style={styles.stmtFooterText}>Statement ID: {data.statementId}</Text>
                <Text style={styles.stmtFooterNote}>
                  This is a computer-generated statement. A positive balance indicates amount owed.
                  A negative (credit) balance indicates overpayment.
                </Text>
              </View>
            )}
          </>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="alert-circle-outline" size={40} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>Could not load statement</Text>
            <TouchableOpacity onPress={loadStatement}>
              <Text style={styles.retryText}>Tap to retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Powered by HOMELINK Group Ltd</Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ============ Sub-components ============

function InfoRow({ label, value, isLast }) {
  return (
    <View style={[styles.infoRow, !isLast && styles.infoRowBorder]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value ?? '—'}</Text>
    </View>
  );
}

function SummaryTile({ label, value, icon, color, bg }) {
  return (
    <View style={styles.summaryTile}>
      <View style={[styles.summaryTileIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.summaryTileLabel}>{label}</Text>
      <Text style={[styles.summaryTileValue, { color }]}>KSh {fmtMoney(value)}</Text>
    </View>
  );
}

// ============ Styles ============
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingBottom: 30 },
  loadingWrap: { paddingTop: 60, alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: SIZES.body, color: COLORS.textSecondary },

  // ── Hero ──
  hero: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  heroSub: {
    fontSize: 13,
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

  // ── Presets Card ──
  presetsCard: {
    marginHorizontal: SIZES.md,
    marginTop: -10,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    ...SHADOWS.card,
  },
  presetsLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 10,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.borderLight,
  },
  presetActive: {
    backgroundColor: COLORS.primary,
  },
  presetText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  presetTextActive: { color: '#fff' },

  customDates: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  dateField: { flex: 1 },
  dateLabel: { fontSize: 11, color: COLORS.textMuted, marginBottom: 4 },
  dateInput: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  applyBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
  },
  applyBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },

  rangeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  rangeText: { fontSize: 13, color: COLORS.text, fontWeight: '500' },

  // ── Customer Info ──
  infoCard: {
    marginHorizontal: SIZES.md,
    marginTop: SIZES.md,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  infoHeaderText: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  infoLabel: { fontSize: 13, color: COLORS.textSecondary },
  infoValue: { fontSize: 13, fontWeight: '600', color: COLORS.text, maxWidth: '60%', textAlign: 'right' },

  // ── Summary ──
  summaryCard: {
    marginHorizontal: SIZES.md,
    marginTop: SIZES.md,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    ...SHADOWS.card,
  },
  summaryTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 14 },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryTile: {
    width: '47%',
    padding: 12,
    borderRadius: 12,
    backgroundColor: COLORS.background,
  },
  summaryTileIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryTileLabel: { fontSize: 11, color: COLORS.textMuted, marginBottom: 2 },
  summaryTileValue: { fontSize: 15, fontWeight: '700' },

  // ── Transaction Table ──
  tableCard: {
    marginHorizontal: SIZES.md,
    marginTop: SIZES.md,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  tableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  tableTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  tableCount: { fontSize: 12, color: COLORS.textMuted },
  colHeaders: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  colH: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  colRight: { textAlign: 'right' },

  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  txRowAlt: { backgroundColor: '#FAFBFC' },
  txDescRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  txDot: { width: 6, height: 6, borderRadius: 3 },
  txDesc: { fontSize: 12, fontWeight: '600', color: COLORS.text, flexShrink: 1 },
  txMeta: { flexDirection: 'row', gap: 8, marginTop: 3, paddingLeft: 12 },
  txMetaText: { fontSize: 10, color: COLORS.textMuted },
  txRef: { fontSize: 10, color: COLORS.primary, fontWeight: '500' },
  txAmount: { fontSize: 11, color: COLORS.textSecondary },
  txBalance: { fontSize: 11, fontWeight: '700', color: COLORS.text },
  closingRow: {
    backgroundColor: COLORS.primaryBg,
    borderBottomWidth: 0,
  },

  // ── Share Button ──
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: SIZES.md,
    marginTop: SIZES.md,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    ...SHADOWS.card,
  },
  shareBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },

  // ── Statement Footer ──
  stmtFooter: {
    marginHorizontal: SIZES.md,
    marginTop: SIZES.md,
    padding: 14,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  stmtFooterText: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 6 },
  stmtFooterNote: { fontSize: 11, color: COLORS.textMuted, lineHeight: 16 },

  // ── Empty / Footer ──
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 14, color: COLORS.textMuted },
  retryText: { fontSize: 14, fontWeight: '600', color: COLORS.primary, marginTop: 8 },
  footer: { alignItems: 'center', marginTop: SIZES.xl, paddingBottom: SIZES.md },
  footerText: { fontSize: 12, color: COLORS.textMuted },
});
