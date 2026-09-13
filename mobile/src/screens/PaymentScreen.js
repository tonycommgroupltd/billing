// ============================================
// HOMELINK Customer App — Payment Screen
// ============================================
// M-Pesa STK Push payment flow.
// - If navigated with an invoice → pay that invoice directly
// - If navigated without → show service selector + amount input
// Account reference format: customerDbPhone#serviceId
// The DB phone is the customer's registered phone number,
// NOT the M-Pesa phone they enter (which may differ).
// ============================================

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, TextInput, ScrollView, Modal, FlatList, RefreshControl,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import { useAuth } from '../auth/AuthContext';
import api from '../api/client';

export default function PaymentScreen({ route, navigation }) {
  const { invoice: routeInvoice, services: routeServices, allInvoices: routeAllInvoices } = route.params || {};
  const { user } = useAuth();

  // ── State ──
  const [phone, setPhone] = useState(user?.phone || '');
  const [customerDbPhone, setCustomerDbPhone] = useState(''); // Phone from remote DB for account ref
  const [step, setStep] = useState('confirm'); // confirm | pending | pending_manual | success | failed
  const [loading, setLoading] = useState(false);
  const [transId, setTransId] = useState('');
  const [checkCount, setCheckCount] = useState(0);

  // Service selection (for multi-service / no-invoice flow)
  const [services, setServices] = useState(routeServices || []);
  const [allInvoices, setAllInvoices] = useState(routeAllInvoices || []);
  const [selectedService, setSelectedService] = useState(null);
  const [customAmount, setCustomAmount] = useState('');
  const [invoice, setInvoice] = useState(routeInvoice || null);
  const [fetchingData, setFetchingData] = useState(!routeInvoice && (!routeServices || routeServices.length === 0));
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState('monthly'); // monthly | weekly | biweekly
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    await fetchCustomerPhone();
    setRefreshing(false);
  };

  // ── Load services if not provided ──
  useEffect(() => {
    // Always fetch the customer's registered phone from the remote DB
    fetchCustomerPhone();

    if (routeInvoice) {
      // Invoice provided — auto-select its service
      if (routeServices?.length) {
        const svc = routeServices.find(s => s.id === routeInvoice.serviceId);
        if (svc) setSelectedService(svc);
      }
    } else if (!routeServices || routeServices.length === 0) {
      loadDashboardData();
    } else if (routeServices.length === 1) {
      setSelectedService(routeServices[0]);
    }
  }, []);

  // Fetch the customer's phone number from the remote database
  const fetchCustomerPhone = async () => {
    try {
      const dash = await api.getDashboard();
      if (dash?.customer?.phone) {
        setCustomerDbPhone(dash.customer.phone);
        // Also pre-fill M-Pesa phone if not set
        if (!phone) setPhone(dash.customer.phone);
      }
    } catch (err) {
      console.warn('Failed to fetch customer phone:', err);
    }
  };

  const loadDashboardData = async () => {
    try {
      const dash = await api.getDashboard();
      // Store the customer's registered phone from the database
      if (dash?.customer?.phone) {
        setCustomerDbPhone(dash.customer.phone);
        if (!phone) setPhone(dash.customer.phone);
      }
      if (dash?.services?.length) {
        setServices(dash.services);
        if (dash.services.length === 1) setSelectedService(dash.services[0]);
      }
      if (dash?.invoices?.length) {
        setAllInvoices(dash.invoices);
        const unpaid = dash.invoices.find(i => i.status !== 'Paid');
        if (unpaid) {
          setInvoice(unpaid);
          if (dash.services?.length === 1) setSelectedService(dash.services[0]);
          else {
            const svc = dash.services?.find(s => s.id === unpaid.serviceId);
            if (svc) setSelectedService(svc);
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load services:', err);
    } finally {
      setFetchingData(false);
    }
  };

  // ── Computed ──
  // Determine price based on billing period
  const getPeriodAmount = () => {
    if (invoice) return invoice.total - (invoice.paidAmount || 0);
    if (!selectedService) return parseFloat(customAmount) || 0;

    if (billingPeriod === 'weekly' && selectedService.weeklyPrice) {
      return selectedService.weeklyPrice;
    }
    if (billingPeriod === 'biweekly' && selectedService.biWeeklyPrice) {
      return selectedService.biWeeklyPrice;
    }
    if (billingPeriod === 'monthly') {
      return selectedService.price || 0;
    }
    // Custom amount fallback
    return parseFloat(customAmount) || 0;
  };
  const amount = getPeriodAmount();

  // Check if service has alternate pricing
  const hasWeekly = selectedService?.weeklyPrice > 0;
  const hasBiWeekly = selectedService?.biWeeklyPrice > 0;
  const hasAlternatePricing = hasWeekly || hasBiWeekly;
  const serviceId = selectedService?.id || invoice?.serviceId || null;
  const hasMultipleServices = services.length > 1;
  // Account reference uses the customer's registered DB phone (not the M-Pesa phone)
  const dbPhone = String(customerDbPhone).replace(/\D/g, '');
  const accountRef = serviceId
    ? `${dbPhone}#${serviceId}`
    : `HOMELINK-PAY`;

  // ── Pay ──
  const handlePay = async () => {
    if (!phone || phone.length < 10) {
      Alert.alert('Invalid Phone', 'Please enter a valid M-Pesa phone number');
      return;
    }
    if (amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter an amount to pay');
      return;
    }
    if (hasMultipleServices && !selectedService) {
      Alert.alert('Select Service', 'Please select which service you are paying for');
      return;
    }

    setLoading(true);
    setStep('pending');
    setCheckCount(0);

    try {
      console.log(`[PAY] Initiating: invoice=${invoice?.id}, amount=${amount}, phone=${phone}, serviceId=${serviceId}, ref=${accountRef}`);
      const result = await api.initiatePayment(invoice?.id, amount, phone, serviceId);

      if (!result.success) {
        Alert.alert('Payment Failed', result.error || 'Could not initiate payment');
        setStep('failed');
        return;
      }

      // Poll for result (up to 8 checks, 5s apart = 40s total)
      // Customer needs time to see STK prompt, enter PIN, and M-Pesa to process
      let finalStatus = null;
      for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 5000));
        setCheckCount(i + 1);
        try {
          const status = await api.checkPaymentStatus(result.checkoutRequestId);
          if (status.status === 'completed') {
            finalStatus = status;
            break;
          } else if (status.status === 'cancelled') {
            setStep('failed');
            return;
          } else if (status.status === 'timeout') {
            setStep('failed');
            return;
          } else if (status.status === 'failed') {
            // Only treat as failed on last attempt — early queries can misreport
            if (i >= 4) {
              setStep('failed');
              return;
            }
          }
          // status is 'pending' or 'unknown' — keep polling
        } catch { /* continue polling */ }
      }

      if (finalStatus) {
        setTransId(finalStatus.trans_id || '');
        setStep('success');
      } else {
        setStep('pending_manual');
      }
    } catch (err) {
      console.warn('Payment error:', err);
      setStep('failed');
    } finally {
      setLoading(false);
    }
  };

  // ── Loading state ──
  if (fetchingData) {
    return (
      <View style={styles.containerCenter}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading account info...</Text>
      </View>
    );
  }

  // ═══ CONFIRM STEP ═══
  if (step === 'confirm') {
    return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
        }
      >
        {/* M-Pesa Header */}
        <View style={styles.mpesaHeader}>
          <View style={styles.mpesaIcon}>
            <Text style={styles.mpesaLogo}>M</Text>
          </View>
          <Text style={styles.mpesaTitle}>M-Pesa Payment</Text>
        </View>

        {/* ── Service Dropdown (multi-service customers) ── */}
        {hasMultipleServices && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionLabel}>
              <Ionicons name="server-outline" size={14} color={COLORS.primary} />
              {'  '}Select Service to Pay For
            </Text>
            <TouchableOpacity
              style={[styles.dropdown, selectedService && styles.dropdownSelected]}
              onPress={() => setDropdownOpen(true)}
              activeOpacity={0.7}
            >
              {selectedService ? (
                <View style={styles.dropdownValue}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.dropdownServiceName}>{selectedService.planName}</Text>
                      <View style={[styles.statusDot, {
                        backgroundColor: (selectedService.connectionStatus === 'online' || selectedService.status === 'Active')
                          ? COLORS.success : COLORS.danger
                      }]} />
                    </View>
                    <Text style={styles.dropdownServiceDetail}>
                      {selectedService.mikrotikName || 'PPPoE'} • KSh {selectedService.price?.toLocaleString()}/mo • #{selectedService.id}
                    </Text>
                  </View>
                  <Ionicons name="chevron-down" size={20} color={COLORS.textMuted} />
                </View>
              ) : (
                <View style={styles.dropdownPlaceholder}>
                  <Text style={styles.dropdownPlaceholderText}>Tap to select a service...</Text>
                  <Ionicons name="chevron-down" size={20} color={COLORS.textMuted} />
                </View>
              )}
            </TouchableOpacity>

            {/* Dropdown Modal */}
            <Modal
              visible={dropdownOpen}
              transparent
              animationType="fade"
              onRequestClose={() => setDropdownOpen(false)}
            >
              <TouchableOpacity
                style={styles.modalOverlay}
                activeOpacity={1}
                onPress={() => setDropdownOpen(false)}
              >
                <View style={styles.modalContent}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Select Service</Text>
                    <TouchableOpacity onPress={() => setDropdownOpen(false)}>
                      <Ionicons name="close" size={22} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <FlatList
                    data={services}
                    keyExtractor={svc => String(svc.id)}
                    renderItem={({ item: svc }) => {
                      const isActive = selectedService?.id === svc.id;
                      const isOnline = svc.connectionStatus === 'online' || svc.status === 'Active';
                      const svcUnpaid = allInvoices.find(i => i.serviceId === svc.id && i.status !== 'Paid');
                      return (
                        <TouchableOpacity
                          style={[styles.modalOption, isActive && styles.modalOptionActive]}
                          onPress={() => {
                            setSelectedService(svc);
                            setBillingPeriod('monthly');
                            if (svcUnpaid) {
                              setInvoice(svcUnpaid);
                              setCustomAmount('');
                            } else {
                              setInvoice(null);
                              setCustomAmount('');
                            }
                            setDropdownOpen(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={[styles.modalServiceName, isActive && { color: COLORS.primary }]}>
                                {svc.planName}
                              </Text>
                              <View style={[styles.statusDot, { backgroundColor: isOnline ? COLORS.success : COLORS.danger }]} />
                            </View>
                            <Text style={styles.modalServiceDetail}>
                              {svc.mikrotikName || 'PPPoE'} • KSh {svc.price?.toLocaleString()}/mo
                            </Text>
                            {svcUnpaid && (
                              <Text style={styles.modalServiceUnpaid}>
                                Unpaid: KSh {(svcUnpaid.total - (svcUnpaid.paidAmount || 0)).toLocaleString()}
                              </Text>
                            )}
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.modalServiceId}>#{svc.id}</Text>
                            {isActive && <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />}
                          </View>
                        </TouchableOpacity>
                      );
                    }}
                  />
                </View>
              </TouchableOpacity>
            </Modal>
          </View>
        )}

        {/* ── Single service display ── */}
        {!hasMultipleServices && selectedService && (
          <View style={styles.singleServiceBar}>
            <Ionicons name="server-outline" size={16} color={COLORS.primary} />
            <Text style={styles.singleServiceText}>
              {selectedService.planName} • {selectedService.mikrotikName || 'PPPoE'}
            </Text>
            <View style={[styles.statusDot, {
              backgroundColor: (selectedService.connectionStatus === 'online' || selectedService.status === 'Active')
                ? COLORS.success : COLORS.danger
            }]} />
          </View>
        )}

        {/* ── Billing Period Selector ── */}
        {!invoice && selectedService && hasAlternatePricing && (
          <View style={styles.periodCard}>
            <Text style={styles.periodTitle}>
              <Ionicons name="calendar-outline" size={14} color={COLORS.primary} />
              {'  '}Choose Payment Period
            </Text>
            <View style={styles.periodOptions}>
              {hasWeekly && (
                <TouchableOpacity
                  style={[styles.periodOption, billingPeriod === 'weekly' && styles.periodOptionActive]}
                  onPress={() => { setBillingPeriod('weekly'); setCustomAmount(''); }}
                  activeOpacity={0.7}
                >
                  <View style={styles.periodRadio}>
                    {billingPeriod === 'weekly' && <View style={styles.periodRadioDot} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.periodLabel, billingPeriod === 'weekly' && styles.periodLabelActive]}>Weekly</Text>
                    <Text style={styles.periodDays}>7 days</Text>
                  </View>
                  <Text style={[styles.periodPrice, billingPeriod === 'weekly' && styles.periodPriceActive]}>
                    KSh {selectedService.weeklyPrice.toLocaleString()}
                  </Text>
                </TouchableOpacity>
              )}
              {hasBiWeekly && (
                <TouchableOpacity
                  style={[styles.periodOption, billingPeriod === 'biweekly' && styles.periodOptionActive]}
                  onPress={() => { setBillingPeriod('biweekly'); setCustomAmount(''); }}
                  activeOpacity={0.7}
                >
                  <View style={styles.periodRadio}>
                    {billingPeriod === 'biweekly' && <View style={styles.periodRadioDot} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.periodLabel, billingPeriod === 'biweekly' && styles.periodLabelActive]}>Bi-Weekly</Text>
                    <Text style={styles.periodDays}>14 days</Text>
                  </View>
                  <Text style={[styles.periodPrice, billingPeriod === 'biweekly' && styles.periodPriceActive]}>
                    KSh {selectedService.biWeeklyPrice.toLocaleString()}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.periodOption, billingPeriod === 'monthly' && styles.periodOptionActive]}
                onPress={() => { setBillingPeriod('monthly'); setCustomAmount(''); }}
                activeOpacity={0.7}
              >
                <View style={styles.periodRadio}>
                  {billingPeriod === 'monthly' && <View style={styles.periodRadioDot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.periodLabel, billingPeriod === 'monthly' && styles.periodLabelActive]}>Monthly</Text>
                  <Text style={styles.periodDays}>30 days</Text>
                </View>
                <Text style={[styles.periodPrice, billingPeriod === 'monthly' && styles.periodPriceActive]}>
                  KSh {(selectedService.price || 0).toLocaleString()}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Invoice Summary ── */}
        {invoice ? (
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Invoice</Text>
              <Text style={styles.summaryValue}>INV-{String(invoice.id).padStart(4, '0')}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Due Date</Text>
              <Text style={styles.summaryValue}>
                {invoice.dueDate
                  ? new Date(invoice.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                  : 'N/A'}
              </Text>
            </View>
            {(invoice.paidAmount || 0) > 0 && (
              <>
                <View style={styles.divider} />
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Already Paid</Text>
                  <Text style={[styles.summaryValue, { color: COLORS.success }]}>
                    KSh {(invoice.paidAmount || 0).toLocaleString()}
                  </Text>
                </View>
              </>
            )}
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.amountLabel}>Amount to Pay</Text>
              <Text style={styles.amountValue}>KSh {amount.toLocaleString()}</Text>
            </View>
          </View>
        ) : selectedService ? (
          /* ── Payment Amount (period-selected or custom) ── */
          <View style={styles.summaryCard}>
            <Text style={styles.sectionLabel}>
              <Ionicons name="cash-outline" size={14} color={COLORS.primary} />
              {'  '}Payment Amount
            </Text>
            {hasAlternatePricing ? (
              <>
                <View style={styles.selectedAmountWrap}>
                  <Text style={styles.selectedAmountLabel}>
                    {billingPeriod === 'weekly' ? 'Weekly' : billingPeriod === 'biweekly' ? 'Bi-Weekly' : 'Monthly'} Payment
                  </Text>
                  <Text style={styles.amountValue}>KSh {amount.toLocaleString()}</Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.amountInputWrap}>
                  <Text style={styles.amountPrefix}>KSh</Text>
                  <TextInput
                    style={styles.amountInput}
                    value={customAmount}
                    onChangeText={setCustomAmount}
                    placeholder="0"
                    keyboardType="numeric"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>
                <Text style={styles.hintText}>
                  Enter the amount you'd like to pay toward this service.
                </Text>
              </>
            )}
          </View>
        ) : null}

        {/* ── Account Reference ── */}
        {(dbPhone || serviceId) && (
          <View style={styles.refCard}>
            <View style={styles.refHeader}>
              <Ionicons name="receipt-outline" size={16} color={COLORS.primary} />
              <Text style={styles.refTitle}>Account Reference</Text>
            </View>
            <Text style={styles.refValue}>{accountRef}</Text>
            {serviceId ? (
              <Text style={styles.refBreakdown}>
                {dbPhone} (Phone) # {serviceId} (Service ID)
              </Text>
            ) : (
              <Text style={styles.refBreakdown}>Select a service to generate account reference</Text>
            )}
          </View>
        )}

        {/* ── Phone Input ── */}
        <Text style={styles.inputLabel}>M-Pesa Phone Number</Text>
        <View style={styles.phoneInputRow}>
          <View style={styles.flagBox}>
            <Text style={{ fontSize: 18 }}>🇰🇪</Text>
          </View>
          <TextInput
            style={styles.phoneInput}
            value={phone}
            onChangeText={setPhone}
            placeholder="0712345678"
            keyboardType="phone-pad"
            placeholderTextColor={COLORS.textMuted}
          />
        </View>
        <Text style={styles.hintText}>
          An STK push will be sent to this number. Enter your M-Pesa PIN to complete.
        </Text>

        {/* ── Pay Button ── */}
        <TouchableOpacity
          style={[styles.payBtn, (amount <= 0 || (hasMultipleServices && !selectedService)) && styles.payBtnDisabled]}
          onPress={handlePay}
          disabled={amount <= 0 || (hasMultipleServices && !selectedService)}
        >
          <Ionicons name="phone-portrait-outline" size={20} color="#fff" />
          <Text style={styles.payBtnText}>
            Pay KSh {amount > 0 ? amount.toLocaleString() : '—'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
    );
  }

  // --- PENDING STEP ---
  if (step === 'pending') {
    return (
      <View style={styles.containerCenter}>
        <View style={styles.pendingCircle}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
        <Text style={styles.pendingTitle}>Waiting for payment...</Text>
        <Text style={styles.pendingText}>
          Check your phone for the M-Pesa STK push prompt.{'\n'}Enter your PIN to confirm.
        </Text>
        <View style={styles.stepIndicator}>
          <StepDot active label="STK Sent" />
          <View style={styles.stepLine} />
          <StepDot label="Enter PIN" />
          <View style={styles.stepLine} />
          <StepDot label="Confirmed" />
        </View>
      </View>
    );
  }

  // --- SUCCESS STEP ---
  if (step === 'success') {
    return (
      <View style={styles.containerCenter}>
        <View style={styles.successCircle}>
          <Ionicons name="checkmark" size={48} color="#fff" />
        </View>
        <Text style={styles.successTitle}>Payment Successful!</Text>
        <Text style={styles.successAmount}>KSh {amount.toLocaleString()}</Text>

        <View style={styles.receiptCard}>
          <ReceiptRow label="Transaction ID" value={transId} />
          <ReceiptRow label="Invoice" value={`#${invoice?.id}`} />
          <ReceiptRow label="Amount" value={`KSh ${amount.toLocaleString()}`} />
          <ReceiptRow label="Phone" value={phone} />
          <ReceiptRow label="Date" value={new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} />
        </View>

        <TouchableOpacity
          style={styles.doneBtn}
          onPress={() => navigation.popToTop()}
        >
          <Text style={styles.doneBtnText}>Back to Dashboard</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- FAILED STEP ---
  return (
    <View style={styles.containerCenter}>
      <View style={styles.failCircle}>
        <Ionicons name="close" size={48} color="#fff" />
      </View>
      <Text style={styles.failTitle}>Payment Failed</Text>
      <Text style={styles.failText}>
        The payment could not be completed. This may happen if you cancelled the STK push or entered the wrong PIN.
      </Text>
      <TouchableOpacity style={styles.retryBtn} onPress={() => setStep('confirm')}>
        <Text style={styles.retryBtnText}>Try Again</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.cancelLink}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

function StepDot({ active, label }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={[sdStyles.dot, active && sdStyles.dotActive]} />
      <Text style={[sdStyles.label, active && sdStyles.labelActive]}>{label}</Text>
    </View>
  );
}

function ReceiptRow({ label, value }) {
  return (
    <View style={rStyles.row}>
      <Text style={rStyles.label}>{label}</Text>
      <Text style={rStyles.value}>{value}</Text>
    </View>
  );
}

const sdStyles = StyleSheet.create({
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.border, marginBottom: 6 },
  dotActive: { backgroundColor: COLORS.primary },
  label: { fontSize: 11, color: COLORS.textMuted },
  labelActive: { color: COLORS.primary, fontWeight: '600' },
});

const rStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  label: { fontSize: SIZES.body, color: COLORS.textSecondary },
  value: { fontSize: SIZES.body, fontWeight: '600', color: COLORS.text },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  containerCenter: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center', padding: SIZES.lg },
  content: { padding: SIZES.lg },

  mpesaHeader: { alignItems: 'center', marginBottom: SIZES.xl, marginTop: SIZES.md },
  mpesaIcon: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.accent,
    justifyContent: 'center', alignItems: 'center', marginBottom: SIZES.sm,
  },
  mpesaLogo: { fontSize: 28, fontWeight: '800', color: '#fff' },
  mpesaTitle: { fontSize: SIZES.subtitle, fontWeight: '700', color: COLORS.text },

  summaryCard: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusLg,
    padding: SIZES.lg, marginBottom: SIZES.lg, ...SHADOWS.medium,
  },
  summaryLabel: { fontSize: SIZES.caption, color: COLORS.textMuted, marginBottom: 4 },
  summaryValue: { fontSize: SIZES.body, fontWeight: '600', color: COLORS.text },
  divider: { height: 1, backgroundColor: COLORS.borderLight, marginVertical: SIZES.sm },
  amountLabel: { fontSize: SIZES.body, color: COLORS.textSecondary, marginBottom: 4 },
  amountValue: { fontSize: SIZES.heading, fontWeight: '700', color: COLORS.primary },

  inputLabel: { fontSize: SIZES.body, fontWeight: '600', color: COLORS.text, marginBottom: SIZES.sm },
  phoneInputRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface,
    borderRadius: SIZES.radius, borderWidth: 1.5, borderColor: COLORS.border, ...SHADOWS.small,
  },
  flagBox: { paddingHorizontal: SIZES.md, borderRightWidth: 1, borderRightColor: COLORS.border, paddingVertical: SIZES.md },
  phoneInput: { flex: 1, fontSize: SIZES.bodyLg, paddingHorizontal: SIZES.md, paddingVertical: SIZES.md, color: COLORS.text },
  hintText: { fontSize: SIZES.caption, color: COLORS.textMuted, marginTop: SIZES.sm, lineHeight: 18 },

  // Account Reference
  refCard: {
    backgroundColor: COLORS.primaryBg, borderRadius: SIZES.radius,
    padding: SIZES.md, marginBottom: SIZES.lg, borderWidth: 1, borderColor: COLORS.primary + '30',
  },
  refHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SIZES.xs,
  },
  refTitle: { fontSize: SIZES.caption, fontWeight: '600', color: COLORS.primary },
  refValue: { fontSize: SIZES.bodyLg, fontWeight: '700', color: COLORS.text, marginBottom: 4, letterSpacing: 0.5 },
  refBreakdown: { fontSize: SIZES.caption, color: COLORS.textMuted },

  payBtn: {
    backgroundColor: COLORS.accent, borderRadius: SIZES.radius,
    paddingVertical: 16, flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', gap: 8, marginTop: SIZES.xl, ...SHADOWS.medium,
  },
  payBtnText: { color: '#fff', fontSize: SIZES.bodyLg, fontWeight: '700' },
  payBtnDisabled: { opacity: 0.5 },

  // Single service bar
  singleServiceBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.primaryBg, borderRadius: SIZES.radius,
    padding: SIZES.md, marginBottom: SIZES.lg,
  },
  singleServiceText: { flex: 1, fontSize: SIZES.body, fontWeight: '600', color: COLORS.text },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  sectionLabel: { fontSize: SIZES.body, fontWeight: '600', color: COLORS.text, marginBottom: SIZES.xs },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 6 },

  // Amount input
  amountInputWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.background,
    borderRadius: SIZES.radius, marginTop: SIZES.sm,
  },
  amountPrefix: { fontSize: SIZES.bodyLg, fontWeight: '700', color: COLORS.textSecondary, paddingHorizontal: SIZES.md },
  amountInput: { flex: 1, fontSize: SIZES.heading, fontWeight: '700', color: COLORS.text, paddingVertical: SIZES.md },

  // Pending
  pendingCircle: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.primaryBg,
    justifyContent: 'center', alignItems: 'center', marginBottom: SIZES.lg,
  },
  pendingTitle: { fontSize: SIZES.title, fontWeight: '700', color: COLORS.text, marginBottom: SIZES.sm },
  pendingText: { fontSize: SIZES.body, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: SIZES.xl },
  stepIndicator: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepLine: { width: 40, height: 2, backgroundColor: COLORS.border },

  // Success
  successCircle: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.success,
    justifyContent: 'center', alignItems: 'center', marginBottom: SIZES.lg,
  },
  successTitle: { fontSize: SIZES.title, fontWeight: '700', color: COLORS.success, marginBottom: SIZES.xs },
  successAmount: { fontSize: SIZES.heading, fontWeight: '700', color: COLORS.text, marginBottom: SIZES.lg },
  receiptCard: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusLg,
    padding: SIZES.lg, width: '100%', ...SHADOWS.medium, marginBottom: SIZES.xl,
  },
  doneBtn: {
    backgroundColor: COLORS.primary, borderRadius: SIZES.radius,
    paddingVertical: 16, paddingHorizontal: SIZES.xxl, ...SHADOWS.medium,
  },
  doneBtnText: { color: '#fff', fontSize: SIZES.bodyLg, fontWeight: '600' },

  // Failed
  failCircle: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.danger,
    justifyContent: 'center', alignItems: 'center', marginBottom: SIZES.lg,
  },
  failTitle: { fontSize: SIZES.title, fontWeight: '700', color: COLORS.danger, marginBottom: SIZES.sm },
  failText: { fontSize: SIZES.body, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: SIZES.xl },
  retryBtn: {
    backgroundColor: COLORS.primary, borderRadius: SIZES.radius,
    paddingVertical: 16, paddingHorizontal: SIZES.xxl, marginBottom: SIZES.md, ...SHADOWS.medium,
  },
  retryBtnText: { color: '#fff', fontSize: SIZES.bodyLg, fontWeight: '600' },
  cancelLink: { fontSize: SIZES.body, color: COLORS.textMuted, marginTop: SIZES.sm },

  // Dropdown
  dropdown: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radius,
    borderWidth: 1.5, borderColor: COLORS.border, marginTop: SIZES.sm,
    ...SHADOWS.small,
  },
  dropdownSelected: { borderColor: COLORS.primary },
  dropdownValue: {
    flexDirection: 'row', alignItems: 'center', padding: SIZES.md,
  },
  dropdownServiceName: { fontSize: SIZES.body, fontWeight: '600', color: COLORS.text },
  dropdownServiceDetail: { fontSize: SIZES.caption, color: COLORS.textMuted, marginTop: 2 },
  dropdownPlaceholder: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: SIZES.md,
  },
  dropdownPlaceholderText: { fontSize: SIZES.body, color: COLORS.textMuted },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', padding: SIZES.lg,
  },
  modalContent: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusLg,
    maxHeight: '70%', ...SHADOWS.large,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SIZES.lg, paddingVertical: SIZES.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  modalTitle: { fontSize: SIZES.bodyLg, fontWeight: '700', color: COLORS.text },
  modalOption: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: SIZES.lg,
    paddingVertical: SIZES.md, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  modalOptionActive: { backgroundColor: COLORS.primaryBg },
  modalServiceName: { fontSize: SIZES.body, fontWeight: '600', color: COLORS.text },
  modalServiceDetail: { fontSize: SIZES.caption, color: COLORS.textMuted, marginTop: 2 },
  modalServiceUnpaid: { fontSize: SIZES.caption, color: COLORS.danger, marginTop: 2, fontWeight: '500' },
  modalServiceId: { fontSize: SIZES.caption, fontWeight: '600', color: COLORS.textMuted, marginBottom: 4 },

  // Billing Period Selector
  periodCard: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusLg,
    padding: SIZES.lg, marginBottom: SIZES.lg, ...SHADOWS.medium,
  },
  periodTitle: { fontSize: SIZES.body, fontWeight: '600', color: COLORS.text, marginBottom: SIZES.md },
  periodOptions: { gap: 8 },
  periodOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: SIZES.md, borderRadius: SIZES.radius,
    borderWidth: 1.5, borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  periodOptionActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryBg,
  },
  periodRadio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: COLORS.border,
    justifyContent: 'center', alignItems: 'center',
  },
  periodRadioDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: COLORS.primary,
  },
  periodLabel: { fontSize: SIZES.body, fontWeight: '600', color: COLORS.text },
  periodLabelActive: { color: COLORS.primary },
  periodDays: { fontSize: SIZES.caption, color: COLORS.textMuted, marginTop: 1 },
  periodPrice: { fontSize: SIZES.bodyLg, fontWeight: '700', color: COLORS.textSecondary },
  periodPriceActive: { color: COLORS.primary },

  // Selected amount display
  selectedAmountWrap: { alignItems: 'center', paddingVertical: SIZES.sm },
  selectedAmountLabel: { fontSize: SIZES.caption, color: COLORS.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600' },
});
