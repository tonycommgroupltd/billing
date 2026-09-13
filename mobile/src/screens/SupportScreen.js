// ============================================
// HOMELINK Customer App — Support Hub Screen
// ============================================
// Inspired by frontend0 admin dashboard design
// Beautiful landing page for support features:
//   - Quick action cards (AI Chat, New Ticket, Call, WhatsApp)
//   - Ticket stats bar
//   - Recent tickets list
//   - FAQ accordion
//   - Contact info
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Linking, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import api from '../api/client';

// ── FAQ Data ──
const FAQ_ITEMS = [
  {
    q: 'My internet is not working',
    a: 'First, check if the router lights are normal. If the LOS/PON light is red or blinking, restart your router by unplugging for 30 seconds. If it persists, create a "No Internet" ticket.',
  },
  {
    q: 'How do I change my WiFi password?',
    a: 'Open your browser and go to 192.168.1.1 (or 192.168.0.1). Login with admin credentials (usually admin/admin). Navigate to Wireless/WLAN settings and change your password.',
  },
  {
    q: 'How do I pay my bill?',
    a: 'Go to M-Pesa → Lipa na M-Pesa → Pay Bill → Enter Business No: 4129711 → Enter your Account Number → Enter Amount → Confirm.',
  },
  {
    q: 'My internet is slow',
    a: 'Try connecting via ethernet cable to rule out WiFi issues. Reduce the number of connected devices. Run a speed test. If speeds are still low, raise a "Slow Speeds" ticket.',
  },
  {
    q: 'How do I connect a new device?',
    a: 'Go to your device WiFi settings → Select your network name (SSID) → Enter your WiFi password. If you forgot your password, check it on the router admin page.',
  },
];

// ── Status Colors ──
const STATUS_COLORS = {
  open: { bg: '#DBEAFE', text: '#1E40AF', label: 'Open' },
  in_progress: { bg: '#FEF3C7', text: '#92400E', label: 'In Progress' },
  resolved: { bg: '#D1FAE5', text: '#065F46', label: 'Resolved' },
  closed: { bg: '#F3F4F6', text: '#6B7280', label: 'Closed' },
};

// ── Category Icons ──
const CAT_ICONS = {
  no_internet: { icon: 'cloud-offline-outline', color: '#EF4444' },
  slow_speeds: { icon: 'speedometer-outline', color: '#F59E0B' },
  wifi_help: { icon: 'wifi-outline', color: '#3B82F6' },
  password_change: { icon: 'key-outline', color: '#8B5CF6' },
  router_issue: { icon: 'hardware-chip-outline', color: '#EC4899' },
  billing: { icon: 'cash-outline', color: '#10B981' },
  installation: { icon: 'construct-outline', color: '#F97316' },
  account: { icon: 'person-outline', color: '#06B6D4' },
  general: { icon: 'chatbox-outline', color: '#6B7280' },
  connectivity: { icon: 'wifi-outline', color: '#F58220' },
  technical: { icon: 'hardware-chip-outline', color: '#8B5CF6' },
};

