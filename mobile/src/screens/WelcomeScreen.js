import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, Linking, StatusBar, TextInput, ActivityIndicator, Alert, Platform, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';
import { BASE_URL as API_URL } from '../api/client';

const SERVICES = [
  {
    icon: 'flash-outline',
    title: 'HOMELINK Fiber\nMtaani',
    desc: 'High-speed fiber optic internet for your home & business',
    color: '#F58220',
    bg: '#FFF4EB',
    link: 'https://acs.tcom.co.ke/homelink',
  },
  {
    icon: 'card-outline',
    title: 'HOMELINK Billing\nSystems',
    desc: 'Hotspot & PPPoE billing, websites & software solutions',
    color: '#10B981',
    bg: '#ECFDF5',
    screen: 'TcomServices',
  },
  {
    icon: 'map-outline',
    title: 'Our\nCoverage',
    desc: 'Expanding fiber network across Nakuru & beyond',
    color: '#8B5CF6',
    bg: '#F3E8FF',
    screen: 'CoverageMap',
  },
  {
    icon: 'globe-outline',
    title: 'HOMELINK\nHosting',
    desc: 'Fast & reliable web hosting on Kenya-based servers',
    color: '#F59E0B',
    bg: '#FEF3C7',
    screen: 'TcomHosting',
  },
];

