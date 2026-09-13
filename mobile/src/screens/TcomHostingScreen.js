import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Linking, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const WA_NUMBER = '254110345166';

const HOSTING_PLANS = [
  {
    name: 'Starter',
    price: 'KES 1,200',
    period: '/year',
    features: ['2 GB SSD Storage', '1 Website', 'Free SSL Certificate', '5 Email Accounts', 'Shared cPanel', '99.9% Uptime'],
    color: '#F58220',
    popular: false,
  },
  {
    name: 'Basic',
    price: 'KES 2,500',
    period: '/year',
    features: ['5 GB SSD Storage', '3 Websites', 'Free SSL Certificate', '10 Email Accounts', 'Shared cPanel', '99.9% Uptime', 'Weekly Backups'],
    color: '#10B981',
    popular: false,
  },
  {
    name: 'Business',
    price: 'KES 5,000',
    period: '/year',
    features: ['15 GB SSD Storage', '10 Websites', 'Free SSL Certificate', 'Unlimited Email Accounts', 'Shared cPanel', '99.9% Uptime', 'Daily Backups', 'Priority Support'],
    color: '#8B5CF6',
    popular: true,
  },
  {
    name: 'Premium',
    price: 'KES 8,000',
    period: '/year',
    features: ['30 GB SSD Storage', 'Unlimited Websites', 'Free SSL Certificate', 'Unlimited Email Accounts', 'Shared cPanel', '99.9% Uptime', 'Daily Backups', 'Dedicated Support', 'Free Domain (.co.ke)'],
    color: '#F59E0B',
    popular: false,
  },
];

const WHY_US = [
  { icon: 'server-outline', title: 'Local Servers', desc: 'Kenya-based servers for ultra-fast loading speeds across East Africa' },
  { icon: 'shield-checkmark-outline', title: 'Free SSL', desc: 'Every hosting plan includes a free SSL certificate for secure browsing' },
  { icon: 'speedometer-outline', title: '99.9% Uptime', desc: 'Enterprise-grade infrastructure ensures your site is always online' },
  { icon: 'headset-outline', title: 'HOMELINK Support', desc: 'Local Kenyan support team available via WhatsApp, call & email' },
  { icon: 'refresh-outline', title: 'Daily Backups', desc: 'Automatic daily backups so your data is always safe & recoverable' },
  { icon: 'card-outline', title: 'M-Pesa Payments', desc: 'Pay conveniently via M-Pesa — no credit card needed' },
];