export default function SupportScreen({ navigation }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const data = await api.getTickets();
      setTickets(data?.tickets || []);
    } catch { /* ignore */ }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  // Stats
  const openCount = tickets.filter(t => t.status === 'open').length;
  const inProgressCount = tickets.filter(t => t.status === 'in_progress').length;
  const resolvedCount = tickets.filter(t => t.status === 'resolved').length;
  const totalUnread = tickets.reduce((sum, t) => sum + (t.unreadReplies || 0), 0);
  const recentTickets = tickets.slice(0, 3); // show latest 3

  // ── Quick Action Card ──
  const ActionCard = ({ icon, label, sublabel, color, bgColor, onPress }) => (
    <TouchableOpacity style={styles.actionCard} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.actionIconWrap, { backgroundColor: bgColor }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
      <Text style={styles.actionSub}>{sublabel}</Text>
    </TouchableOpacity>
  );

  // ── Stat Pill ──
  const StatPill = ({ label, count, color, icon }) => (
    <View style={styles.statPill}>
      <View style={[styles.statDot, { backgroundColor: color }]} />
      <Text style={styles.statCount}>{count}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  // ── Recent Ticket Card ──
  const RecentTicket = ({ ticket }) => {
    const st = STATUS_COLORS[ticket.status] || STATUS_COLORS.open;
    const catInfo = CAT_ICONS[ticket.category] || CAT_ICONS.general;
    const timeAgo = getTimeAgo(ticket.created_at);
    const hasUnread = ticket.unreadReplies > 0;

    return (
      <TouchableOpacity
        style={styles.recentCard}
        onPress={() => navigation.navigate('TicketsList', { openTicketId: ticket.id })}
        activeOpacity={0.7}
      >
        <View style={[styles.recentBorder, { backgroundColor: catInfo.color }]} />
        <View style={styles.recentContent}>
          <View style={styles.recentTop}>
            <Text style={styles.recentRef}>{ticket.reference}</Text>
            <View style={[styles.miniStatusPill, { backgroundColor: st.bg }]}>
              <Text style={[styles.miniStatusText, { color: st.text }]}>{st.label}</Text>
            </View>
          </View>
          <Text style={styles.recentSubject} numberOfLines={1}>{ticket.subject}</Text>
          <View style={styles.recentBottom}>
            <Text style={styles.recentTime}>{timeAgo}</Text>
            {hasUnread && (
              <View style={styles.unreadDot}>
                <Text style={styles.unreadDotText}>{ticket.unreadReplies}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // ── FAQ Item ──
  const FaqItem = ({ item, index }) => {
    const isOpen = expandedFaq === index;
    return (
      <TouchableOpacity
        style={[styles.faqItem, isOpen && styles.faqItemOpen]}
        onPress={() => setExpandedFaq(isOpen ? null : index)}
        activeOpacity={0.7}
      >
        <View style={styles.faqQuestion}>
          <Ionicons
            name={isOpen ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={isOpen ? COLORS.primary : COLORS.textMuted}
          />
          <Text style={[styles.faqQText, isOpen && { color: COLORS.primary }]}>{item.q}</Text>
        </View>
        {isOpen && (
          <Text style={styles.faqAText}>{item.a}</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
      }
    >
      {/* ── Hero ── */}
      <LinearGradient
        colors={[COLORS.primaryDark, COLORS.primary, '#FF9A45']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroDecor1} />
        <View style={styles.heroDecor2} />
        <View style={styles.heroIcon}>
          <Ionicons name="headset-outline" size={28} color="#fff" />
        </View>
        <Text style={styles.heroTitle}>How can we help?</Text>
        <Text style={styles.heroSub}>Get instant AI help, raise tickets, or browse FAQs</Text>

        {/* Stats Bar */}
        {tickets.length > 0 && (
          <View style={styles.statsBar}>
            <StatPill label="Open" count={openCount} color="#3B82F6" />
            <View style={styles.statDivider} />
            <StatPill label="Active" count={inProgressCount} color="#F59E0B" />
            <View style={styles.statDivider} />
            <StatPill label="Resolved" count={resolvedCount} color="#10B981" />
            {totalUnread > 0 && (
              <>
                <View style={styles.statDivider} />
                <StatPill label="Unread" count={totalUnread} color="#EF4444" />
              </>
            )}
          </View>
        )}
      </LinearGradient>

      {/* ── Quick Actions ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <ActionCard
            icon="chatbubble-ellipses-outline"
            label="AI Assistant"
            sublabel="Chat now"
            color="#F58220"
            bgColor="#FFF4EB"
            onPress={() => navigation.navigate('AIChat')}
          />
          <ActionCard
            icon="add-circle-outline"
            label="New Ticket"
            sublabel="Report issue"
            color="#10B981"
            bgColor="#ECFDF5"
            onPress={() => navigation.navigate('TicketsList', { showCreate: true })}
          />
          <ActionCard
            icon="call-outline"
            label="Call Us"
            sublabel="0110 345 166"
            color="#8B5CF6"
            bgColor="#F3E8FF"
            onPress={() => Linking.openURL('tel:+254110345166')}
          />
          <ActionCard
            icon="logo-whatsapp"
            label="WhatsApp"
            sublabel="Chat on WA"
            color="#25D366"
            bgColor="#F0FFF4"
            onPress={() => Linking.openURL('https://wa.me/254110345166?text=Hi%20HOMELINK%20Support')}
          />
        </View>
      </View>

      {/* ── Recent Tickets ── */}
      {loading ? (
        <View style={styles.loadingSmall}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      ) : recentTickets.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Tickets</Text>
            <TouchableOpacity onPress={() => navigation.navigate('TicketsList')}>
              <Text style={styles.seeAllLink}>See All →</Text>
            </TouchableOpacity>
          </View>
          {recentTickets.map(t => (
            <RecentTicket key={t.id} ticket={t} />
          ))}
        </View>
      ) : (
        <View style={styles.section}>
          <View style={styles.noTickets}>
            <View style={styles.noTicketsIcon}>
              <Ionicons name="ticket-outline" size={32} color={COLORS.primary} />
            </View>
            <Text style={styles.noTicketsTitle}>No tickets yet</Text>
            <Text style={styles.noTicketsSub}>
              Need help? Create a ticket or chat with our AI assistant
            </Text>
            <TouchableOpacity
              style={styles.createFirstBtn}
              onPress={() => navigation.navigate('TicketsList', { showCreate: true })}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.createFirstText}>Create Ticket</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── FAQ Section ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Common Questions</Text>
          <Ionicons name="help-circle-outline" size={18} color={COLORS.textMuted} />
        </View>
        <View style={styles.faqContainer}>
          {FAQ_ITEMS.map((item, idx) => (
            <FaqItem key={idx} item={item} index={idx} />
          ))}
        </View>
      </View>

      {/* ── Contact Info ── */}
      <View style={[styles.section, { marginBottom: 30 }]}>
        <View style={styles.contactCard}>
          <LinearGradient
            colors={['#F8FAFC', '#EFF6FF']}
            style={styles.contactGradient}
          >
            <Ionicons name="business-outline" size={20} color={COLORS.primary} />
            <Text style={styles.contactTitle}>TONYCOMM GROUP LTD</Text>
            <Text style={styles.contactLine}>P.O Box 441-20100, Nakuru Kenya</Text>
            <Text style={styles.contactLine}>support@homelink.local</Text>
            <Text style={styles.contactLine}>+254 700 000 000</Text>
            <View style={styles.contactRow}>
              <TouchableOpacity
                style={styles.contactBtn}
                onPress={() => Linking.openURL('mailto:support@homelink.local')}
              >
                <Ionicons name="mail-outline" size={14} color={COLORS.primary} />
                <Text style={styles.contactBtnText}>Email</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.contactBtn}
                onPress={() => Linking.openURL('tel:+254110345166')}
              >
                <Ionicons name="call-outline" size={14} color={COLORS.primary} />
                <Text style={styles.contactBtnText}>Call</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </View>
    </ScrollView>
  );
}

// ── Time ago helper ──
function getTimeAgo(dateStr) {
  const now = new Date();
  const d = new Date(dateStr);
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ═══════════════════════════════════════
// STYLES
// ═══════════════════════════════════════
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  // ── Hero ──
  hero: {
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24,
    overflow: 'hidden', position: 'relative',
  },
  heroDecor1: {
    position: 'absolute', top: -40, right: -30,
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  heroDecor2: {
    position: 'absolute', bottom: -20, left: -20,
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  heroIcon: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 4,
  },
  heroSub: {
    fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 20,
  },

  // Stats bar
  statsBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14,
    marginTop: 16, gap: 4,
  },
  statPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 4,
  },
  statDot: { width: 6, height: 6, borderRadius: 3 },
  statCount: { fontSize: 16, fontWeight: '700', color: '#fff' },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  statDivider: {
    width: 1, height: 20, backgroundColor: 'rgba(255,255,255,0.15)',
  },

  // ── Section ──
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 12,
  },
  seeAllLink: { fontSize: 13, color: COLORS.primary, fontWeight: '600', marginBottom: 12 },

  // ── Quick Actions ──
  actionsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
  },
  actionCard: {
    flex: 1, minWidth: '45%',
    backgroundColor: COLORS.surface, borderRadius: 14,
    padding: 14, ...SHADOWS.card,
  },
  actionIconWrap: {
    width: 42, height: 42, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  actionLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  actionSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },

  // ── Recent Tickets ──
  recentCard: {
    flexDirection: 'row', backgroundColor: COLORS.surface,
    borderRadius: 12, marginBottom: 8, overflow: 'hidden',
    ...SHADOWS.card,
  },
  recentBorder: { width: 4 },
  recentContent: { flex: 1, padding: 12 },
  recentTop: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 4,
  },
  recentRef: { fontSize: 12, fontWeight: '600', color: COLORS.primary },
  miniStatusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  miniStatusText: { fontSize: 10, fontWeight: '600' },
  recentSubject: { fontSize: 13, fontWeight: '500', color: COLORS.text, marginBottom: 4 },
  recentBottom: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  recentTime: { fontSize: 11, color: COLORS.textMuted },
  unreadDot: {
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: COLORS.danger, justifyContent: 'center',
    alignItems: 'center', paddingHorizontal: 4,
  },
  unreadDotText: { fontSize: 10, fontWeight: '700', color: '#fff' },

  // ── No Tickets ──
  noTickets: {
    backgroundColor: COLORS.surface, borderRadius: 16,
    padding: 28, alignItems: 'center', ...SHADOWS.card,
  },
  noTicketsIcon: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: COLORS.primaryBg, justifyContent: 'center',
    alignItems: 'center', marginBottom: 12,
  },
  noTicketsTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  noTicketsSub: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 18 },
  createFirstBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.primary, paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 10, marginTop: 16,
  },
  createFirstText: { fontSize: 14, fontWeight: '600', color: '#fff' },

  // ── FAQ ──
  faqContainer: {
    backgroundColor: COLORS.surface, borderRadius: 14,
    overflow: 'hidden', ...SHADOWS.card,
  },
  faqItem: {
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  faqItemOpen: { backgroundColor: '#F8FAFC' },
  faqQuestion: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  faqQText: { flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.text },
  faqAText: {
    fontSize: 13, color: COLORS.textSecondary, lineHeight: 19,
    marginTop: 8, marginLeft: 24,
  },

  // ── Contact ──
  contactCard: {
    borderRadius: 14, overflow: 'hidden', ...SHADOWS.card,
  },
  contactGradient: {
    padding: 18, alignItems: 'center', gap: 4,
  },
  contactTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginTop: 4 },
  contactLine: { fontSize: 12, color: COLORS.textSecondary },
  contactRow: { flexDirection: 'row', gap: 12, marginTop: 10 },
  contactBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: COLORS.surface, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  contactBtnText: { fontSize: 12, fontWeight: '500', color: COLORS.primary },

  loadingSmall: { paddingVertical: 30, alignItems: 'center' },
});