export default function WelcomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');
  const [checking, setChecking] = useState(false);
  const [notRegistered, setNotRegistered] = useState(false);

  // Hero animations
  const logoScale = useRef(new Animated.Value(0.5)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const [typedText, setTypedText] = useState('');
  const subTranslateY = useRef(new Animated.Value(20)).current;
  const subOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const fullText = 'Welcome to HOMELINK';
    let interval;
    let timeout;

    const runTypewriter = () => {
      setTypedText('');
      let i = 0;
      interval = setInterval(() => {
        i++;
        setTypedText(fullText.slice(0, i));
        if (i >= fullText.length) {
          clearInterval(interval);
          // Show subtitle
          Animated.parallel([
            Animated.spring(subTranslateY, { toValue: 0, friction: 6, tension: 50, useNativeDriver: true }),
            Animated.timing(subOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
          ]).start();
          // Wait 3s, then fade out and restart
          timeout = setTimeout(() => {
            subTranslateY.setValue(20);
            subOpacity.setValue(0);
            runTypewriter();
          }, 3000);
        }
      }, 80);
    };

    // Logo pops in first
    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, friction: 4, tension: 60, useNativeDriver: true }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start(() => {
      runTypewriter();
    });

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  const handleGetStarted = async () => {
    const cleaned = phone.replace(/\s/g, '');
    if (cleaned.length < 10) {
      Alert.alert('Invalid Phone', 'Please enter a valid phone number');
      return;
    }
    setChecking(true);
    setNotRegistered(false);
    try {
      const resp = await fetch(`${API_URL}/auth/check-phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleaned }),
      });
      const data = await resp.json();

      if (!data.exists) {
        if (Platform.OS !== 'web') {
          Alert.alert(
            'Number Not Registered',
            'This phone number is not registered with HOMELINK. Please try the number registered to your account, or join us to get connected.',
            [
              { text: 'Try Another Number', style: 'cancel' },
              { text: 'Join Us', onPress: () => navigation.navigate('JoinCommunity') },
            ],
          );
        } else {
          setNotRegistered(true);
        }
        return;
      }

      // Navigate to Login with the check result
      navigation.navigate('Login', {
        phone: cleaned,
        hasPassword: data.hasPassword,
        customerName: data.name || '',
      });
    } catch (err) {
      console.log('[check-phone error]', err);
      Alert.alert('Error', 'Could not verify phone number. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 16 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Hero Section ── */}
        <View style={styles.hero}>
          <Animated.Image
            source={require('../../assets/logo.png')}
            style={[styles.logo, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}
            resizeMode="contain"
          />
          <Text style={styles.heroTitle}>
            {typedText.startsWith('Welcome to T') ? (
              <>{typedText.slice(0, 11)}<Text style={styles.heroTitleAccent}>{typedText.slice(11)}</Text></>
            ) : (
              typedText
            )}
          </Text>
          {typedText.length >= 15 && <View style={styles.heroDivider} />}
          <Animated.Text style={[styles.heroSub, { opacity: subOpacity, transform: [{ translateY: subTranslateY }] }]}>
            Best Internet Service Provider in Nakuru, Kenya
          </Animated.Text>
        </View>

        {/* ── Get Started ── */}
        <View style={styles.actions}>
          <Text style={styles.getStartedTitle}>Get Started</Text>
          <Text style={styles.getStartedSub}>Enter your phone number to continue</Text>

          <View style={styles.phoneInputRow}>
            <Ionicons name="call-outline" size={18} color={COLORS.textMuted} style={{ marginLeft: 14 }} />
            <TextInput
              style={styles.phoneInput}
              placeholder="0712345678"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              maxLength={13}
            />
          </View>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleGetStarted}
            activeOpacity={0.85}
            disabled={checking}
          >
            <LinearGradient
              colors={checking ? ['#A0AEC0', '#A0AEC0'] : ['#F58220', '#FF9A45']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.btnGrad}
            >
              {checking ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="arrow-forward" size={20} color="#fff" />
                  <Text style={styles.primaryBtnText}>Continue</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {notRegistered && (
            <View style={styles.notRegisteredBox}>
              <Ionicons name="alert-circle" size={22} color="#D97706" style={{ marginRight: 8 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.notRegTitle}>Number Not Registered</Text>
                <Text style={styles.notRegMsg}>
                  This phone number is not registered with HOMELINK. Please try the number registered to your account, or join us to get connected.
                </Text>
                <TouchableOpacity
                  style={styles.joinUsBtn}
                  onPress={() => { setNotRegistered(false); navigation.navigate('JoinCommunity'); }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="people-outline" size={16} color="#fff" />
                  <Text style={styles.joinUsBtnText}>Join Us</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => navigation.navigate('JoinCommunity')}
            activeOpacity={0.85}
          >
            <Ionicons name="people-outline" size={20} color={COLORS.primary} />
            <Text style={styles.secondaryBtnText}>Join HOMELINK Community Today</Text>
            <Ionicons name="arrow-forward" size={16} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {/* ── Our Services Grid ── */}
        <Text style={styles.sectionTitle}>Our Services</Text>
        <View style={styles.grid}>
          {SERVICES.map((s, i) => {
            const tappable = s.link || s.screen;
            const Card = tappable ? TouchableOpacity : View;
            const cardProps = tappable ? {
              activeOpacity: 0.7,
              onPress: () => s.link ? Linking.openURL(s.link) : navigation.navigate(s.screen),
            } : {};
            return (
              <Card key={i} style={styles.serviceCard} {...cardProps}>
                <View style={[styles.serviceIcon, { backgroundColor: s.bg }]}>
                  <Ionicons name={s.icon} size={28} color={s.color} />
                </View>
                <Text style={styles.serviceTitle}>{s.title}</Text>
                <Text style={styles.serviceDesc}>{s.desc}</Text>
              </Card>
            );
          })}
        </View>

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <View style={styles.footerDivider} />

          <View style={styles.footerContact}>
            <TouchableOpacity
              style={styles.footerLink}
              onPress={() => Linking.openURL('https://acs.tcom.co.ke/homelink')}
            >
              <Ionicons name="globe-outline" size={16} color={COLORS.primary} />
              <Text style={styles.footerLinkText}>acs.tcom.co.ke/homelink</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.footerLink}
              onPress={() => Linking.openURL('tel:0110345166')}
            >
              <Ionicons name="call-outline" size={16} color={COLORS.primary} />
              <Text style={styles.footerLinkText}>0110 345 166</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.legalRow}>
            <TouchableOpacity onPress={() => navigation.navigate('Terms')}>
              <Text style={styles.legalText}>Terms & Conditions</Text>
            </TouchableOpacity>
            <Text style={styles.legalDot}>•</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Fup')}>
              <Text style={styles.legalText}>Fair Usage Policy</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.copyright}>© 2026 HOMELINK Group LTD. All rights reserved.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    flexGrow: 1,
  },

  // Hero
  hero: {
    paddingTop: 40,
    paddingBottom: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    overflow: 'hidden',
  },
  logo: {
    width: 220,
    height: 70,
    marginBottom: 20,
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#1A1A2E',
    marginBottom: 6,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  heroTitleAccent: {
    color: '#F58220',
    fontWeight: '900',
  },
  heroDivider: {
    width: 40,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#F58220',
    marginBottom: 10,
  },
  heroSub: {
    fontSize: 15,
    color: '#5F6B7A',
    textAlign: 'center',
    lineHeight: 22,
    letterSpacing: 0.2,
  },

  // Actions
  actions: {
    paddingHorizontal: 16,
    marginTop: 8,
    gap: 12,
  },
  getStartedTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: 4,
  },
  getStartedSub: {
    fontSize: 13,
    color: '#5F6B7A',
    marginBottom: 12,
  },
  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  phoneInput: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    fontSize: 16,
    color: '#1A1A2E',
  },
  primaryBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  btnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  primaryBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryBg,
    gap: 8,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primary,
  },

  // Not Registered Banner
  notRegisteredBox: {
    flexDirection: 'row',
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  notRegTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 4,
  },
  notRegMsg: {
    fontSize: 13,
    color: '#78350F',
    lineHeight: 18,
    marginBottom: 10,
  },
  joinUsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#F58220',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
  },
  joinUsBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },

  // Services
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 32,
    marginBottom: 16,
    marginHorizontal: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 10,
  },
  serviceCard: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  serviceIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  serviceTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
    lineHeight: 18,
  },
  serviceDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },

  // Footer
  footer: {
    marginTop: 32,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  footerDivider: {
    width: 60,
    height: 3,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: 20,
  },
  footerContact: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 16,
  },
  footerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  legalText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
    textDecorationLine: 'underline',
  },
  legalDot: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  copyright: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
});
