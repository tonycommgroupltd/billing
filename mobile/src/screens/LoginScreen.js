import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Image,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import { useAuth } from '../auth/AuthContext';

import { BASE_URL as API_URL } from '../api/client';

export default function LoginScreen({ navigation, route }) {
  const { login, requestOtp, loading } = useAuth();
  const params = route.params || {};
  // If coming from WelcomeScreen with check result, go directly to login/signup
  const initialStep = params.hasPassword === true ? 'login'
                    : params.hasPassword === false ? 'signup'
                    : 'phone';
  const [step, setStep] = useState(initialStep);
  const [phone, setPhone] = useState(params.phone || '');
  const [customerName, setCustomerName] = useState(params.customerName || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [checking, setChecking] = useState(false);

  const handleCheckPhone = async () => {
    const cleaned = phone.replace(/\s/g, '');
    if (cleaned.length < 10) {
      Alert.alert('Invalid Phone', 'Please enter a valid phone number');
      return;
    }
    setChecking(true);
    try {
      const resp = await fetch(`${API_URL}/auth/check-phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleaned }),
      });
      const data = await resp.json();

      if (!data.exists) {
        Alert.alert(
          'Number Not Registered',
          'This phone number is not registered with HOMELINK. Please try the number registered to your account, or join us to get connected.',
          [
            { text: 'Try Another Number', style: 'cancel' },
            { text: 'Join Us', onPress: () => navigation.navigate('JoinCommunity') },
          ],
        );
        return;
      }

      setCustomerName(data.name || '');
      if (data.hasPassword) {
        setStep('login');
      } else {
        setStep('signup');
      }
    } catch {
      Alert.alert('Error', 'Could not check phone number. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  const handleLogin = async () => {
    const cleaned = phone.replace(/\s/g, '');
    if (!password) {
      Alert.alert('Missing Password', 'Please enter your password');
      return;
    }
    const result = await login(cleaned, password);
    if (!result.success) {
      Alert.alert('Login Failed', result.error || 'Invalid phone number or password');
    }
  };

  const handleSignup = async () => {
    const cleaned = phone.replace(/\s/g, '');
    const result = await requestOtp(cleaned);
    if (result.success) {
      navigation.navigate('Otp', { phone: cleaned });
    } else {
      Alert.alert('Error', result.error || 'Failed to send verification code');
    }
  };

  const handleBack = () => {
    if (params.phone) {
      // Came from WelcomeScreen — go back
      navigation.goBack();
    } else {
      setStep('phone');
      setPassword('');
      setShowPassword(false);
    }
  };

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

          {/* ── Step 1: Phone Number ── */}
          {step === 'phone' && (
            <View style={styles.formSection}>
              <Text style={styles.title}>Get Started</Text>
              <Text style={styles.subtitle}>
                Enter your phone number to continue
              </Text>

              <Text style={styles.label}>Phone Number</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="call-outline" size={18} color={COLORS.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="0712345678"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                  maxLength={13}
                  autoFocus
                />
              </View>

              <TouchableOpacity
                style={[styles.btn, (checking || loading) && styles.btnDisabled]}
                onPress={handleCheckPhone}
                disabled={checking || loading}
                activeOpacity={0.85}
              >
                {checking ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <View style={styles.btnContent}>
                    <Ionicons name="arrow-forward" size={18} color="#fff" />
                    <Text style={styles.btnText}>Continue</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* ── Step 2a: Login (has password) ── */}
          {step === 'login' && (
            <View style={styles.formSection}>
              <TouchableOpacity style={styles.backRow} onPress={handleBack}>
                <Ionicons name="arrow-back" size={18} color={COLORS.primary} />
                <Text style={styles.backText}>Change number</Text>
              </TouchableOpacity>

              <Text style={styles.title}>Welcome Back{customerName ? `, ${customerName.split(' ')[0]}` : ''}</Text>
              <Text style={styles.subtitle}>
                Enter your password to sign in
              </Text>

              <View style={styles.phonePill}>
                <Ionicons name="call-outline" size={14} color={COLORS.primary} />
                <Text style={styles.phonePillText}>{phone}</Text>
              </View>

              <Text style={styles.label}>Password</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={18} color={COLORS.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor={COLORS.textMuted}
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  autoFocus
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={COLORS.textMuted}
                  />
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.forgotRow} onPress={() => navigation.navigate('ForgotPassword')}>
                <Text style={styles.forgotText}>Forgot your password?</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, loading && styles.btnDisabled]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <View style={styles.btnContent}>
                    <Ionicons name="log-in-outline" size={18} color="#fff" />
                    <Text style={styles.btnText}>Sign In</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* ── Step 2b: Sign Up (no password yet) ── */}
          {step === 'signup' && (
            <View style={styles.formSection}>
              <TouchableOpacity style={styles.backRow} onPress={handleBack}>
                <Ionicons name="arrow-back" size={18} color={COLORS.primary} />
                <Text style={styles.backText}>Change number</Text>
              </TouchableOpacity>

              <Text style={styles.title}>Set Up Your Account</Text>
              <Text style={styles.subtitle}>
                {customerName ? `Hi ${customerName.split(' ')[0]}! ` : ''}We'll send a verification code to set up your password
              </Text>

              <View style={styles.phonePill}>
                <Ionicons name="call-outline" size={14} color={COLORS.primary} />
                <Text style={styles.phonePillText}>{phone}</Text>
              </View>

              <TouchableOpacity
                style={[styles.btn, loading && styles.btnDisabled]}
                onPress={handleSignup}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <View style={styles.btnContent}>
                    <Ionicons name="paper-plane-outline" size={18} color="#fff" />
                    <Text style={styles.btnText}>Send Verification Code</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerHelp}>
              Need help? Contact support@acs.tcom.co.ke/homelink
            </Text>
          </View>
        </View>

        {/* Powered by */}
        <Text style={styles.poweredBy}>Powered by HOMELINK Group Ltd</Text>
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
    paddingHorizontal: SIZES.lg,
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
    padding: SIZES.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 6,
  },

  // Back row
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  backText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.primary,
  },

  // Phone pill
  phonePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF4EB',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: 'flex-start',
    marginBottom: SIZES.lg,
  },
  phonePillText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },

  // Form
  formSection: {
    marginBottom: SIZES.lg,
  },
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
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    marginBottom: SIZES.lg,
  },
  inputIcon: {
    marginLeft: 16,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    fontSize: 16,
    color: COLORS.text,
  },
  eyeBtn: {
    padding: 12,
  },
  helpText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: -12,
    marginBottom: SIZES.lg,
    lineHeight: 18,
  },

  // Forgot password
  forgotRow: {
    alignItems: 'flex-end',
    marginBottom: SIZES.lg,
    marginTop: -8,
  },
  forgotText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.primary,
  },

  // Button
  btn: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    // Gradient approximation — indigo solid
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
    alignItems: 'center',
  },
  footerHelp: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SIZES.lg,
  },

  // Powered by
  poweredBy: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SIZES.lg,
  },
});
