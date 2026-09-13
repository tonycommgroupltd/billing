import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import { useAuth } from '../auth/AuthContext';
import api from '../api/client';

export default function PaymentScreen({ route, navigation }) {
  const { invoice } = route.params || {};
  const { user } = useAuth();
  const [phone, setPhone] = useState(user?.phone_number || '');
  const [step, setStep] = useState('confirm'); // confirm | pending | success | failed
  const [loading, setLoading] = useState(false);
  const [transId, setTransId] = useState('');
  const [checkoutId, setCheckoutId] = useState('');

  const amount = invoice?.total || 0;

  const handlePay = async () => {
    if (!phone || phone.length < 10) {
      Alert.alert('Invalid Phone', 'Please enter a valid M-Pesa phone number');
      return;
    }

    setLoading(true);
    setStep('pending');

    try {
      // Step 1: Initiate STK Push (with serviceId for account reference)
      const result = await api.initiatePayment(invoice?.id, amount, phone, invoice?.serviceId);
      if (!result.success) {
        setStep('failed');
        return;
      }
      setCheckoutId(result.checkout_request_id);

      // Step 2: Poll for result (in real app, also listen for push notification)
      await new Promise(r => setTimeout(r, 3000)); // Wait 3s before checking
      const status = await api.checkPaymentStatus(result.checkout_request_id);

      if (status.status === 'completed') {
        setTransId(status.trans_id);
        setStep('success');
      } else {
        setStep('failed');
      }
    } catch (err) {
      console.warn('Payment error:', err);
      setStep('failed');
    } finally {
      setLoading(false);
    }
  };

  // --- CONFIRM STEP ---
  if (step === 'confirm') {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          {/* M-Pesa Logo */}
          <View style={styles.mpesaHeader}>
            <View style={styles.mpesaIcon}>
              <Text style={styles.mpesaLogo}>M</Text>
            </View>
            <Text style={styles.mpesaTitle}>M-Pesa Payment</Text>
          </View>

          {/* Invoice Summary */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Invoice</Text>
            <Text style={styles.summaryValue}>#{invoice?.id}</Text>

            <View style={styles.divider} />

            <Text style={styles.summaryLabel}>Description</Text>
            <Text style={styles.summaryValue}>
              {invoice?.details?.[0]?.name || 'Internet Service'}
            </Text>

            <View style={styles.divider} />

            <Text style={styles.summaryLabel}>Due Date</Text>
            <Text style={styles.summaryValue}>
              {invoice?.due_date ? new Date(invoice.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A'}
            </Text>

            <View style={styles.divider} />

            <Text style={styles.amountLabel}>Amount to Pay</Text>
            <Text style={styles.amountValue}>KSh {amount.toLocaleString()}</Text>
          </View>

          {/* Phone Input */}
          <Text style={styles.inputLabel}>M-Pesa Phone Number</Text>
          <View style={styles.phoneInputRow}>
            <View style={styles.flagBox}>
              <Text style={{ fontSize: 18 }}>🇰🇪</Text>
            </View>
            <TextInput
              style={styles.phoneInput}
              value={phone}
              onChangeText={setPhone}
              placeholder="0726150925"
              keyboardType="phone-pad"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>
          <Text style={styles.hintText}>
            An STK push will be sent to this number. Enter your M-Pesa PIN to complete payment.
          </Text>

          {/* Pay Button */}
          <TouchableOpacity style={styles.payBtn} onPress={handlePay}>
            <Ionicons name="phone-portrait-outline" size={20} color="#fff" />
            <Text style={styles.payBtnText}>Pay KSh {amount.toLocaleString()}</Text>
          </TouchableOpacity>
        </View>
      </View>
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
          onPress={() => navigation.navigate('Dashboard')}
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

  payBtn: {
    backgroundColor: COLORS.accent, borderRadius: SIZES.radius,
    paddingVertical: 16, flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', gap: 8, marginTop: SIZES.xl, ...SHADOWS.medium,
  },
  payBtnText: { color: '#fff', fontSize: SIZES.bodyLg, fontWeight: '700' },

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
});
