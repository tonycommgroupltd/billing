// ============================================
// HOMELINK Customer App — AI Chat Screen
// ============================================
// Real-time chat with HOMELINK AI Assistant (Gemini)
// Persistent history, quick replies, typing indicator
// ============================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import api from '../api/client';

const QUICK_REPLIES = [
  { label: '🌐 Internet is slow', msg: 'My internet connection is very slow' },
  { label: '📶 No connection', msg: 'I cannot connect to the internet at all' },
  { label: '🔑 Change WiFi password', msg: 'How do I change my WiFi password?' },
  { label: '💰 Make a payment', msg: 'How do I pay my bill via M-Pesa?' },
  { label: '📊 Check my plan', msg: 'What plan am I currently on?' },
  { label: '🎫 Raise a ticket', msg: 'I want to raise a support ticket' },
];

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 0);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showQuick, setShowQuick] = useState(true);
  const flatListRef = useRef(null);
  const isMounted = useRef(true);

  // Track mount state to prevent setState on unmounted component
  useEffect(() => {
    isMounted.current = true;
    loadHistory();
    return () => { isMounted.current = false; };
  }, []);

  const loadHistory = async () => {
    try {
      const data = await api.getChatHistory();
      if (!isMounted.current) return;
      if (data?.messages?.length) {
        setMessages(data.messages.map(m => ({
          id: m.id.toString(),
          role: m.role,
          content: m.content,
          time: new Date(m.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        })));
        setShowQuick(false);
      }
    } catch { /* ignore */ }
    if (isMounted.current) setLoading(false);
  };

  const sendMessage = async (text) => {
    const msg = (text || input).trim();
    if (!msg || sending) return;

    const userMsg = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: msg,
      time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);
    setShowQuick(false);

    try {
      const data = await api.sendChatMessage(msg);
      if (!isMounted.current) return;
      if (data?.success) {
        const botMsg = {
          id: `b-${Date.now()}`,
          role: 'assistant',
          content: data.response || 'No response received.',
          time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          provider: data.provider,
        };
        setMessages(prev => [...prev, botMsg]);
      } else {
        throw new Error(data?.error || 'Failed');
      }
    } catch (err) {
      if (!isMounted.current) return;
      setMessages(prev => [...prev, {
        id: `e-${Date.now()}`,
        role: 'assistant',
        content: "Sorry, I'm having trouble connecting right now. Please try again or call +254 700 000 000 for immediate help.",
        time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        isError: true,
      }]);
    } finally {
      if (isMounted.current) setSending(false);
    }
  };

  const handleClearChat = () => {
    Alert.alert('Clear Chat', 'Delete all chat history?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear', style: 'destructive',
        onPress: async () => {
          await api.clearChatHistory();
          if (!isMounted.current) return;
          setMessages([]);
          setShowQuick(true);
        },
      },
    ]);
  };

  // Scroll to bottom on new message
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  // ── Render message bubble ──
  const renderMessage = useCallback(({ item }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowBot]}>
        {!isUser && (
          <View style={styles.botAvatar}>
            <Ionicons name="chatbubble-ellipses" size={14} color="#fff" />
          </View>
        )}
        <View style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleBot,
          item.isError && styles.bubbleError,
        ]}>
          <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
            {item.content}
          </Text>
          <Text style={[styles.bubbleTime, isUser && styles.bubbleTimeUser]}>
            {item.time}
          </Text>
        </View>
      </View>
    );
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {/* Header */}
      <LinearGradient
        colors={[COLORS.primaryDark, COLORS.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerLeft}>
          <View style={styles.headerAvatar}>
            <Ionicons name="chatbubble-ellipses" size={18} color={COLORS.primary} />
          </View>
          <View>
            <Text style={styles.headerTitle}>HOMELINK Assistant</Text>
            <View style={styles.headerStatus}>
              <View style={styles.onlineDot} />
              <Text style={styles.headerSub}>Online • AI Powered</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity onPress={handleClearChat} style={styles.headerAction}>
          <Ionicons name="trash-outline" size={20} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
      </LinearGradient>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messagesList}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadHistory().finally(() => setRefreshing(false)); }}
            colors={[COLORS.primary]}
          />
        }
        ListHeaderComponent={
          messages.length === 0 ? (
            <View style={styles.welcomeWrap}>
              <View style={styles.welcomeIcon}>
                <Ionicons name="chatbubble-ellipses" size={40} color={COLORS.primary} />
              </View>
              <Text style={styles.welcomeTitle}>Hi there! 👋</Text>
              <Text style={styles.welcomeText}>
                I'm your HOMELINK AI assistant. I can help with internet issues, billing, password changes, and more.
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          sending ? (
            <View style={[styles.bubbleRow, styles.bubbleRowBot]}>
              <View style={styles.botAvatar}>
                <Ionicons name="chatbubble-ellipses" size={14} color="#fff" />
              </View>
              <View style={[styles.bubble, styles.bubbleBot, styles.typingBubble]}>
                <View style={styles.typingDots}>
                  <View style={[styles.dot, styles.dot1]} />
                  <View style={[styles.dot, styles.dot2]} />
                  <View style={[styles.dot, styles.dot3]} />
                </View>
              </View>
            </View>
          ) : null
        }
      />

      {/* Quick Replies */}
      {showQuick && (
        <View style={styles.quickWrap}>
          <FlatList
            data={QUICK_REPLIES}
            keyExtractor={(_, i) => i.toString()}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickList}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.quickChip}
                onPress={() => sendMessage(item.msg)}
                activeOpacity={0.7}
              >
                <Text style={styles.quickText}>{item.label}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* Input Bar */}
      <View style={[styles.inputBar, { paddingBottom: 10 + bottomPad }]}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor={COLORS.textMuted}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={1000}
          editable={!sending}
          onSubmitEditing={() => sendMessage()}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
          onPress={() => sendMessage()}
          disabled={!input.trim() || sending}
          activeOpacity={0.7}
        >
          <Ionicons
            name="send"
            size={18}
            color={input.trim() && !sending ? '#fff' : COLORS.textMuted}
          />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingTop: Platform.OS === 'ios' ? 50 : 14,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  headerStatus: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ADE80' },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.75)' },
  headerAction: { padding: 8 },

  // Messages list
  messagesList: { padding: 16, paddingBottom: 8 },

  // Welcome
  welcomeWrap: { alignItems: 'center', marginBottom: 20, paddingVertical: 30 },
  welcomeIcon: {
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: COLORS.primaryBg, justifyContent: 'center', alignItems: 'center',
    marginBottom: 14,
  },
  welcomeTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  welcomeText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', maxWidth: '85%', lineHeight: 20 },

  // Bubble
  bubbleRow: { flexDirection: 'row', marginBottom: 10, alignItems: 'flex-end' },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubbleRowBot: { justifyContent: 'flex-start' },
  botAvatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center',
    marginRight: 8, marginBottom: 2,
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleUser: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4,
  },
  bubbleBot: {
    backgroundColor: COLORS.surface,
    borderBottomLeftRadius: 4,
    ...SHADOWS.card,
  },
  bubbleError: { backgroundColor: '#FEF2F2' },
  bubbleText: { fontSize: 14, lineHeight: 20, color: COLORS.text },
  bubbleTextUser: { color: '#fff' },
  bubbleTime: { fontSize: 10, color: COLORS.textMuted, marginTop: 4, textAlign: 'right' },
  bubbleTimeUser: { color: 'rgba(255,255,255,0.6)' },

  // Typing indicator
  typingBubble: { paddingVertical: 14, paddingHorizontal: 18 },
  typingDots: { flexDirection: 'row', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.textMuted },
  dot1: { opacity: 0.4 },
  dot2: { opacity: 0.6 },
  dot3: { opacity: 0.8 },

  // Quick replies
  quickWrap: { borderTopWidth: 1, borderTopColor: COLORS.borderLight, paddingVertical: 8 },
  quickList: { paddingHorizontal: 12, gap: 8 },
  quickChip: {
    backgroundColor: COLORS.primaryBg,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  quickText: { fontSize: 13, color: COLORS.primary, fontWeight: '500' },

  // Input
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    backgroundColor: COLORS.surface,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 100,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: COLORS.borderLight },
});
