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
    title: 'Purpose of the Fair Usage Policy',
    body: `Internet bandwidth is a shared resource. Excessive or unreasonable usage by some users can negatively affect others.

This policy ensures:
✓ Fair access to services for all subscribers
✓ Clearly defined acceptable usage parameters

Customers should choose plans based on their actual usage needs:

Home Plans — Designed for residential use: browsing, streaming, and everyday connectivity.

Business Plans — For small/medium shared business environments with higher demands.

Customers with consistently high usage or mission-critical needs should consider dedicated business packages. Using a home plan for business may lead to service interruptions and reduced performance.`,
  },
  {
    num: '2',
    title: 'Nature of Service (Best Effort)',
    body: `HOMELINK home and business plans operate on a best-effort basis.

This means:
✓ Speeds may vary depending on network conditions
✓ Performance can be affected by network congestion
✓ Technical constraints may impact service delivery

HOMELINK does not guarantee uninterrupted service except for dedicated packages with SLAs.

When "unlimited internet" is advertised:
✓ There are no fixed data caps
✓ However, usage is still subject to this FUP
✓ Heavy sustained usage significantly above normal levels may trigger network management interventions

Unlimited ≠ Unrestricted`,
  },
  {
    num: '3',
    title: 'Usage Thresholds & Network Optimization',
    body: `HOMELINK uses internal usage thresholds to optimize performance.

If usage exceeds normal residential/SME patterns:
⚠ Temporary throttling may occur
⚠ Traffic may be deprioritized during peak times

These measures mainly discourage service redistribution and internet resale.

Examples of Excessive Usage:
✕ Downloading/uploading significantly above average user patterns
✕ Continuous high-volume traffic affecting network performance

In legitimate high-use scenarios (e.g., work-from-home, family streaming), HOMELINK may manually adjust throttling upon request.`,
  },
  {
    num: '4',
    title: 'Automatic Traffic Management',
    body: `HOMELINK uses automated systems to detect and manage heavy usage.

If thresholds are exceeded:
✓ Speed may be automatically reduced

In cases of abuse (resale/redistribution):
✕ Account may be suspended temporarily or permanently
✕ No prior notice required`,
  },
  {
    num: '5',
    title: 'Prohibited Activities',
    body: `The following are strictly prohibited:

✕ Reselling or redistributing HOMELINK services without written consent
✕ Supporting piracy or copyright infringement
✕ Other illegal uses of the service
✕ Operating servers or large-scale file-sharing networks on residential connections

Additional Restrictions:
⚠ No Bring Your Own Router (BYOR) for home fibre plans
⚠ Unauthorized devices may result in network management actions

Violations may lead to:
✕ Immediate throttling
✕ Suspension of service
✕ Termination of account`,
  },
  {
    num: '6',
    title: 'Dedicated Services & SLA Exemption',
    body: `Dedicated internet plans:
✓ Operate under separate Service Level Agreements (SLAs)
✓ Are exempt from standard FUP conditions
✓ Have guaranteed service levels

Benefits of Dedicated Plans:
✓ Guaranteed service levels with SLA backing
✓ Structured for intensive usage patterns
✓ Priority support and faster response times

Choosing based only on price may negatively impact your experience if your usage demands exceed residential plan capabilities.`,
  },
  {
    num: '7',
    title: 'Transparency & Customer Self-Monitoring',
    body: `Customers are encouraged to:

✓ Monitor usage via HOMELINK portal or mobile app
✓ Stay within fair usage limits
✓ Avoid unexpected management actions

HOMELINK promotes working together with customers for the best experience.`,
  },
  {
    num: '8',
    title: "HOMELINK's Discretion & Liability",
    body: `HOMELINK reserves the right to interpret and enforce this FUP at its discretion.

HOMELINK is not liable for:
✕ Indirect losses or damages resulting from service adjustments
✕ Service interruptions caused by network management measures`,
  },
  {
    num: '9',
    title: 'Policy Updates',
    body: `HOMELINK may update this policy periodically to reflect changes in services, technology, or regulations.

Customers may be notified via:
✓ Email notifications
✓ SMS notifications
✓ WhatsApp notifications
✓ Customer portal announcements

The latest version is always available on the HOMELINK website.`,
  },
];

export default function FupScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Fair Usage Policy</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Intro */}
        <View style={styles.introCard}>
          <Ionicons name="shield-checkmark-outline" size={32} color={COLORS.primary} />
          <Text style={styles.introTitle}>Ensuring quality service and fairness for all our customers</Text>
          <Text style={styles.introSub}>
            HOMELINK Group Ltd (HOMELINK) provides reliable, high-quality internet services.
            To maintain consistent service quality and fairness, HOMELINK implements this Fair Usage Policy.
          </Text>
          <View style={styles.introPills}>
            <View style={styles.pill}>
              <Ionicons name="analytics-outline" size={14} color={COLORS.primary} />
              <Text style={styles.pillText}>Manage usage</Text>
            </View>
            <View style={styles.pill}>
              <Ionicons name="shield-outline" size={14} color={COLORS.primary} />
              <Text style={styles.pillText}>Prevent abuse</Text>
            </View>
            <View style={styles.pill}>
              <Ionicons name="speedometer-outline" size={14} color={COLORS.primary} />
              <Text style={styles.pillText}>Optimize performance</Text>
            </View>
          </View>
        </View>

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
          <Text style={styles.contactTitle}>Questions about this policy?</Text>
          <View style={styles.contactRow}>
            <TouchableOpacity
              style={styles.contactBtn}
              onPress={() => Linking.openURL('tel:0110345166')}
            >
              <Ionicons name="call-outline" size={16} color="#fff" />
              <Text style={styles.contactBtnText}>0110 345 166</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.contactBtn, { backgroundColor: '#10B981' }]}
              onPress={() => Linking.openURL('mailto:support@acs.tcom.co.ke/homelink')}
            >
              <Ionicons name="mail-outline" size={16} color="#fff" />
              <Text style={styles.contactBtnText}>Email Us</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  scroll: { padding: 16 },

  // Intro
  introCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    alignItems: 'center', marginBottom: 24,
    borderWidth: 1, borderColor: COLORS.border,
  },
  introTitle: {
    fontSize: 16, fontWeight: '700', color: COLORS.text,
    textAlign: 'center', marginTop: 12, marginBottom: 8,
  },
  introSub: {
    fontSize: 13, color: COLORS.textSecondary, textAlign: 'center',
    lineHeight: 20, marginBottom: 16,
  },
  introPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.primaryBg, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  pillText: { fontSize: 12, fontWeight: '600', color: COLORS.primary },

  // Sections
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

  // Contact
  contactCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 24,
    alignItems: 'center', marginTop: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  contactTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 16 },
  contactRow: { flexDirection: 'row', gap: 12 },
  contactBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.primary, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  contactBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
});
