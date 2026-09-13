import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
  ScrollView, Image, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import { useAuth } from '../auth/AuthContext';

const OTP_LENGTH = 6;

export default function OtpScreen({ route, navigation }) {
  const { phone } = route.params;
  const { verifyOtp, loading } = useAuth();
  const [code, setCode] = useState('');
  const [timer, setTimer] = useState(60);
  const hiddenInput = useRef(null);

  // Countdown timer
  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => setTimer(t => t - 1), 1000);
    return () => clearInterval(interval);
  }, [timer]);

  const handleChange = (text) => {
    const digits = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
    setCode(digits);
    if (digits.length === OTP_LENGTH) handleVerify(digits);
  };

  const handleVerify = async (fullCode) => {
    const otp = fullCode || code;
    if (otp.length !== OTP_LENGTH) {
      Alert.alert('Invalid Code', 'Please enter the full 6-digit code');
      return;
    }
    const result = await verifyOtp(phone, otp);
    if (result.success) {
      if (result.needsPassword) {
        navigation.replace('SetPassword', {
          tempToken: result.tempToken,
          userName: result.user?.name || '',
        });
      }
    } else {
      Alert.alert('Verification Failed', result.error || 'Invalid code');
      setCode('');
      hiddenInput.current?.focus();
    }
  };

  const handleResend = async () => {
    setTimer(60);
    Alert.alert('OTP Resent', 'A new code has been sent to ' + phone);
  };

  const maskedPhone = phone.slice(0, 4) + '****' + phone.slice(-2);

  const formatTimer = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const digits = code.split('');

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={styles.logoSection}>
          <Image
            source={require('../../assets/logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.title}>Verify Phone Number</Text>
          <Text style={styles.subtitle}>
            Enter the 6-digit code sent to {maskedPhone}
          </Text>

          <Text style={styles.label}>Verification Code</Text>

          {/* Hidden real input */}
          <TextInput
            ref={hiddenInput}
            value={code}
            onChangeText={handleChange}
            keyboardType="number-pad"
            maxLength={OTP_LENGTH}
            autoComplete="sms-otp"
            textContentType="oneTimeCode"
            style={styles.hiddenInput}
            autoFocus
          />

          {/* Display boxes */}
          <Pressable style={styles.otpRow} onPress={() => hiddenInput.current?.focus()}>
            {Array.from({ length: OTP_LENGTH }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.otpBox,
                  digits[i] ? styles.otpBoxFilled : null,
                  i === digits.length && styles.otpBoxActive,
                ]}
              >
                <Text style={[styles.otpDigit, digits[i] && styles.otpDigitFilled]}>
                  {digits[i] || ''}
                </Text>
              </View>
            ))}
          </Pressable>

          <Text style={styles.helpText}>
            Code expires in <Text style={styles.timerHighlight}>{formatTimer(timer > 0 ? timer : 0)}</Text>
          </Text>

          {/* Verify Button */}
          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={() => handleVerify()}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={styles.btnContent}>
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.btnText}>Verify & Continue</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Footer */}
          <View style={styles.footer}>
            <View style={styles.resendRow}>
              <Text style={styles.footerText}>Didn't receive the code? </Text>
              {timer > 0 ? (
                <Text style={styles.footerTextMuted}>Resend in {timer}s</Text>
              ) : (
                <TouchableOpacity onPress={handleResend}>
                  <Text style={styles.resendLink}>Resend</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={styles.backLink}>← Go back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 40,
  },

  // Logo
  logoSection: {
    alignItems: 'center',
    marginBottom: SIZES.xl,
  },
  logoImage: {
    height: 70,
    width: 200,
  },

  // Card
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 6,
  },

  // Header
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginBottom: SIZES.xl,
    lineHeight: 24,
  },

  // Form
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
    marginBottom: 8,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: SIZES.sm,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 0,
    width: 0,
  },
  otpBox: {
    width: 44,
    height: 50,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxFilled: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryBg,
  },
  otpBoxActive: {
    borderColor: COLORS.primary,
  },
  otpDigit: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  otpDigitFilled: {
    color: COLORS.primary,
  },
  helpText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: SIZES.lg,
    lineHeight: 18,
  },
  timerHighlight: {
    fontWeight: '600',
    color: COLORS.primary,
  },

  // Button
  btn: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    backgroundColor: COLORS.primary,
    shadowColor: '#F58220',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  btnDisabled: {
    backgroundColor: COLORS.textMuted,
    shadowOpacity: 0,
    elevation: 0,
  },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Footer
  footer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SIZES.lg,
    marginTop: SIZES.lg,
    alignItems: 'center',
  },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SIZES.sm,
  },
  footerText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  footerTextMuted: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  resendLink: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
  },
  backLink: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '500',
  },

  // Hint
  hintText: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SIZES.lg,
    fontStyle: 'italic',
  },
});
