// ============================================
// HOMELINK Customer App — Support Tickets Screen
// ============================================
// Premium UI: glass-morphic stat cards, compact
// filter pills, rich ticket cards with shadows,
// polished create + detail modals
// ============================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, ScrollView, RefreshControl,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import api from '../api/client';

const { width: SCREEN_W } = Dimensions.get('window');

// ── ISP-Specific Categories ──
const CATEGORIES = [
  { value: 'no_internet',     label: 'No Internet',     icon: 'cloud-offline-outline',  color: '#EF4444' },
  { value: 'slow_speeds',     label: 'Slow Speeds',     icon: 'speedometer-outline',    color: '#F59E0B' },
  { value: 'wifi_help',       label: 'WiFi / Devices',  icon: 'wifi-outline',           color: '#3B82F6' },
  { value: 'password_change', label: 'Password Change',icon: 'key-outline',             color: '#8B5CF6' },
  { value: 'router_issue',    label: 'Router Issue',    icon: 'hardware-chip-outline',  color: '#EC4899' },
  { value: 'billing',         label: 'Billing',         icon: 'cash-outline',           color: '#10B981' },
  { value: 'installation',    label: 'Installation',    icon: 'construct-outline',      color: '#F97316' },
  { value: 'account',         label: 'Account',         icon: 'person-outline',         color: '#06B6D4' },
  { value: 'general',         label: 'General',         icon: 'chatbox-outline',        color: '#6B7280' },
];

const LEGACY_CAT_MAP = { connectivity: 'no_internet', technical: 'router_issue' };

const PRIORITIES = [
  { value: 'low',    label: 'Low',    color: '#10B981', icon: 'arrow-down-outline' },
  { value: 'medium', label: 'Medium', color: '#F59E0B', icon: 'remove-outline' },
  { value: 'high',   label: 'High',   color: '#EF4444', icon: 'arrow-up-outline' },
];

const STATUS_CONFIG = {
  open:        { bg: '#DBEAFE', text: '#1E40AF', label: 'Open',        icon: 'radio-button-on',  dotColor: '#3B82F6' },
  in_progress: { bg: '#FEF3C7', text: '#92400E', label: 'In Progress', icon: 'time-outline',     dotColor: '#F59E0B' },
  resolved:    { bg: '#D1FAE5', text: '#065F46', label: 'Resolved',    icon: 'checkmark-circle', dotColor: '#10B981' },
  closed:      { bg: '#F3F4F6', text: '#6B7280', label: 'Closed',      icon: 'lock-closed',      dotColor: '#9CA3AF' },
};

