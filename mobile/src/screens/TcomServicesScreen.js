import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Linking, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';

const WA_NUMBER = '254110345166';

const BILLING_SYSTEMS = [
  {
    icon: 'wifi-outline',
    title: 'Hotspot Billing System',
    desc: 'Manage Wi-Fi hotspot users, vouchers, bandwidth limits & payments. Perfect for hotels, cafes & public spaces.',
    color: '#F58220',
    bg: '#FFF4EB',
  },
  {
    icon: 'git-network-outline',
    title: 'PPPoE Billing System',
    desc: 'Full ISP billing with PPPoE authentication, automated invoicing, M-Pesa integration & customer portal.',
    color: '#8B5CF6',
    bg: '#F3E8FF',
  },
];

const SOFTWARE_SOLUTIONS = [
  {
    icon: 'globe-outline',
    title: 'Website Development',
    desc: 'Professional, responsive websites for businesses, organizations & personal brands. SEO-optimized & mobile-friendly.',
    color: '#10B981',
    bg: '#ECFDF5',
  },
  {
    icon: 'school-outline',
    title: 'School Management System',
    desc: 'Student enrollment, fee management, exam results, timetabling, parent portal & SMS notifications.',
    color: '#F59E0B',
    bg: '#FEF3C7',
  },
  {
    icon: 'medkit-outline',
    title: 'Hospital & Clinic Management',
    desc: 'Patient records, appointments, pharmacy, lab results, billing & insurance (NHIF/SHA) integration.',
    color: '#EF4444',
    bg: '#FEF2F2',
  },
  {
    icon: 'cart-outline',
    title: 'Point of Sale (POS) System',
    desc: 'Inventory tracking, sales management, receipts, M-Pesa payments & daily/monthly reports.',
    color: '#06B6D4',
    bg: '#ECFEFF',
  },
  {
    icon: 'people-outline',
    title: 'SACCO Management System',
    desc: 'Member registration, savings, loans, dividends, M-Pesa integration & automated statements.',
    color: '#14B8A6',
    bg: '#F0FDFA',
  },
  {
    icon: 'business-outline',
    title: 'HR & Payroll System',
    desc: 'Employee management, attendance, leave tracking, payroll processing, KRA & NHIF/NSSF compliance.',
    color: '#8B5CF6',
    bg: '#F3E8FF',
  },
  {
    icon: 'home-outline',
    title: 'Rental & Property Management',
    desc: 'Tenant management, rent collection, M-Pesa payments, receipts, expense tracking & reports.',
    color: '#F97316',
    bg: '#FFF7ED',
  },
  {
    icon: 'restaurant-outline',
    title: 'Restaurant Management System',
    desc: 'Table management, orders, kitchen display, inventory, billing & delivery tracking.',
    color: '#EC4899',
    bg: '#FDF2F8',
  },
  {
    icon: 'car-outline',
    title: 'Fleet & Transport Management',
    desc: 'Vehicle tracking, fuel management, maintenance scheduling, route planning & driver management.',
    color: '#6366F1',
    bg: '#EEF2FF',
  },
  {
    icon: 'storefront-outline',
    title: 'E-Commerce Platform',
    desc: 'Online store with product catalog, shopping cart, M-Pesa checkout, delivery tracking & analytics.',
    color: '#22C55E',
    bg: '#F0FDF4',
  },
  {
    icon: 'library-outline',
    title: 'Church & NGO Management',
    desc: 'Member database, tithe/offering tracking, events, SMS communication & financial reports.',
    color: '#A855F7',
    bg: '#FAF5FF',
  },
];

