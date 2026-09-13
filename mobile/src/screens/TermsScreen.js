import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';

const SECTIONS = [
  {
    num: '1',
    title: 'Acceptance of Terms',
    body: `By accessing and using HOMELINK Group LTD's internet services, you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions. If you do not agree to these terms, please do not use our services.

These terms constitute a legally binding agreement between you (the "Customer" or "User") and HOMELINK Group LTD ("Company," "we," "us," or "our") governing your use of our internet services, including but not limited to home internet, business internet, and related services.

By subscribing to our services, you confirm that you are at least 18 years of age and have the legal capacity to enter into this agreement.`,
  },
  {
    num: '2',
    title: 'Services Description',
    body: `HOMELINK Group LTD provides high-speed fiber optic internet services to residential and business customers in Kenya. Our services include:

• High-speed fiber optic internet connectivity with various bandwidth options
• Installation and setup of customer premises equipment (CPE)
• 24/7 technical support and customer service
• Network maintenance and infrastructure management
• Static IP addresses (for applicable packages)

Service availability and speeds may vary depending on your location, network conditions, and the selected service package. We strive to provide consistent service but cannot guarantee uninterrupted connectivity.`,
  },
  {
    num: '3',
    title: 'User Obligations',
    body: `As a customer, you agree to:

• Provide accurate and complete information during registration
• Use the service only for lawful purposes and in accordance with Kenyan law
• Maintain the security of your account credentials
• Not share, resell, or redistribute the internet service without authorization
• Ensure that all equipment provided remains in good condition
• Allow access to our technicians for installation, maintenance, and repairs`,
  },
  {
    num: '4',
    title: 'Payment Terms',
    body: `Payment for services is due according to the billing cycle selected (monthly, quarterly, or annually). Key payment terms include:

• All payments must be made in advance before the start of each billing period
• We accept M-Pesa, bank transfers, and other approved payment methods
• Late payments may result in service suspension after a 7-day grace period
• Reconnection fees may apply for services suspended due to non-payment
• Prices are subject to change with 30 days' advance notice

M-Pesa Paybill: Use our paybill number for convenient payments. Your account number is your registered phone number or customer ID.`,
  },
  {
    num: '5',
    title: 'Prohibited Activities',
    body: `The following activities are strictly prohibited when using our services:

• Hacking, unauthorized access, or attempting to breach network security
• Distribution of malware, viruses, or harmful software
• Illegal downloading or distribution of copyrighted content
• Spamming, phishing, or fraudulent activities
• Running servers or services that violate our fair use policy
• Any activity that degrades network performance for other users`,
  },
  {
    num: '6',
    title: 'Termination',
    body: `Either party may terminate this agreement under the following conditions:

• Customer may cancel with 30 days' written notice to our customer service
• We may terminate for violation of these terms with 7 days' notice
• Immediate termination may occur for serious violations or illegal activities
• All equipment provided must be returned within 14 days of termination

Upon termination, any outstanding balances become immediately due. Refunds for prepaid services will be calculated on a pro-rata basis.`,
  },
  {
    num: '7',
    title: 'Limitation of Liability',
    body: `While we strive to provide reliable service, HOMELINK Group LTD shall not be liable for:

• Service interruptions due to force majeure events (natural disasters, civil unrest, etc.)
• Damages resulting from unauthorized access to your network or devices
• Loss of data or business due to service interruptions
• Third-party content accessed through our service

Our total liability shall not exceed the amount paid by you for services in the preceding three months.`,
  },
  {
    num: '8',
    title: 'Changes to Terms',
    body: `We reserve the right to modify these terms at any time. Changes will be communicated through:

• Email notification to your registered email address
• Notice on our website and customer portal
• SMS notification for significant changes

Continued use of our services after changes are communicated constitutes acceptance of the modified terms.`,
  },
];

export default function TermsScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms & Conditions</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.updated}>Last updated: February 17, 2026</Text>

        {SECTIONS.map((s) => (
          <View key={s.num} style={styles.section}>
            <View style={styles.numBadge}>
              <Text style={styles.numText}>{s.num}</Text>
            </View>
            <Text style={styles.sTitle}>{s.title}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}

        {/* Contact */}
        <View style={styles.contactCard}>
          <Text style={styles.contactTitle}>Have Questions?</Text>
          <Text style={styles.contactSub}>Our support team is here to help.</Text>
          <TouchableOpacity
            style={styles.contactBtn}
            onPress={() => Linking.openURL('mailto:support@acs.tcom.co.ke/homelink')}
          >
            <Ionicons name="mail-outline" size={16} color="#fff" />
            <Text style={styles.contactBtnText}>Contact Support</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  scroll: { padding: 16 },
  updated: {
    fontSize: 13, color: COLORS.textMuted, marginBottom: 20,
    textAlign: 'center', fontStyle: 'italic',
  },
  section: { marginBottom: 24 },
  numBadge: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: COLORS.primaryBg,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 8,
  },
  numText: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  sTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 10 },
  body: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 22 },
  contactCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 24,
    alignItems: 'center', marginTop: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  contactTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  contactSub: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 16 },
  contactBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.primary, borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  contactBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