function contactWhatsApp(plan) {
  const msg = plan
    ? `Hello HOMELINK! 👋\n\nI'm interested in your *${plan} Hosting Plan*.\n\nPlease share more details. Thank you!`
    : `Hello HOMELINK! 👋\n\nI'm interested in your web hosting services.\n\nPlease share more details. Thank you!`;
  Linking.openURL(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`);
}

export default function TcomHostingScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>HOMELINK Hosting</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Intro */}
        <Text style={styles.introTitle}>Fast & Reliable Web Hosting</Text>
        <Text style={styles.introDesc}>
          Host your website on Kenya-based servers with blazing-fast speeds, 
          free SSL, cPanel access & full HOMELINK technical support. Perfect for 
          businesses, organizations & personal projects.
        </Text>

        {/* Hosting Plans */}
        <Text style={styles.sectionTitle}>Hosting Plans</Text>

        {HOSTING_PLANS.map((plan, i) => (
          <View key={i} style={[styles.planCard, plan.popular && styles.planCardPopular]}>
            {plan.popular && (
              <View style={styles.popularBadge}>
                <Ionicons name="star" size={12} color="#fff" />
                <Text style={styles.popularText}>Most Popular</Text>
              </View>
            )}
            <Text style={[styles.planName, { color: plan.color }]}>{plan.name}</Text>
            <View style={styles.planPriceRow}>
              <Text style={styles.planPrice}>{plan.price}</Text>
              <Text style={styles.planPeriod}>{plan.period}</Text>
            </View>
            <View style={styles.planDivider} />
            {plan.features.map((f, j) => (
              <View key={j} style={styles.featureRow}>
                <Ionicons name="checkmark-circle" size={16} color={plan.color} />
                <Text style={styles.featureText}>{f}</Text>
              </View>
            ))}
            <TouchableOpacity
              style={[styles.planBtn, { backgroundColor: plan.color }]}
              activeOpacity={0.85}
              onPress={() => contactWhatsApp(plan.name)}
            >
              <Ionicons name="logo-whatsapp" size={18} color="#fff" />
              <Text style={styles.planBtnText}>Get Started</Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* Domain Registration */}
        <View style={styles.domainCard}>
          <Ionicons name="link-outline" size={24} color="#F58220" />
          <Text style={styles.domainTitle}>Domain Registration</Text>
          <Text style={styles.domainDesc}>
            Register your .co.ke, .ke, .com, .org or any domain at affordable rates. 
            Free DNS management & domain privacy included.
          </Text>
          <TouchableOpacity
            style={styles.domainBtn}
            activeOpacity={0.85}
            onPress={() => contactWhatsApp(null)}
          >
            <Text style={styles.domainBtnText}>Inquire About Domains</Text>
            <Ionicons name="arrow-forward" size={16} color="#F58220" />
          </TouchableOpacity>
        </View>

        {/* Why HOMELINK Hosting */}
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Why HOMELINK Hosting?</Text>
        {WHY_US.map((item, i) => (
          <View key={i} style={styles.whyCard}>
            <View style={styles.whyIcon}>
              <Ionicons name={item.icon} size={22} color="#F58220" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.whyTitle}>{item.title}</Text>
              <Text style={styles.whyDesc}>{item.desc}</Text>
            </View>
          </View>
        ))}

        {/* CTA */}
        <TouchableOpacity
          style={styles.ctaBtn}
          activeOpacity={0.85}
          onPress={() => contactWhatsApp(null)}
        >
          <LinearGradient
            colors={['#25D366', '#128C7E']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.ctaGrad}
          >
            <Ionicons name="logo-whatsapp" size={22} color="#fff" />
            <Text style={styles.ctaBtnText}>Chat with Us on WhatsApp</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A2E' },
  scroll: { padding: 16 },

  introTitle: { fontSize: 22, fontWeight: '800', color: '#1A1A2E', marginBottom: 8 },
  introDesc: { fontSize: 14, color: '#5F6B7A', lineHeight: 21, marginBottom: 24 },

  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A2E', marginBottom: 14 },

  // Plan cards
  planCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 14,
    borderWidth: 1.5, borderColor: '#E2E8F0',
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4,
  },
  planCardPopular: { borderColor: '#8B5CF6', borderWidth: 2 },
  popularBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#8B5CF6', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', marginBottom: 10,
  },
  popularText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  planName: { fontSize: 18, fontWeight: '800', marginBottom: 6 },
  planPriceRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 14 },
  planPrice: { fontSize: 26, fontWeight: '800', color: '#1A1A2E' },
  planPeriod: { fontSize: 14, color: '#8896AB', marginLeft: 4 },
  planDivider: { height: 1, backgroundColor: '#E2E8F0', marginBottom: 14 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  featureText: { fontSize: 13, color: '#3D4F5F' },
  planBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, paddingVertical: 13, marginTop: 10, gap: 8,
  },
  planBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Domain
  domainCard: {
    backgroundColor: '#EFF6FF', borderRadius: 14, padding: 20, marginTop: 10,
    borderWidth: 1, borderColor: '#BFDBFE', alignItems: 'center',
  },
  domainTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A2E', marginTop: 8, marginBottom: 6 },
  domainDesc: { fontSize: 13, color: '#5F6B7A', textAlign: 'center', lineHeight: 18, marginBottom: 14 },
  domainBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  domainBtnText: { fontSize: 14, fontWeight: '600', color: '#F58220' },

  // Why us
  whyCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8,
  },
  whyIcon: {
    width: 42, height: 42, borderRadius: 10, backgroundColor: '#FFF4EB',
    alignItems: 'center', justifyContent: 'center',
  },
  whyTitle: { fontSize: 14, fontWeight: '700', color: '#1A1A2E', marginBottom: 2 },
  whyDesc: { fontSize: 12, color: '#8896AB', lineHeight: 16 },

  // CTA
  ctaBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 20 },
  ctaGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, gap: 10,
  },
  ctaBtnText: { fontSize: 17, fontWeight: '700', color: '#fff' },
});
