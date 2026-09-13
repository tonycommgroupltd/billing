// ============================================
// HOMELINK Customer App — Forgot Password Screen
// 3-step flow: Phone → OTP → New Password
// ============================================
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
  ActivityIndicator, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';

export default function ForgotPasswordScreen({ navigation }) {
  const { login: authLogin } = useAuth();

  // Step control: 1=phone, 2=otp, 3=new password
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1 - Phone
  const [phone, setPhone] = useState('');

  // Step 2 - OTP
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [timer, setTimer] = useState(0);
  const [maskedPhone, setMaskedPhone] = useState('');
  const otpRefs = useRef([]);

  // Step 3 - New password
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Countdown timer for resend
  useEffect(() => {
    if (timer <= 0) return;
    const id = setInterval(() => setTimer(t => t - 1), 1000);
    return () => clearInterval(id);
  }, [timer]);

  // ── Step 1: Request OTP ──
  const handleRequestOtp = async () => {
    const cleaned = phone.replace(/\s/g, '');
    if (!cleaned || cleaned.length < 9) {
      Alert.alert('Invalid Phone', 'Please enter a valid phone number');
      return;
    }

    setLoading(true);
    try {
      const result = await api.forgotPassword(cleaned);
      if (result.success) {
        const mask = cleaned.length > 4
          ? cleaned.slice(0, -4).replace(/./g, '*') + cleaned.slice(-4)
          : cleaned;
        setMaskedPhone(result.message || `Code sent to ${mask}`);
        setTimer(60); // 60s cooldown for resend
        setStep(2);
        // Focus first OTP input
        setTimeout(() => otpRefs.current[0]?.focus(), 300);
      } else {
        Alert.alert('Error', result.error || 'Failed to send verification code');
      }
    } catch (err) {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: OTP input helpers ──
  const handleOtpChange = (text, index) => {
    const newOtp = [...otp];
    // Handle paste of full code
    if (text.length > 1) {
      const digits = text.replace(/\D/g, '').slice(0, 6).split('');
      digits.forEach((d, i) => { if (i < 6) newOtp[i] = d; });
      setOtp(newOtp);
      const lastFilled = Math.min(digits.length, 5);
      otpRefs.current[lastFilled]?.focus();
      return;
    }
    newOtp[index] = text;
    setOtp(newOtp);
    if (text && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
      const newOtp = [...otp];
      newOtp[index - 1] = '';
      setOtp(newOtp);
    }
  };

  const handleVerifyAndContinue = () => {
    const code = otp.join('');
    if (code.length !== 6) {
      Alert.alert('Invalid Code', 'Please enter the 6-digit verification code');
      return;
    }
    // Move to step 3 (password entry) — we'll verify OTP + reset in one call
    setStep(3);
  };

  const handleResendOtp = async () => {
    if (timer > 0) return;
    setLoading(true);
    try {
      const result = await api.forgotPassword(phone.replace(/\s/g, ''));
      if (result.success) {
        setTimer(60);
        setOtp(['', '', '', '', '', '']);
        Alert.alert('Code Sent', 'A new verification code has been sent to your phone.');
      } else {
        Alert.alert('Error', result.error || 'Failed to resend code');
      }
    } catch {
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Reset Password ──
  const handleResetPassword = async () => {
    if (!password || password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Mismatch', 'Passwords do not match');
      return;
    }

    const code = otp.join('');
    setLoading(true);
    try {
      const result = await api.resetPassword(phone.replace(/\s/g, ''), code, password);
      if (result.success) {
        Alert.alert(
          'Password Reset!',
          'Your password has been reset successfully. You are now logged in.',
          [{ text: 'OK' }]
        );
        // If we got user data back, the AuthContext's resetPassword from client already stored tokens
        // We need to update the auth state
        if (result.user) {
          // Navigate will happen automatically when AuthContext detects the stored tokens
          // Force a re-check by navigating to login which will detect stored session
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        }
      } else {
        // If OTP was wrong, go back to step 2
        if (result.error?.includes('Invalid verification') || result.error?.includes('No valid code')) {
          setStep(2);
          setOtp(['', '', '', '', '', '']);
        }
        Alert.alert('Error', result.error || 'Failed to reset password');
      }
    } catch (err) {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Render ──
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Back button */}
        <TouchableOpacity style={styles.backBtn} onPress={() => {
          if (step > 1) {
            setStep(step - 1);
          } else {
            navigation.goBack();
          }
        }}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>

        {/* Logo */}
        <Image
          source={require('../../assets/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        {/* Step indicator */}
        <View style={styles.stepRow}>
          {[1, 2, 3].map(s => (
            <View key={s} style={styles.stepItem}>
              <View style={[styles.stepCircle, step >= s && styles.stepCircleActive]}>
                {step > s ? (
                  <Ionicons name="checkmark" size={14} color="#fff" />
                ) : (
                  <Text style={[styles.stepNum, step >= s && styles.stepNumActive]}>{s}</Text>
                )}
              </View>
              <Text style={[styles.stepLabel, step >= s && styles.stepLabelActive]}>
                {s === 1 ? 'Phone' : s === 2 ? 'Verify' : 'Password'}
              </Text>
              {s < 3 && <View style={[styles.stepLine, step > s && styles.stepLineActive]} />}
            </View>
          ))}
        </View>

        {/* ── STEP 1: Phone Number ── */}
        {step === 1 && (
          <View style={styles.card}>
            <View style={styles.iconHeader}>
              <View style={styles.iconCircle}>
                <Ionicons name="lock-closed-outline" size={28} color={COLORS.primary} />
              </View>
            </View>
            <Text style={styles.title}>Forgot Password?</Text>
            <Text style={styles.subtitle}>
              Enter your registered phone number and we'll send you a verification code to reset your password.
            </Text>

            <Text style={styles.label}>Phone Number</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="call-outline" size={20} color={COLORS.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="e.g. 0712345678"
                placeholderTextColor="#A0AEC0"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                maxLength={13}
                autoFocus
              />
            </View>

            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleRequestOtp}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Send Verification Code</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.linkRow} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back-outline" size={16} color={COLORS.primary} />
              <Text style={styles.linkText}>Back to Sign In</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── STEP 2: OTP Verification ── */}
        {step === 2 && (
          <View style={styles.card}>
            <View style={styles.iconHeader}>
              <View style={styles.iconCircle}>
                <Ionicons name="shield-checkmark-outline" size={28} color={COLORS.primary} />
              </View>
            </View>
            <Text style={styles.title}>Verify Your Phone</Text>
            <Text style={styles.subtitle}>{maskedPhone}</Text>

            <Text style={styles.label}>Enter 6-digit code</Text>
            <View style={styles.otpRow}>
              {otp.map((digit, i) => (
                <TextInput
                  key={i}
                  ref={r => otpRefs.current[i] = r}
                  style={[styles.otpBox, digit && styles.otpBoxFilled]}
                  value={digit}
                  onChangeText={t => handleOtpChange(t, i)}
                  onKeyPress={e => handleOtpKeyPress(e, i)}
                  keyboardType="number-pad"
                  maxLength={1}
                  selectTextOnFocus
                />
              ))}
            </View>

            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleVerifyAndContinue}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Continue</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkRow}
              onPress={handleResendOtp}
              disabled={timer > 0}
            >
              <Ionicons name="refresh-outline" size={16} color={timer > 0 ? COLORS.textMuted : COLORS.primary} />
              <Text style={[styles.linkText, timer > 0 && { color: COLORS.textMuted }]}>
                {timer > 0 ? `Resend in ${timer}s` : 'Resend Code'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── STEP 3: New Password ── */}
        {step === 3 && (
          <View style={styles.card}>
            <View style={styles.iconHeader}>
              <View style={styles.iconCircle}>
                <Ionicons name="key-outline" size={28} color={COLORS.primary} />
              </View>
            </View>
            <Text style={styles.title}>Set New Password</Text>
            <Text style={styles.subtitle}>
              Choose a strong password with at least 6 characters.
            </Text>

            <Text style={styles.label}>New Password</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={20} color={COLORS.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter new password"
                placeholderTextColor="#A0AEC0"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                autoFocus
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.label, { marginTop: 16 }]}>Confirm Password</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={20} color={COLORS.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Confirm new password"
                placeholderTextColor="#A0AEC0"
                secureTextEntry={!showConfirm}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
              <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={styles.eyeBtn}>
                <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Password strength hints */}
            <View style={styles.hintRow}>
              <Ionicons
                name={password.length >= 6 ? 'checkmark-circle' : 'ellipse-outline'}
                size={16}
                color={password.length >= 6 ? '#059669' : COLORS.textMuted}
              />
              <Text style={[styles.hintText, password.length >= 6 && { color: '#059669' }]}>
                At least 6 characters
              </Text>
            </View>
            <View style={styles.hintRow}>
              <Ionicons
                name={password && password === confirmPassword ? 'checkmark-circle' : 'ellipse-outline'}
                size={16}
                color={password && password === confirmPassword ? '#059669' : COLORS.textMuted}
              />
              <Text style={[styles.hintText, password && password === confirmPassword && { color: '#059669' }]}>
                Passwords match
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleResetPassword}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Reset Password</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { flexGrow: 1, padding: 20, paddingTop: 50 },

  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center',
    marginBottom: 16, elevation: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3,
  },
  logo: { width: 120, height: 40, alignSelf: 'center', marginBottom: 24 },

  // Step indicator
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  stepItem: { flexDirection: 'row', alignItems: 'center' },
  stepCircle: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center',
  },
  stepCircleActive: { backgroundColor: COLORS.primary },
  stepNum: { fontSize: 12, fontWeight: '700', color: '#94A3B8' },
  stepNumActive: { color: '#fff' },
  stepLabel: { fontSize: 11, color: '#94A3B8', marginLeft: 4, fontWeight: '600' },
  stepLabelActive: { color: COLORS.primary },
  stepLine: { width: 30, height: 2, backgroundColor: '#E2E8F0', marginHorizontal: 6 },
  stepLineActive: { backgroundColor: COLORS.primary },

  // Card
  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24,
    elevation: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12,
  },
  iconHeader: { alignItems: 'center', marginBottom: 16 },
  iconCircle: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center',
  },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 24 },

  // Inputs
  label: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F8FAFC', borderRadius: 14, borderWidth: 1.5, borderColor: '#E2E8F0',
    paddingHorizontal: 14, height: 52, marginBottom: 8,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, color: COLORS.text },
  eyeBtn: { padding: 8 },

  // OTP
  otpRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 24, gap: 8 },
  otpBox: {
    width: 44, height: 50, borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC', textAlign: 'center', fontSize: 20, fontWeight: '700', color: COLORS.text,
  },
  otpBoxFilled: { borderColor: COLORS.primary, backgroundColor: '#EEF2FF' },

  // Button
  btn: {
    backgroundColor: COLORS.primary, borderRadius: 14, height: 52,
    justifyContent: 'center', alignItems: 'center', marginTop: 16,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Links
  linkRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: 6, marginTop: 16, paddingVertical: 8,
  },
  linkText: { fontSize: 14, fontWeight: '600', color: COLORS.primary },

  // Password hints
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  hintText: { fontSize: 13, color: COLORS.textMuted },
});