function contactWhatsApp(system) {
  const msg =
    `Hello HOMELINK! 👋\n\nI'm interested in your *${system}*.\n\nPlease share more details and pricing. Thank you!`;
  Linking.openURL(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`);
}

export default function TcomServicesScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>HOMELINK Solutions</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Billing Systems Section */}
        <Text style={styles.sectionTitle}>ISP Billing Systems</Text>

        <View style={styles.highlightCard}>
          <View style={styles.highlightBadge}>
            <Ionicons name="pricetag-outline" size={14} color="#fff" />
            <Text style={styles.highlightBadgeText}>One-Time Fee</Text>
          </View>
          <Text style={styles.highlightText}>
            Pay once, use forever — <Text style={{ fontWeight: '800' }}>no monthly charges!</Text>
          </Text>
          <Text style={styles.highlightSub}>Includes full HOMELINK setup & ongoing technical support</Text>
        </View>

        {BILLING_SYSTEMS.map((s, i) => (
          <TouchableOpacity
            key={`b-${i}`}
            style={styles.serviceCard}
            activeOpacity={0.7}
            onPress={() => contactWhatsApp(s.title)}
          >
            <View style={[styles.serviceIcon, { backgroundColor: s.bg }]}>  
              <Ionicons name={s.icon} size={26} color={s.color} />
            </View>
            <View style={styles.serviceInfo}>
              <Text style={styles.serviceTitle}>{s.title}</Text>
              <Text style={styles.serviceDesc}>{s.desc}</Text>
            </View>
            <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
          </TouchableOpacity>
        ))}

        {/* Software Solutions Section */}
        <Text style={[styles.sectionTitle, { marginTop: 28 }]}>Software Solutions</Text>
        <Text style={styles.sectionSub}>
          Custom-built systems at affordable prices. All M-Pesa integrated & tailored for Kenyan businesses.
        </Text>

        {SOFTWARE_SOLUTIONS.map((s, i) => (
          <TouchableOpacity
            key={`s-${i}`}
            style={styles.serviceCard}
            activeOpacity={0.7}
            onPress={() => contactWhatsApp(s.title)}
          >
            <View style={[styles.serviceIcon, { backgroundColor: s.bg }]}>
              <Ionicons name={s.icon} size={26} color={s.color} />
            </View>
            <View style={styles.serviceInfo}>
              <Text style={styles.serviceTitle}>{s.title}</Text>
              <Text style={styles.serviceDesc}>{s.desc}</Text>
            </View>
            <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
          </TouchableOpacity>
        ))}

        {/* CTA */}
        <View style={styles.ctaCard}>
          <Ionicons name="chatbubbles-outline" size={28} color="#F58220" />
          <Text style={styles.ctaTitle}>Need a Custom System?</Text>
          <Text style={styles.ctaDesc}>
            We build tailor-made software solutions for any business need. Contact us for a free consultation!
          </Text>
          <TouchableOpacity
            style={styles.ctaBtn}
            activeOpacity={0.85}
            onPress={() => contactWhatsApp('Custom Software Development')}
          >
            <LinearGradient
              colors={['#25D366', '#128C7E']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.ctaGrad}
            >
              <Ionicons name="logo-whatsapp" size={20} color="#fff" />
              <Text style={styles.ctaBtnText}>Chat with Us on WhatsApp</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A2E',
  },
  scroll: {
    padding: 16,
  },

  // Sections
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: 4,
  },
  sectionSub: {
    fontSize: 13,
    color: '#8896AB',
    lineHeight: 18,
    marginBottom: 16,
  },

  // Highlight card
  highlightCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 16,
    marginTop: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  highlightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F58220',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  highlightBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  highlightText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A2E',
    marginBottom: 4,
  },
  highlightSub: {
    fontSize: 12,
    color: '#5F6B7A',
  },

  // Service cards
  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    gap: 12,
  },
  serviceIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceInfo: {
    flex: 1,
  },
  serviceTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: 3,
  },
  serviceDesc: {
    fontSize: 12,
    color: '#8896AB',
    lineHeight: 16,
  },

  // CTA
  ctaCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginTop: 20,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  ctaTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A1A2E',
    marginTop: 10,
    marginBottom: 6,
  },
  ctaDesc: {
    fontSize: 13,
    color: '#8896AB',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  ctaBtn: {
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
  },
  ctaGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  ctaBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