export default function TicketsScreen({ route }) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 0);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    subject: '', category: 'general', priority: 'medium', message: '',
  });
  const [creating, setCreating] = useState(false);

  // Detail modal
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketDetail, setTicketDetail] = useState(null);
  const [replies, setReplies] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (route?.params?.showCreate) setShowCreate(true);
    if (route?.params?.openTicketId) openDetail({ id: route.params.openTicketId });
  }, [route?.params]);

  const fetchTickets = useCallback(async () => {
    try {
      const params = filter !== 'all' ? { status: filter } : {};
      const data = await api.getTickets(params);
      setTickets(data?.tickets || []);
    } catch { /* ignore */ }
    setLoading(false);
    setRefreshing(false);
  }, [filter]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);
  const onRefresh = () => { setRefreshing(true); fetchTickets(); };

  const handleCreate = async () => {
    const { subject, message } = createForm;
    if (!subject.trim() || !message.trim()) {
      Alert.alert('Required', 'Subject and description are required');
      return;
    }
    setCreating(true);
    try {
      const data = await api.createTicket(createForm);
      if (data?.success) {
        Alert.alert('✓ Ticket Created', `Reference: ${data.ticket.reference}\n\nOur team will respond soon.`);
        setShowCreate(false);
        setCreateForm({ subject: '', category: 'general', priority: 'medium', message: '' });
        fetchTickets();
      } else Alert.alert('Error', data?.error || 'Failed');
    } catch { Alert.alert('Error', 'Something went wrong'); }
    setCreating(false);
  };

  const openDetail = async (ticket) => {
    setSelectedTicket(ticket);
    setLoadingDetail(true);
    try {
      const data = await api.getTicket(ticket.id);
      if (data) { setTicketDetail(data.ticket); setReplies(data.replies || []); }
    } catch { /* ignore */ }
    setLoadingDetail(false);
  };

  const handleReply = async () => {
    if (!replyText.trim() || replying) return;
    setReplying(true);
    try {
      const data = await api.replyToTicket(selectedTicket.id, replyText.trim());
      if (data?.success) {
        setReplies(prev => [...prev, data.reply]);
        setReplyText('');
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
      }
    } catch { Alert.alert('Error', 'Failed to send reply'); }
    setReplying(false);
  };

  const handleClose = () => {
    Alert.alert('Close Ticket', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Close', style: 'destructive', onPress: async () => {
        try { await api.closeTicket(selectedTicket.id); } catch {}
        setSelectedTicket(null); setTicketDetail(null); setReplies([]); fetchTickets();
      }},
    ]);
  };

  // Stats
  const stats = {
    all: tickets.length,
    open: tickets.filter(t => t.status === 'open').length,
    in_progress: tickets.filter(t => t.status === 'in_progress').length,
    resolved: tickets.filter(t => t.status === 'resolved').length,
    closed: tickets.filter(t => t.status === 'closed').length,
  };
  const activeCount = stats.open + stats.in_progress;

  const getCatInfo = (val) => {
    const mapped = LEGACY_CAT_MAP[val] || val;
    return CATEGORIES.find(c => c.value === mapped) || CATEGORIES[8];
  };

  // ════════════════════════════════════
  //  STAT CARDS (inside hero gradient)
  // ════════════════════════════════════
  const StatCard = ({ label, count, color, icon, isActive, onPress }) => (
    <TouchableOpacity
      style={[s.statCard, isActive && s.statCardActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[s.statIconCircle, { backgroundColor: isActive ? '#fff' : 'rgba(255,255,255,0.15)' }]}>
        <Ionicons name={icon} size={16} color={isActive ? color : '#fff'} />
      </View>
      <Text style={[s.statNumber, isActive && { color }]}>{count}</Text>
      <Text style={[s.statLabel, isActive && { color: COLORS.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );

  // ════════════════════════════════════
  //  TICKET CARD (premium)
  // ════════════════════════════════════
  const renderTicket = ({ item }) => {
    const st = STATUS_CONFIG[item.status] || STATUS_CONFIG.open;
    const cat = getCatInfo(item.category);
    const prio = PRIORITIES.find(p => p.value === item.priority) || PRIORITIES[1];
    const hasUnread = item.unreadReplies > 0;

    return (
      <TouchableOpacity style={s.card} onPress={() => openDetail(item)} activeOpacity={0.65}>
        {/* Colored accent border */}
        <View style={[s.cardAccent, { backgroundColor: cat.color }]} />

        <View style={s.cardBody}>
          {/* Row 1: Category icon + Ref + Time + Status */}
          <View style={s.cardRow1}>
            <View style={[s.cardCatIcon, { backgroundColor: cat.color + '14' }]}>
              <Ionicons name={cat.icon} size={18} color={cat.color} />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <View style={s.cardRefRow}>
                <Text style={s.cardRef}>{item.reference}</Text>
                {hasUnread && (
                  <View style={s.cardUnread}>
                    <Text style={s.cardUnreadText}>{item.unreadReplies}</Text>
                  </View>
                )}
              </View>
              <Text style={s.cardTime}>{getTimeAgo(item.created_at)}</Text>
            </View>
            <View style={[s.cardStatus, { backgroundColor: st.bg }]}>
              <View style={[s.cardStatusDot, { backgroundColor: st.dotColor }]} />
              <Text style={[s.cardStatusText, { color: st.text }]}>{st.label}</Text>
            </View>
          </View>

          {/* Row 2: Subject */}
          <Text style={s.cardSubject} numberOfLines={2}>{item.subject}</Text>

          {/* Row 3: Tags */}
          <View style={s.cardRow3}>
            <View style={[s.cardPrio, { backgroundColor: prio.color + '0D' }]}>
              <Ionicons name={prio.icon} size={11} color={prio.color} />
              <Text style={[s.cardPrioText, { color: prio.color }]}>{prio.label}</Text>
            </View>
            <View style={s.cardSep} />
            <Ionicons name={cat.icon} size={12} color={COLORS.textMuted} />
            <Text style={s.cardCatText}>{cat.label}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // ════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════
  return (
    <View style={s.container}>
      {/* ── Hero with stat cards ── */}
      <LinearGradient
        colors={['#0D47A1', '#F58220', '#FF9A45']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={s.hero}
      >
        {/* Decorative circles */}
        <View style={[s.heroCircle, { top: -50, right: -30, width: 140, height: 140 }]} />
        <View style={[s.heroCircle, { bottom: -30, left: -20, width: 90, height: 90 }]} />
        <View style={[s.heroCircle, { top: 10, left: SCREEN_W * 0.4, width: 60, height: 60 }]} />

        {/* Title row */}
        <View style={s.heroRow}>
          <View>
            <Text style={s.heroTitle}>My Tickets</Text>
            <Text style={s.heroSub}>
              {activeCount > 0
                ? `${activeCount} active ticket${activeCount !== 1 ? 's' : ''}`
                : tickets.length > 0 ? `${tickets.length} total` : 'No tickets yet'}
            </Text>
          </View>
          <TouchableOpacity style={s.heroAddBtn} onPress={() => setShowCreate(true)} activeOpacity={0.8}>
            <Ionicons name="add" size={24} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {/* Stat Cards Row */}
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.statsRow}
        >
          <StatCard label="All" count={stats.all} color="#F58220" icon="list-outline"
            isActive={filter === 'all'} onPress={() => { setFilter('all'); setLoading(true); }} />
          <StatCard label="Open" count={stats.open} color="#3B82F6" icon="radio-button-on"
            isActive={filter === 'open'} onPress={() => { setFilter('open'); setLoading(true); }} />
          <StatCard label="Active" count={stats.in_progress} color="#F59E0B" icon="time-outline"
            isActive={filter === 'in_progress'} onPress={() => { setFilter('in_progress'); setLoading(true); }} />
          <StatCard label="Resolved" count={stats.resolved} color="#10B981" icon="checkmark-circle"
            isActive={filter === 'resolved'} onPress={() => { setFilter('resolved'); setLoading(true); }} />
          <StatCard label="Closed" count={stats.closed} color="#9CA3AF" icon="lock-closed"
            isActive={filter === 'closed'} onPress={() => { setFilter('closed'); setLoading(true); }} />
        </ScrollView>
      </LinearGradient>

      {/* ── Ticket List ── */}
      {loading ? (
        <View style={s.loadingWrap}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={item => item.id.toString()}
          renderItem={renderTicket}
          contentContainerStyle={[s.listPad, { paddingBottom: 30 + bottomPad }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <View style={s.emptyIcon}>
                <Ionicons name="ticket-outline" size={42} color={COLORS.primary} />
              </View>
              <Text style={s.emptyTitle}>No tickets found</Text>
              <Text style={s.emptySub}>
                {filter === 'all' ? 'Tap + to create your first ticket' : `No ${filter.replace('_', ' ')} tickets`}
              </Text>
              {filter === 'all' && (
                <TouchableOpacity style={s.emptyBtn} onPress={() => setShowCreate(true)}>
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={s.emptyBtnText}>Create Ticket</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {/* ══════════════════════════════════════
           CREATE TICKET MODAL
         ══════════════════════════════════════ */}
      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalWrap}>
            <View style={[s.modalSheet, { paddingBottom: bottomPad }]}>
              {/* Drag handle */}
              <View style={s.dragHandle} />

              {/* Header */}
              <LinearGradient
                colors={['#0D47A1', '#F58220']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={s.createHero}
              >
                <View style={s.createHeroInner}>
                  <View style={s.createHeroIconWrap}>
                    <Ionicons name="create-outline" size={22} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.createHeroTitle}>New Ticket</Text>
                    <Text style={s.createHeroSub}>Describe your issue below</Text>
                  </View>
                  <TouchableOpacity style={s.createClose} onPress={() => setShowCreate(false)}>
                    <Ionicons name="close" size={20} color="rgba(255,255,255,0.8)" />
                  </TouchableOpacity>
                </View>
              </LinearGradient>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
                {/* Subject */}
                <Text style={s.fLabel}>Subject *</Text>
                <TextInput
                  style={s.fInput}
                  placeholder="Brief description of your issue"
                  placeholderTextColor={COLORS.textMuted}
                  value={createForm.subject}
                  onChangeText={v => setCreateForm(f => ({ ...f, subject: v }))}
                  maxLength={200}
                />

                {/* Category Grid */}
                <Text style={s.fLabel}>Issue Type</Text>
                <View style={s.catGrid}>
                  {CATEGORIES.map(c => {
                    const sel = createForm.category === c.value;
                    return (
                      <TouchableOpacity
                        key={c.value}
                        style={[s.catChip, sel && { borderColor: c.color, backgroundColor: c.color + '0A' }]}
                        onPress={() => setCreateForm(f => ({ ...f, category: c.value }))}
                        activeOpacity={0.7}
                      >
                        <View style={[s.catChipIcon, { backgroundColor: sel ? c.color + '18' : COLORS.borderLight }]}>
                          <Ionicons name={c.icon} size={15} color={sel ? c.color : COLORS.textMuted} />
                        </View>
                        <Text style={[s.catChipLabel, sel && { color: c.color, fontWeight: '600' }]}>{c.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Priority */}
                <Text style={s.fLabel}>Priority</Text>
                <View style={s.prioRow}>
                  {PRIORITIES.map(p => {
                    const sel = createForm.priority === p.value;
                    return (
                      <TouchableOpacity
                        key={p.value}
                        style={[s.prioChip, sel && { borderColor: p.color, backgroundColor: p.color + '0A' }]}
                        onPress={() => setCreateForm(f => ({ ...f, priority: p.value }))}
                        activeOpacity={0.7}
                      >
                        <Ionicons name={p.icon} size={14} color={sel ? p.color : COLORS.textMuted} />
                        <Text style={[s.prioChipLabel, sel && { color: p.color, fontWeight: '600' }]}>{p.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Description */}
                <Text style={s.fLabel}>Description *</Text>
                <TextInput
                  style={[s.fInput, { minHeight: 110, textAlignVertical: 'top' }]}
                  placeholder="Describe in detail — error messages, router model, etc."
                  placeholderTextColor={COLORS.textMuted}
                  value={createForm.message}
                  onChangeText={v => setCreateForm(f => ({ ...f, message: v }))}
                  multiline numberOfLines={5} maxLength={2000}
                />
                <Text style={s.charCount}>{createForm.message.length}/2000</Text>

                {/* Submit */}
                <TouchableOpacity
                  style={[s.submitBtn, creating && { opacity: 0.6 }]}
                  onPress={handleCreate} disabled={creating} activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={['#F58220', '#FF9A45']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={s.submitGrad}
                  >
                    {creating ? <ActivityIndicator color="#fff" size="small" /> : (
                      <>
                        <Ionicons name="paper-plane-outline" size={16} color="#fff" />
                        <Text style={s.submitText}>Submit Ticket</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ══════════════════════════════════════
           TICKET DETAIL MODAL
         ══════════════════════════════════════ */}
      <Modal visible={!!selectedTicket} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalWrap}>
            <View style={[s.modalSheet, { paddingBottom: bottomPad }]}>
              <View style={s.dragHandle} />

              {/* Detail Header */}
              {ticketDetail ? (
                <View style={s.dtHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={s.dtRefRow}>
                      <Text style={s.dtRef}>{ticketDetail.reference}</Text>
                      <View style={[s.cardStatus, { backgroundColor: (STATUS_CONFIG[ticketDetail.status] || STATUS_CONFIG.open).bg }]}>
                        <View style={[s.cardStatusDot, { backgroundColor: (STATUS_CONFIG[ticketDetail.status] || STATUS_CONFIG.open).dotColor }]} />
                        <Text style={[s.cardStatusText, { color: (STATUS_CONFIG[ticketDetail.status] || STATUS_CONFIG.open).text }]}>
                          {(STATUS_CONFIG[ticketDetail.status] || STATUS_CONFIG.open).label}
                        </Text>
                      </View>
                    </View>
                    {/* Info pills */}
                    <View style={s.dtPills}>
                      <View style={s.dtPill}>
                        <Ionicons name={getCatInfo(ticketDetail.category).icon} size={12} color={getCatInfo(ticketDetail.category).color} />
                        <Text style={s.dtPillText}>{getCatInfo(ticketDetail.category).label}</Text>
                      </View>
                      <View style={s.dtPill}>
                        <Ionicons name={(PRIORITIES.find(p => p.value === ticketDetail.priority) || PRIORITIES[1]).icon}
                          size={12} color={(PRIORITIES.find(p => p.value === ticketDetail.priority) || PRIORITIES[1]).color} />
                        <Text style={s.dtPillText}>{ticketDetail.priority}</Text>
                      </View>
                      <View style={s.dtPill}>
                        <Ionicons name="calendar-outline" size={12} color={COLORS.textMuted} />
                        <Text style={s.dtPillText}>
                          {new Date(ticketDetail.createdAt || ticketDetail.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity style={s.dtClose} onPress={() => { setSelectedTicket(null); setTicketDetail(null); setReplies([]); }}>
                    <Ionicons name="close" size={22} color={COLORS.text} />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={s.dtHeader}>
                  <Text style={s.dtRef}>Loading...</Text>
                  <TouchableOpacity style={s.dtClose} onPress={() => { setSelectedTicket(null); setTicketDetail(null); setReplies([]); }}>
                    <Ionicons name="close" size={22} color={COLORS.text} />
                  </TouchableOpacity>
                </View>
              )}

              {loadingDetail ? (
                <View style={s.loadingWrap}><ActivityIndicator size="large" color={COLORS.primary} /></View>
              ) : ticketDetail ? (
                <>
                  <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
                    {/* Subject banner */}
                    <View style={s.dtSubjectBanner}>
                      <Text style={s.dtSubjectText}>{ticketDetail.subject}</Text>
                    </View>

                    {/* Original message */}
                    <View style={s.threadWrap}>
                      <View style={s.threadHeader}>
                        <View style={[s.threadDot, { backgroundColor: '#EC4899' }]} />
                        <Text style={s.threadTitle}>Original Message</Text>
                      </View>
                      <View style={[s.msgCard, { borderLeftColor: '#EC4899' }]}>
                        <View style={s.msgTop}>
                          <View style={[s.msgAvatar, { backgroundColor: '#FDF2F8' }]}>
                            <Text style={[s.msgAvatarLetter, { color: '#EC4899' }]}>
                              {(ticketDetail.customerName || ticketDetail.customer_name || 'Y')[0].toUpperCase()}
                            </Text>
                          </View>
                          <View style={{ flex: 1, marginLeft: 8 }}>
                            <Text style={s.msgName}>{ticketDetail.customerName || ticketDetail.customer_name || 'You'}</Text>
                            <Text style={s.msgTime}>{formatDateTime(ticketDetail.createdAt || ticketDetail.created_at)}</Text>
                          </View>
                          <View style={[s.msgBadge, { backgroundColor: '#FDF2F8' }]}>
                            <Text style={[s.msgBadgeText, { color: '#EC4899' }]}>CUSTOMER</Text>
                          </View>
                        </View>
                        <Text style={s.msgBody}>{ticketDetail.message}</Text>
                      </View>
                    </View>

                    {/* Replies */}
                    {replies.length > 0 && (
                      <View style={s.threadWrap}>
                        <View style={s.threadHeader}>
                          <View style={[s.threadDot, { backgroundColor: '#3B82F6' }]} />
                          <Text style={s.threadTitle}>
                            Conversation ({replies.length} {replies.length === 1 ? 'reply' : 'replies'})
                          </Text>
                        </View>
                        {replies.map((r, idx) => {
                          const isAdmin = r.sender === 'admin';
                          const bc = isAdmin ? '#3B82F6' : '#EC4899';
                          const name = r.sender_name || r.senderName || (isAdmin ? 'HOMELINK Support' : 'You');
                          return (
                            <View key={r.id || idx} style={[s.msgCard, { borderLeftColor: bc }]}>
                              <View style={s.msgTop}>
                                <View style={[s.msgAvatar, { backgroundColor: isAdmin ? '#EFF6FF' : '#FDF2F8' }]}>
                                  {isAdmin
                                    ? <Ionicons name="shield-checkmark" size={14} color="#3B82F6" />
                                    : <Text style={[s.msgAvatarLetter, { color: '#EC4899' }]}>{name[0].toUpperCase()}</Text>}
                                </View>
                                <View style={{ flex: 1, marginLeft: 8 }}>
                                  <Text style={[s.msgName, isAdmin && { color: '#3B82F6' }]}>{name}</Text>
                                  <Text style={s.msgTime}>{formatDateTime(r.created_at || r.createdAt)}</Text>
                                </View>
                                <View style={[s.msgBadge, { backgroundColor: isAdmin ? '#EFF6FF' : '#FDF2F8' }]}>
                                  <Text style={[s.msgBadgeText, { color: isAdmin ? '#3B82F6' : '#EC4899' }]}>
                                    {isAdmin ? 'SUPPORT' : 'YOU'}
                                  </Text>
                                </View>
                              </View>
                              <Text style={s.msgBody}>{r.content}</Text>
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {/* Close ticket */}
                    {ticketDetail.status !== 'closed' && ticketDetail.status !== 'resolved' && (
                      <TouchableOpacity style={s.closeTkBtn} onPress={handleClose}>
                        <Ionicons name="checkmark-done-outline" size={16} color={COLORS.danger} />
                        <Text style={s.closeTkText}>Close This Ticket</Text>
                      </TouchableOpacity>
                    )}
                    {ticketDetail.status === 'closed' && (
                      <View style={s.closedNotice}>
                        <Ionicons name="lock-closed" size={15} color={COLORS.textMuted} />
                        <Text style={s.closedNoticeText}>Ticket closed</Text>
                      </View>
                    )}
                  </ScrollView>

                  {/* Reply bar */}
                  {ticketDetail.status !== 'closed' && (
                    <View style={s.replyBar}>
                      <TextInput
                        style={s.replyInput}
                        placeholder="Write a reply..."
                        placeholderTextColor={COLORS.textMuted}
                        value={replyText} onChangeText={setReplyText}
                        multiline maxLength={2000}
                      />
                      <TouchableOpacity
                        style={[s.replyBtn, (!replyText.trim() || replying) && { backgroundColor: COLORS.borderLight }]}
                        onPress={handleReply}
                        disabled={!replyText.trim() || replying}
                      >
                        {replying
                          ? <ActivityIndicator color="#fff" size="small" />
                          : <Ionicons name="send" size={16} color={replyText.trim() ? '#fff' : COLORS.textMuted} />}
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              ) : null}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

// ── Helpers ──
function getTimeAgo(dateStr) {
  const diff = Math.floor((new Date() - new Date(dateStr)) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function formatDateTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ═══════════════════════════════════════
// STYLES
// ═══════════════════════════════════════
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F4F8' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // ── Hero ──
  hero: { paddingTop: 16, paddingBottom: 8, overflow: 'hidden', position: 'relative' },
  heroCircle: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)' },
  heroRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, marginBottom: 14,
  },
  heroTitle: { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  heroAddBtn: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6,
  },

  // Stat cards
  statsRow: { paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  statCard: {
    width: 80, paddingVertical: 10, borderRadius: 14, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)', gap: 4,
  },
  statCardActive: {
    backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 4,
  },
  statIconCircle: {
    width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center',
  },
  statNumber: { fontSize: 18, fontWeight: '800', color: '#fff' },
  statLabel: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.3 },

  // ── Ticket Card ──
  listPad: { padding: 16, paddingBottom: 30 },
  card: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16,
    marginBottom: 12, overflow: 'hidden',
    shadowColor: '#F58220', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
  },
  cardAccent: { width: 5 },
  cardBody: { flex: 1, padding: 14 },
  cardRow1: { flexDirection: 'row', alignItems: 'center' },
  cardCatIcon: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  cardRefRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardRef: { fontSize: 12, fontWeight: '700', color: COLORS.primary, letterSpacing: 0.2 },
  cardUnread: {
    minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#EF4444',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4,
  },
  cardUnreadText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  cardTime: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  cardStatus: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10,
  },
  cardStatusDot: { width: 6, height: 6, borderRadius: 3 },
  cardStatusText: { fontSize: 11, fontWeight: '700' },
  cardSubject: { fontSize: 15, fontWeight: '600', color: '#1F2937', marginTop: 10, marginBottom: 10, lineHeight: 21 },
  cardRow3: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardPrio: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  cardPrioText: { fontSize: 11, fontWeight: '600' },
  cardSep: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#D1D5DB', marginHorizontal: 4 },
  cardCatText: { fontSize: 11, color: COLORS.textMuted, fontWeight: '500' },

  // ── Empty ──
  emptyWrap: { alignItems: 'center', paddingVertical: 50, paddingHorizontal: 30 },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#FFF4EB',
    justifyContent: 'center', alignItems: 'center', marginBottom: 14,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#1F2937', marginBottom: 6 },
  emptySub: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 18 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 10, marginTop: 18,
  },
  emptyBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },

  // ── Modals ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalWrap: { maxHeight: '95%' },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '100%', minHeight: 400, overflow: 'hidden',
  },
  dragHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB',
    alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },

  // Create modal
  createHero: { marginHorizontal: 16, marginTop: 8, marginBottom: 4, borderRadius: 16, overflow: 'hidden' },
  createHeroInner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  createHeroIconWrap: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  createHeroTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  createHeroSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 1 },
  createClose: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center', alignItems: 'center',
  },

  // Fields
  fLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 16, paddingHorizontal: 18 },
  fInput: {
    marginHorizontal: 18, backgroundColor: '#F8FAFC', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#1F2937',
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  charCount: { fontSize: 11, color: COLORS.textMuted, textAlign: 'right', paddingHorizontal: 18, marginTop: 4 },

  catGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, gap: 8 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#fff',
    minWidth: '30%',
  },
  catChipIcon: { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  catChipLabel: { fontSize: 12, color: '#6B7280' },

  prioRow: { flexDirection: 'row', paddingHorizontal: 18, gap: 10 },
  prioChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  prioChipLabel: { fontSize: 13, color: '#6B7280' },

  submitBtn: { marginHorizontal: 18, marginTop: 22, borderRadius: 12, overflow: 'hidden' },
  submitGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14,
  },
  submitText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // ── Detail Modal ──
  dtHeader: {
    flexDirection: 'row', alignItems: 'flex-start', padding: 16,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  dtRefRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  dtRef: { fontSize: 16, fontWeight: '800', color: '#1F2937' },
  dtPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  dtPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  dtPillText: { fontSize: 11, color: '#6B7280', fontWeight: '500', textTransform: 'capitalize' },
  dtClose: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F4F6',
    justifyContent: 'center', alignItems: 'center', marginLeft: 12,
  },

  dtSubjectBanner: {
    marginHorizontal: 16, marginTop: 12, backgroundColor: '#EFF6FF',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderLeftWidth: 4, borderLeftColor: '#3B82F6',
  },
  dtSubjectText: { fontSize: 14, fontWeight: '600', color: '#1E40AF', lineHeight: 20 },

  // Thread
  threadWrap: { marginTop: 16, paddingHorizontal: 16 },
  threadHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  threadDot: { width: 8, height: 8, borderRadius: 4 },
  threadTitle: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 },

  msgCard: {
    backgroundColor: '#fff', borderRadius: 12, borderLeftWidth: 4,
    padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#F3F4F6',
  },
  msgTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  msgAvatar: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  msgAvatarLetter: { fontSize: 13, fontWeight: '800' },
  msgName: { fontSize: 13, fontWeight: '600', color: '#1F2937' },
  msgTime: { fontSize: 10, color: '#9CA3AF' },
  msgBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  msgBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
  msgBody: { fontSize: 14, color: '#374151', lineHeight: 20 },

  closeTkBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginHorizontal: 16, marginTop: 14, marginBottom: 8,
    paddingVertical: 10, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#FECACA', backgroundColor: '#FEF2F2',
  },
  closeTkText: { fontSize: 13, fontWeight: '600', color: '#EF4444' },
  closedNotice: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginHorizontal: 16, marginTop: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F3F4F6',
  },
  closedNoticeText: { fontSize: 13, color: '#9CA3AF' },

  replyBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    padding: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6', backgroundColor: '#fff',
  },
  replyInput: {
    flex: 1, backgroundColor: '#F8FAFC', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 9, fontSize: 14,
    maxHeight: 80, color: '#1F2937', borderWidth: 1, borderColor: '#E5E7EB',
  },
  replyBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#F58220',
    justifyContent: 'center', alignItems: 'center',
  },
});
