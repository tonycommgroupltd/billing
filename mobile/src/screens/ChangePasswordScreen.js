import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Linking, Modal,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import api from '../api/client';
import ParentalWifiPanel from '../components/ParentalWifiPanel';

export default function ChangePasswordScreen({ navigation, route }) {
  const [loading, setLoading] = useState(true);
  const [connInfo, setConnInfo] = useState(null);
  const [tab, setTab] = useState(() => (route?.params?.tab === 'wifi' ? 'wifi' : 'app'));
  const [allServices, setAllServices] = useState([]);
  const [selectedServiceIdx, setSelectedServiceIdx] = useState(0);

  // App password fields
  const [appCurrent, setAppCurrent] = useState('');
  const [appNew, setAppNew] = useState('');
  const [appConfirm, setAppConfirm] = useState('');
  const [appLoading, setAppLoading] = useState(false);
  const [appShowPass, setAppShowPass] = useState(false);

  // WiFi fields
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPass, setWifiPass] = useState('');
  const [wifiConfirm, setWifiConfirm] = useState('');
  const [wifiLoading, setWifiLoading] = useState(false);
  const [wifiShowPass, setWifiShowPass] = useState(false);
  const [currentSsid, setCurrentSsid] = useState('');   // read-only display
  const [currentWifiPwd, setCurrentWifiPwd] = useState(''); // read-only display
  const [showCurrentWifiPwd, setShowCurrentWifiPwd] = useState(false);

  useEffect(() => {
    if (route?.params?.tab === 'wifi' || route?.params?.tab === 'app') {
      setTab(route.params.tab);
    }
  }, [route?.params?.tab]);

  useEffect(() => {
    // Load services list from dashboard
    (async () => {
      try {
        const dash = await api.getDashboard();
        const svcs = dash?.services || [];
        setAllServices(svcs);
        const navServiceId = route?.params?.serviceId;
        if (navServiceId && svcs.length > 0) {
          const idx = svcs.findIndex(s => String(s.id) === String(navServiceId));
          if (idx >= 0) setSelectedServiceIdx(idx);
        }
      } catch {}
    })();
    loadConnectionInfo();
  }, []);

  const selectedService = allServices.length > 0 ? allServices[selectedServiceIdx] || allServices[0] : null;
  const hasMultipleServices = allServices.length > 1;
  const serviceId = selectedService?.id || route?.params?.serviceId || null;

  const loadConnectionInfo = async (overrideServiceId) => {
    const sid = overrideServiceId !== undefined ? overrideServiceId : serviceId;
    try {
      // 1) Quick check: is this user on SmartOLT?
      const info = await api.getConnectionInfo(sid);
      setConnInfo(info);

      // 2) If on SmartOLT, fetch LIVE onu details (includes wifi_ports with actual SSID/password)
      //    — same approach as frontend OnuDetail.jsx
      if (info?.onuFound) {
        try {
          const details = await api.getOnuDetails(sid);
          if (details?.onu?.wifiPorts?.length) {
            // Pre-fill from first active wifi port (same as frontend)
            const activeWifi = details.onu.wifiPorts.find(p => p.ssid) || details.onu.wifiPorts[0];
            if (activeWifi?.ssid) {
              setWifiSsid(activeWifi.ssid);
              setCurrentSsid(activeWifi.ssid);
            }
            if (activeWifi?.password) {
              setCurrentWifiPwd(activeWifi.password);
            }
          } else if (info.onu?.wifiSsid) {
            // Fallback to cached data
            setWifiSsid(info.onu.wifiSsid);
            setCurrentSsid(info.onu.wifiSsid);
            if (info.onu?.wifiPassword) setCurrentWifiPwd(info.onu.wifiPassword);
          }
        } catch {
          // Fallback to cached data if live fetch fails
          if (info.onu?.wifiSsid) {
            setWifiSsid(info.onu.wifiSsid);
            setCurrentSsid(info.onu.wifiSsid);
          }
        }
      }
    } catch { } finally { setLoading(false); }
  };

  // ── App Password ──
  const handleAppPasswordChange = async () => {
    if (!appCurrent) {
      Alert.alert('Error', 'Please enter your current password');
      return;
    }
    if (!appNew || appNew.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters');
      return;
    }
    if (appNew !== appConfirm) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    if (appCurrent === appNew) {
      Alert.alert('Error', 'New password must be different from current password');
      return;
    }

    setAppLoading(true);
    try {
      console.log('[APP-PWD] Sending change request');
      const result = await api.changeAppPassword(appCurrent, appNew);
      console.log('[APP-PWD] Response:', JSON.stringify(result));
      if (result.success) {
        Alert.alert(
          '✓ Password Changed',
          'Your app password has been updated successfully.',
          [{
            text: 'OK',
            onPress: () => { setAppCurrent(''); setAppNew(''); setAppConfirm(''); },
          }]
        );
      } else {
        Alert.alert('Password Change Failed', result.error || 'Failed to change password. Please try again.');
      }
    } catch (err) {
      console.log('[APP-PWD] Error:', err);
      Alert.alert('Password Change Failed', err?.message || 'Something went wrong. Please try again.');
    } finally {
      setAppLoading(false);
    }
  };

  // ── WiFi Settings ──
  const handleWifiChange = async () => {
    if (!wifiSsid || wifiSsid.trim().length === 0) {
      Alert.alert('Error', 'Please enter a WiFi name (SSID)');
      return;
    }
    if (!wifiPass || wifiPass.length < 8) {
      Alert.alert('Error', 'WiFi password must be at least 8 characters');
      return;
    }
    if (wifiPass !== wifiConfirm) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    // Start immediately — no confirmation dialog that could block
    setWifiLoading(true);
    try {
      console.log('[WIFI] Sending change request:', wifiSsid.trim());
      const result = await api.changeWifiPassword(wifiSsid.trim(), wifiPass, serviceId);
      console.log('[WIFI] Response:', JSON.stringify(result));
      if (result.success) {
        setWifiPass('');
        setWifiConfirm('');
        // Reload live data to show new SSID/password
        try { await loadConnectionInfo(); } catch {}
        Alert.alert(
          '✓ WiFi Updated',
          `WiFi name: ${wifiSsid.trim()}\n\nAll devices will need to reconnect with the new password.`
        );
      } else {
        Alert.alert('WiFi Change Failed', result.error || 'Failed to update WiFi settings. Please try again.');
      }
    } catch (err) {
      console.log('[WIFI] Error:', err);
      Alert.alert('WiFi Change Failed', err?.message || 'Something went wrong. Please try again.');
    } finally {
      setWifiLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const onu = connInfo?.onu;
  const onuFound = connInfo?.onuFound;
  const syncHasRun = connInfo?.syncHasRun;
  // Customer is NOT on SmartOLT (sync ran but ONU not found)
  const isManualRouter = !onuFound && syncHasRun;
  // Sync hasn't run yet — still loading
  const isSyncing = !onuFound && !syncHasRun;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Full-screen loading overlay for WiFi change */}
      <Modal visible={wifiLoading} transparent animationType="fade">
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingTitle}>Updating WiFi Settings</Text>
            <Text style={styles.loadingSubtext}>This may take up to 60 seconds.{"\n"}Please don't close the app.</Text>
          </View>
        </View>
      </Modal>

    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

      {/* ─── Service Picker (gradient header) ─── */}
      {hasMultipleServices && (
        <LinearGradient
          colors={['#F58220', '#1B4E79']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.servicePickerGradient}
        >
          <View style={styles.servicePickerHeader}>
            <Ionicons name="layers-outline" size={14} color="rgba(255,255,255,0.7)" />
            <Text style={styles.servicePickerLabel}>Select Service ({allServices.length})</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.servicePickerScroll}>
            {allServices.map((svc, idx) => {
              const selected = idx === selectedServiceIdx;
              const svcOnline = svc.connectionStatus === 'online';
              return (
                <TouchableOpacity
                  key={svc.id}
                  style={[styles.serviceChip, selected && styles.serviceChipActive]}
                  onPress={() => { setSelectedServiceIdx(idx); setLoading(true); loadConnectionInfo(svc.id); }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.serviceChipDot, svcOnline ? styles.dotOnline : styles.dotOffline]} />
                  <View style={{ flexShrink: 1 }}>
                    <Text style={[styles.serviceChipName, selected && styles.serviceChipNameActive]} numberOfLines={1}>
                      {svc.mikrotikName}
                    </Text>
                    <Text style={[styles.serviceChipPlan, selected && styles.serviceChipPlanActive]} numberOfLines={1}>
                      {svc.planName} · KSh {svc.price?.toLocaleString()}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </LinearGradient>
      )}

      {/* ONU Status Badge */}
      {tab === 'wifi' && onuFound && (
        <View style={[styles.statusCard, styles.statusReady]}>
          <View style={styles.statusIconWrap}>
            <Ionicons name="hardware-chip-outline" size={22} color="#059669" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusTitle, { color: '#065F46' }]}>Device Connected</Text>
            <Text style={[styles.statusSub, { color: '#047857' }]}>
              {`${onu.name || 'ONU'} • ${onu.status || 'Online'}`}
            </Text>
          </View>
          {onu.status && (
            <View style={[styles.dot, onu.status === 'Online' ? styles.dotOnline : styles.dotOffline]} />
          )}
        </View>
      )}

      {/* Tab toggle */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, tab === 'app' && styles.tabActive]}
          onPress={() => setTab('app')}
        >
          <Ionicons name="lock-closed-outline" size={17} color={tab === 'app' ? '#fff' : COLORS.textSecondary} />
          <Text style={[styles.tabText, tab === 'app' && styles.tabTextActive]}>App Password</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'wifi' && styles.tabActive]}
          onPress={() => setTab('wifi')}
        >
          <Ionicons name="wifi-outline" size={17} color={tab === 'wifi' ? '#fff' : COLORS.textSecondary} />
          <Text style={[styles.tabText, tab === 'wifi' && styles.tabTextActive]}>WiFi Settings</Text>
        </TouchableOpacity>
      </View>

      {/* ═══ App Password Tab ═══ */}
      {tab === 'app' && (
        <View style={styles.formCard}>
          <View style={styles.headerRow}>
            <View style={styles.headerIcon}>
              <Ionicons name="shield-checkmark-outline" size={24} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Change App Password</Text>
              <Text style={styles.headerSub}>
                This changes your HOMELINK app login password only.
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <Text style={styles.inputLabel}>Current Password</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={appCurrent}
              onChangeText={setAppCurrent}
              placeholder="Enter current password"
              secureTextEntry={!appShowPass}
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setAppShowPass(!appShowPass)}
            >
              <Ionicons
                name={appShowPass ? 'eye-off-outline' : 'eye-outline'}
                size={20} color={COLORS.textMuted}
              />
            </TouchableOpacity>
          </View>

          <Text style={styles.inputLabel}>New Password</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={appNew}
              onChangeText={setAppNew}
              placeholder="Enter new password (min 6 chars)"
              secureTextEntry={!appShowPass}
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
            />
          </View>

          <Text style={styles.inputLabel}>Confirm New Password</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={appConfirm}
              onChangeText={setAppConfirm}
              placeholder="Confirm new password"
              secureTextEntry={!appShowPass}
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
            />
          </View>

          {appNew && appConfirm && appNew !== appConfirm && (
            <Text style={styles.mismatch}>Passwords do not match</Text>
          )}

          <TouchableOpacity
            style={[styles.submitBtn, appLoading && styles.submitBtnDisabled]}
            onPress={handleAppPasswordChange}
            disabled={appLoading}
          >
            {appLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="lock-closed-outline" size={18} color="#fff" />
                <Text style={styles.submitBtnText}>Change App Password</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ═══ WiFi Tab ═══ */}
      {tab === 'wifi' && (
        <View style={styles.formCard}>
          <View style={styles.headerRow}>
            <View style={[styles.headerIcon, { backgroundColor: '#EEF2FF' }]}>
              <Ionicons name="wifi-outline" size={24} color="#6366F1" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>WiFi Settings</Text>
              <Text style={styles.headerSub}>
                Change your WiFi network name and password.
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          {isSyncing ? (
            <View style={styles.noOnuWrap}>
              <ActivityIndicator size="large" color={COLORS.primary} style={{ marginBottom: 12 }} />
              <Text style={styles.noOnuText}>
                Loading device info... This should be ready within a few minutes.
              </Text>
            </View>
          ) : isManualRouter ? (
            /* ═══ Manual Router Guide (not on SmartOLT) ═══ */
            <View>
              <View style={styles.manualInfoBox}>
                <Ionicons name="information-circle-outline" size={20} color={COLORS.primary} />
                <Text style={styles.manualInfoText}>
                  Your router is not managed remotely. Follow the steps below to change your WiFi password manually.
                </Text>
              </View>

              {/* Router credentials card */}
              <View style={styles.routerCard}>
                <View style={styles.routerCardHeader}>
                  <Ionicons name="desktop-outline" size={20} color="#fff" />
                  <Text style={styles.routerCardTitle}>Router Admin Access</Text>
                </View>
                <View style={styles.routerCardBody}>
                  <View style={styles.credRow}>
                    <Text style={styles.credLabel}>IP Address</Text>
                    <Text style={styles.credValue}>192.168.100.1</Text>
                  </View>
                  <View style={styles.credRow}>
                    <Text style={styles.credLabel}>Username</Text>
                    <Text style={styles.credValue}>telecomadmin</Text>
                  </View>
                  <View style={styles.credRow}>
                    <Text style={styles.credLabel}>Password</Text>
                    <Text style={styles.credValue}>admintelecom</Text>
                  </View>
                </View>
              </View>

              {/* Steps */}
              <Text style={styles.stepsTitle}>Step-by-Step Instructions</Text>
              {[
                { icon: 'globe-outline', text: 'Open Chrome browser on a device connected to your WiFi' },
                { icon: 'link-outline', text: 'Type 192.168.100.1 in the address bar and press Enter' },
                { icon: 'log-in-outline', text: 'Login with Username: telecomadmin, Password: admintelecom' },
                { icon: 'menu-outline', text: 'Navigate to the WLAN section in the menu' },
                { icon: 'key-outline', text: 'Find WPA Preshared Key and enter your new WiFi password (min 8 chars)' },
                { icon: 'checkmark-circle-outline', text: 'Click Change, then click Apply to save' },
                { icon: 'time-outline', text: 'Wait 2-3 minutes for the router to restart' },
                { icon: 'wifi-outline', text: 'Reconnect all your devices with the new password' },
              ].map((step, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={styles.stepNum}>
                    <Text style={styles.stepNumText}>{i + 1}</Text>
                  </View>
                  <View style={styles.stepContent}>
                    <Ionicons name={step.icon} size={16} color={COLORS.primary} style={{ marginTop: 2 }} />
                    <Text style={styles.stepText}>{step.text}</Text>
                  </View>
                </View>
              ))}

              {/* Video Tutorial */}
              <TouchableOpacity
                style={styles.videoCard}
                onPress={() => Linking.openURL('https://www.facebook.com/share/r/184Q6Zwabs/')}
                activeOpacity={0.7}
              >
                <View style={styles.videoIconWrap}>
                  <Ionicons name="play-circle" size={28} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.videoTitle}>Watch Video Tutorial</Text>
                  <Text style={styles.videoSub}>See how to change your WiFi password step by step</Text>
                </View>
                <Ionicons name="open-outline" size={18} color={COLORS.primary} />
              </TouchableOpacity>

              {/* Warning */}
              <View style={[styles.warningBox, { marginTop: SIZES.lg }]}>
                <Ionicons name="warning-outline" size={20} color="#D97706" />
                <Text style={styles.warningText}>
                  All connected devices will be disconnected. Write down your new password before changing it.
                </Text>
              </View>

              {/* Open Router Button */}
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: '#059669' }]}
                onPress={() => Linking.openURL('http://192.168.100.1')}
              >
                <Ionicons name="open-outline" size={18} color="#fff" />
                <Text style={styles.submitBtnText}>Open Router Panel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* ── Current WiFi Details (read-only, from live SmartOLT data) ── */}
              <View style={styles.currentWifiCard}>
                <View style={styles.currentWifiHeader}>
                  <Ionicons name="information-circle" size={18} color={COLORS.primary} />
                  <Text style={styles.currentWifiTitle}>Current WiFi Settings</Text>
                </View>
                <View style={styles.currentWifiRow}>
                  <Text style={styles.currentWifiLabel}>WiFi Name (SSID)</Text>
                  <Text style={styles.currentWifiValue}>{currentSsid || onu?.wifiSsid || '—'}</Text>
                </View>
                <View style={[styles.currentWifiRow, { borderBottomWidth: 0 }]}>
                  <Text style={styles.currentWifiLabel}>WiFi Password</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[styles.currentWifiValue, { fontFamily: 'monospace' }]}>
                      {currentWifiPwd
                        ? (showCurrentWifiPwd ? currentWifiPwd : '••••••••')
                        : '(not available)'}
                    </Text>
                    {currentWifiPwd ? (
                      <TouchableOpacity onPress={() => setShowCurrentWifiPwd(!showCurrentWifiPwd)}>
                        <Ionicons
                          name={showCurrentWifiPwd ? 'eye-off-outline' : 'eye-outline'}
                          size={18} color={COLORS.textMuted}
                        />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </View>

              <ParentalWifiPanel serviceId={serviceId} />

              <View style={styles.warningBox}>
                <Ionicons name="warning-outline" size={20} color="#D97706" />
                <Text style={styles.warningText}>
                  Changing WiFi settings will disconnect all wireless devices. They'll need to reconnect with the new credentials.
                </Text>
              </View>

              <Text style={styles.inputLabel}>WiFi Name (SSID)</Text>
              <TextInput
                style={styles.inputFull}
                value={wifiSsid}
                onChangeText={setWifiSsid}
                placeholder="Enter WiFi name"
                placeholderTextColor={COLORS.textMuted}
              />

              <Text style={styles.inputLabel}>New WiFi Password</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={wifiPass}
                  onChangeText={setWifiPass}
                  placeholder="Min 8 characters"
                  secureTextEntry={!wifiShowPass}
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setWifiShowPass(!wifiShowPass)}
                >
                  <Ionicons
                    name={wifiShowPass ? 'eye-off-outline' : 'eye-outline'}
                    size={20} color={COLORS.textMuted}
                  />
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Confirm WiFi Password</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={wifiConfirm}
                  onChangeText={setWifiConfirm}
                  placeholder="Confirm password"
                  secureTextEntry={!wifiShowPass}
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="none"
                />
              </View>

              {wifiPass && wifiConfirm && wifiPass !== wifiConfirm && (
                <Text style={styles.mismatch}>Passwords do not match</Text>
              )}

              <TouchableOpacity
                style={[styles.submitBtn, styles.submitBtnWifi, wifiLoading && styles.submitBtnDisabled]}
                onPress={handleWifiChange}
                disabled={wifiLoading}
              >
                {wifiLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="wifi-outline" size={18} color="#fff" />
                    <Text style={styles.submitBtnText}>Update WiFi Settings</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* PPPoE info link */}
      {connInfo?.pppoeUsername && (
        <View style={styles.infoFooter}>
          <Ionicons name="information-circle-outline" size={16} color={COLORS.textMuted} />
          <Text style={styles.infoFooterText}>
            PPPoE: {connInfo.pppoeUsername}
            {onu?.speedProfile ? ` • ${onu.speedProfile}` : ''}
          </Text>
        </View>
      )}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SIZES.md, paddingBottom: 100 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Loading overlay
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginHorizontal: 40,
    ...SHADOWS.medium,
  },
  loadingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 16,
  },
  loadingSubtext: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },

  // ONU status badge
  statusCard: {
    flexDirection: 'row', alignItems: 'center', gap: SIZES.sm,
    borderRadius: SIZES.radiusLg, padding: SIZES.md, marginBottom: SIZES.md,
  },
  statusReady: { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0' },
  statusPending: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' },
  statusIconWrap: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  statusTitle: { fontSize: SIZES.body, fontWeight: '700' },
  statusSub: { fontSize: SIZES.caption, marginTop: 2 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotOnline: { backgroundColor: '#10B981' },
  dotOffline: { backgroundColor: '#EF4444' },

  // Tab row
  tabRow: {
    flexDirection: 'row', borderRadius: SIZES.radius,
    backgroundColor: COLORS.surface, padding: 4,
    marginBottom: SIZES.lg, ...SHADOWS.small,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: SIZES.sm, borderRadius: SIZES.radius - 2,
  },
  tabActive: { backgroundColor: COLORS.primary },
  tabText: { fontSize: SIZES.body, fontWeight: '600', color: COLORS.textSecondary },
  tabTextActive: { color: '#fff' },

  // Form card
  formCard: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusLg,
    padding: SIZES.lg, ...SHADOWS.medium,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: SIZES.md },
  headerIcon: {
    width: 48, height: 48, borderRadius: 14, backgroundColor: COLORS.primaryBg,
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: SIZES.bodyLg, fontWeight: '700', color: COLORS.text },
  headerSub: { fontSize: SIZES.caption, color: COLORS.textMuted, marginTop: 2 },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: SIZES.lg },

  // Warning
  warningBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SIZES.sm,
    backgroundColor: '#FEF3C7', borderRadius: SIZES.radius,
    padding: SIZES.md, marginBottom: SIZES.md,
  },
  warningText: { flex: 1, fontSize: SIZES.caption, color: '#92400E', lineHeight: 18 },

  // Current WiFi card
  currentWifiCard: {
    backgroundColor: COLORS.primaryBg || '#FFF4EB',
    borderRadius: SIZES.radius,
    padding: SIZES.md,
    marginBottom: SIZES.md,
    borderWidth: 1,
    borderColor: '#C4D7F2',
  },
  currentWifiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: SIZES.sm,
  },
  currentWifiTitle: {
    fontSize: SIZES.body,
    fontWeight: '700',
    color: COLORS.primary,
  },
  currentWifiRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#C4D7F2',
  },
  currentWifiLabel: {
    fontSize: SIZES.caption,
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  currentWifiValue: {
    fontSize: SIZES.body,
    fontWeight: '600',
    color: COLORS.text,
  },

  // Legacy current info
  currentInfo: {
    backgroundColor: COLORS.background, borderRadius: SIZES.radius,
    padding: SIZES.md, marginBottom: SIZES.md,
  },
  currentLabel: { fontSize: SIZES.caption, color: COLORS.textMuted },
  currentValue: { fontSize: SIZES.body, fontWeight: '700', color: COLORS.text, marginTop: 2 },

  // No ONU
  noOnuWrap: { alignItems: 'center', paddingVertical: SIZES.xl },
  noOnuText: { fontSize: SIZES.body, color: COLORS.textMuted, textAlign: 'center', marginTop: SIZES.md, lineHeight: 22 },

  // Inputs
  inputLabel: {
    fontSize: SIZES.body, fontWeight: '600', color: COLORS.text,
    marginBottom: SIZES.xs, marginTop: SIZES.md,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1.5,
    borderColor: COLORS.border, borderRadius: SIZES.radius,
    backgroundColor: COLORS.background,
  },
  input: {
    flex: 1, paddingHorizontal: SIZES.md, paddingVertical: 14,
    fontSize: SIZES.body, color: COLORS.text,
  },
  inputFull: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: SIZES.radius,
    backgroundColor: COLORS.background, paddingHorizontal: SIZES.md,
    paddingVertical: 14, fontSize: SIZES.body, color: COLORS.text,
  },
  eyeBtn: { paddingHorizontal: SIZES.md },
  mismatch: { fontSize: SIZES.caption, color: COLORS.danger, marginTop: SIZES.xs },

  // Submit buttons
  submitBtn: {
    backgroundColor: COLORS.primary, borderRadius: SIZES.radius,
    paddingVertical: 16, flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', gap: 8, marginTop: SIZES.xl, ...SHADOWS.medium,
  },
  submitBtnWifi: { backgroundColor: '#6366F1' },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: '#fff', fontSize: SIZES.bodyLg, fontWeight: '600' },

  // Footer info
  infoFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: SIZES.lg, paddingHorizontal: 4,
  },
  infoFooterText: { fontSize: SIZES.caption, color: COLORS.textMuted },

  // Manual router guide styles
  manualInfoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SIZES.sm,
    backgroundColor: COLORS.primaryBg, borderRadius: SIZES.radius,
    padding: SIZES.md, marginBottom: SIZES.lg,
    borderLeftWidth: 3, borderLeftColor: COLORS.primary,
  },
  manualInfoText: { flex: 1, fontSize: SIZES.caption, color: COLORS.primary, lineHeight: 19 },

  routerCard: {
    borderRadius: SIZES.radius, overflow: 'hidden',
    marginBottom: SIZES.lg, ...SHADOWS.small,
  },
  routerCardHeader: {
    backgroundColor: COLORS.primary, flexDirection: 'row',
    alignItems: 'center', gap: 8, paddingHorizontal: SIZES.md, paddingVertical: 12,
  },
  routerCardTitle: { color: '#fff', fontWeight: '700', fontSize: SIZES.body },
  routerCardBody: { backgroundColor: COLORS.background, padding: SIZES.md },
  credRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  credLabel: { fontSize: SIZES.caption, color: COLORS.textMuted, fontWeight: '600' },
  credValue: {
    fontSize: SIZES.body, fontWeight: '700', color: COLORS.text,
    fontFamily: 'monospace',
  },

  stepsTitle: {
    fontSize: SIZES.bodyLg, fontWeight: '700', color: COLORS.text,
    marginBottom: SIZES.md,
  },
  stepRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    marginBottom: SIZES.sm, gap: SIZES.sm,
  },
  stepNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.primaryBg, justifyContent: 'center', alignItems: 'center',
  },
  stepNumText: { fontSize: SIZES.caption, fontWeight: '700', color: COLORS.primary },
  stepContent: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingTop: 4 },
  stepText: { flex: 1, fontSize: SIZES.body, color: COLORS.textSecondary, lineHeight: 20 },

  // Video tutorial card
  videoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 14,
    padding: 14,
    marginTop: SIZES.lg,
    gap: 12,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  videoIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoTitle: {
    fontSize: SIZES.body,
    fontWeight: '700',
    color: COLORS.text,
  },
  videoSub: {
    fontSize: SIZES.caption,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // ── Service Picker (gradient header) ──
  servicePickerGradient: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    marginBottom: SIZES.md,
    borderRadius: SIZES.radius,
    overflow: 'hidden',
  },
  servicePickerHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 4, marginBottom: 8,
  },
  servicePickerLabel: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.5 },
  servicePickerScroll: { gap: 8 },
  serviceChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)', minWidth: 160,
  },
  serviceChipActive: { backgroundColor: 'rgba(255,255,255,0.25)', borderColor: 'rgba(255,255,255,0.5)' },
  serviceChipDot: { width: 8, height: 8, borderRadius: 4 },
  dotOnline: { backgroundColor: '#34D399' },
  dotOffline: { backgroundColor: '#F87171' },
  serviceChipName: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  serviceChipNameActive: { color: '#fff' },
  serviceChipPlan: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 1 },
  serviceChipPlanActive: { color: 'rgba(255,255,255,0.85)' },
});
