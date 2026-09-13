import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  ActivityIndicator, TouchableOpacity, Linking, Platform, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import api from '../api/client';
import ConnectedDevicesPanel from '../components/ConnectedDevicesPanel';

// ═══════════════════════════════════════════════
// My Network — ONU details, signal, connected
// devices, LAN/WAN ports, optical status.
// All read-only. WiFi change is on ChangePassword.
// Data fetched exactly like frontend OnuDetail.jsx:
//   1) get_onu_details  → ONU info + wifi_ports
//   2) get_onu_signal   → signal strength
//   3) get_onu_full_status_info → connected MACs,
//      LAN ports, WAN interfaces, optical status
// ═══════════════════════════════════════════════

export default function MyNetworkScreen({ navigation, route }) {
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 768;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [allServices, setAllServices] = useState([]);
  const [selectedServiceIdx, setSelectedServiceIdx] = useState(0);

  // Load services list from dashboard
  useEffect(() => {
    (async () => {
      try {
        const dash = await api.getDashboard();
        const svcs = dash?.services || [];
        setAllServices(svcs);
        // If navigated with a specific serviceId, select it
        const navServiceId = route.params?.serviceId;
        if (navServiceId && svcs.length > 0) {
          const idx = svcs.findIndex(s => String(s.id) === String(navServiceId));
          if (idx >= 0) setSelectedServiceIdx(idx);
        }
      } catch {}
    })();
  }, []);

  const selectedService = allServices.length > 0 ? allServices[selectedServiceIdx] || allServices[0] : null;
  const hasMultipleServices = allServices.length > 1;
  const serviceId = selectedService?.id || route.params?.serviceId || null;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result = await api.getOnuDetails(serviceId);
      if (result.error && !result.onuFound) {
        setError(result.error);
      } else {
        setData(result);
      }
    } catch {
      setError('Failed to load network info');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [serviceId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(true); };

  // ── Loading ──
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading device info…</Text>
        <Text style={styles.loadingSubText}>This may take a few seconds</Text>
      </View>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <View style={styles.center}>
        <Ionicons name="cloud-offline-outline" size={48} color={COLORS.textMuted} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Not on SmartOLT — show router access guide ──
  if (!data?.onuFound) {
    const isSyncing = data?.syncHasRun === false;

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.guideContent}>
        {/* Header */}
        <View style={styles.guideHeader}>
          <View style={styles.guideIconWrap}>
            <Ionicons name={isSyncing ? 'sync-outline' : 'wifi-outline'} size={32} color={COLORS.primary} />
          </View>
          <Text style={styles.guideTitle}>
            {isSyncing ? 'Syncing Your Device…' : 'Access Your Router'}
          </Text>
          <Text style={styles.guideSub}>
            {isSyncing
              ? 'Your device data is still being synced. Check back in a few minutes.'
              : 'Your router is not managed remotely. You can access it directly from your local network to view settings and change WiFi.'}
          </Text>
        </View>

        {!isSyncing && (
          <>
            {/* Step-by-step guide */}
            <View style={styles.guideCard}>
              <Text style={styles.guideCardTitle}>How to Access Your Router</Text>

              <GuideStep
                number="1"
                title="Connect to your WiFi"
                desc="Make sure your phone is connected to your home WiFi network (not mobile data)."
                icon="wifi-outline"
              />
              <GuideStep
                number="2"
                title="Open router admin page"
                desc="Open a browser and type one of these addresses. Most routers use 192.168.1.1 or 192.168.0.1."
                icon="globe-outline"
              />

              {/* Common router IPs */}
              <View style={styles.ipGrid}>
                {['192.168.1.1', '192.168.0.1', '192.168.100.1', '10.0.0.1'].map(ip => (
                  <TouchableOpacity
                    key={ip}
                    style={styles.ipChip}
                    onPress={() => Linking.openURL(`http://${ip}`)}
                  >
                    <Text style={styles.ipChipText}>{ip}</Text>
                    <Ionicons name="open-outline" size={12} color={COLORS.primary} />
                  </TouchableOpacity>
                ))}
              </View>

              <GuideStep
                number="3"
                title="Login to the router"
                desc="Enter the admin username and password. Common defaults are shown below."
                icon="key-outline"
              />

              {/* Default credentials table */}
              <View style={styles.credTable}>
                <View style={styles.credHeader}>
                  <Text style={[styles.credCell, styles.credHeaderText, { flex: 1.2 }]}>Router Type</Text>
                  <Text style={[styles.credCell, styles.credHeaderText]}>Username</Text>
                  <Text style={[styles.credCell, styles.credHeaderText]}>Password</Text>
                </View>
                {[
                  { type: 'Most Routers', user: 'admin', pass: 'admin' },
                  { type: 'Huawei ONU', user: 'root', pass: 'admin' },
                  { type: 'ZTE ONU', user: 'admin', pass: 'admin' },
                  { type: 'TP-Link', user: 'admin', pass: 'admin' },
                  { type: 'Mikrotik', user: 'admin', pass: '(blank)' },
                ].map((row, i) => (
                  <View key={i} style={[styles.credRow, i % 2 === 0 && styles.credRowAlt]}>
                    <Text style={[styles.credCell, { flex: 1.2, fontWeight: '600' }]}>{row.type}</Text>
                    <Text style={styles.credCell}>{row.user}</Text>
                    <Text style={[styles.credCell, { fontFamily: 'monospace' }]}>{row.pass}</Text>
                  </View>
                ))}
              </View>

              <GuideStep
                number="4"
                title="Find WiFi settings"
                desc="Look for 'Wireless', 'WiFi', or 'WLAN' in the menu. You can change the WiFi name (SSID) and password from there."
                icon="settings-outline"
              />

              <GuideStep
                number="5"
                title="Save and reconnect"
                desc="After changing settings, click Save/Apply. Your devices will disconnect — reconnect using the new WiFi name and password."
                icon="checkmark-circle-outline"
              />
            </View>

            {/* Tips card */}
            <View style={styles.guideTipsCard}>
              <View style={styles.guideTipsHeader}>
                <Ionicons name="bulb-outline" size={18} color="#D97706" />
                <Text style={styles.guideTipsTitle}>Tips</Text>
              </View>
              <Text style={styles.guideTip}>• If the page doesn't load, make sure you're on WiFi, not mobile data.</Text>
              <Text style={styles.guideTip}>• If the default password doesn't work, check the sticker on the bottom of your router.</Text>
              <Text style={styles.guideTip}>• Use a WiFi password of at least 8 characters with letters and numbers.</Text>
              <Text style={styles.guideTip}>• If you're stuck, contact support via the chat button.</Text>
            </View>

            {/* Quick-open button */}
            <TouchableOpacity
              style={styles.guideOpenBtn}
              onPress={() => Linking.openURL('http://192.168.1.1')}
            >
              <Ionicons name="open-outline" size={18} color="#fff" />
              <Text style={styles.guideOpenBtnText}>Open Router Admin Page</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
          <Text style={styles.retryBtnText}>Refresh</Text>
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  const onu = data.onu || {};
  const signal = data.signal;
  const devices = data.connectedDevices || [];
  const wanIfs = data.wanInterfaces || [];
  const lans = data.lanPorts || [];
  const optical = data.opticalStatus;
  const wifiPorts = onu.wifiPorts || [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, isDesktopWeb && styles.contentDesktop]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
    >
      <View style={isDesktopWeb ? styles.desktopShell : undefined}>

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
                  onPress={() => setSelectedServiceIdx(idx)}
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

      {/* ── Device Status Hero ── */}
      <View style={[styles.heroCard, onu.status === 'Online' ? styles.heroOnline : styles.heroOffline]}>
        <View style={styles.heroIcon}>
          <Ionicons
            name={onu.status === 'Online' ? 'wifi' : 'wifi-outline'}
            size={28}
            color={onu.status === 'Online' ? '#059669' : '#DC2626'}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroName}>{onu.name || 'My Router'}</Text>
          <Text style={styles.heroSub}>
            {onu.serialNumber || '—'} · {onu.onuType || '—'}
          </Text>
        </View>
        <View style={[styles.statusPill, onu.status === 'Online' ? styles.pillOnline : styles.pillOffline]}>
          <View style={[styles.statusDot, onu.status === 'Online' ? styles.dotGreen : styles.dotRed]} />
          <Text style={[styles.statusText, { color: onu.status === 'Online' ? '#059669' : '#DC2626' }]}>
            {onu.status || 'Unknown'}
          </Text>
        </View>
      </View>

      {/* ── Connected Devices (priority — especially on desktop) ── */}
      <SectionCard
        title={`Connected Devices (${devices.length})`}
        icon="phone-portrait-outline"
        highlight={isDesktopWeb}
      >
        <ConnectedDevicesPanel
          devices={devices}
          emptyMessage="No devices detected, or ONU is offline."
        />
      </SectionCard>

      {/* ── ONU Information ── */}
      <SectionCard title="Device Information" icon="hardware-chip-outline">
        <InfoGrid items={[
          { label: 'ONU Type', value: onu.onuType },
          { label: 'Serial Number', value: onu.serialNumber },
          { label: 'OLT', value: onu.oltName },
          { label: 'Zone', value: onu.zone },
          { label: 'ODB', value: onu.odb },
          { label: 'WAN Mode', value: onu.wanMode },
          { label: 'VLAN', value: onu.vlan },
          { label: 'Speed Profile', value: onu.speedProfile },
          { label: 'Download', value: onu.speedDown },
          { label: 'Upload', value: onu.speedUp },
          { label: 'IP Address', value: onu.ipAddress },
          { label: 'MAC Address', value: onu.macAddress },
          { label: 'PPPoE User', value: onu.pppoeUsername },
          { label: 'Admin Status', value: onu.adminStatus },
          { label: 'Authorized', value: onu.authorizedDate },
        ]} />
      </SectionCard>

      {/* ── Signal Strength ── */}
      {signal && (
        <SectionCard title="Signal Strength" icon="analytics-outline">
          <InfoGrid items={[
            { label: 'Quality', value: signal.quality, highlight: true },
            { label: 'Combined', value: signal.value },
            { label: 'RX Power (1490nm)', value: signal.rx1490, signal: true },
            { label: 'TX Power (1310nm)', value: signal.tx1310, signal: true },
          ]} />
          {optical && typeof optical === 'object' && (
            <View style={styles.opticalWrap}>
              <Text style={styles.opticalTitle}>Optical Details</Text>
              <InfoGrid items={Object.entries(optical).map(([k, v]) => ({
                label: k,
                value: typeof v === 'object' ? JSON.stringify(v) : String(v),
              }))} />
            </View>
          )}
        </SectionCard>
      )}

      {/* ── WiFi Ports ── */}
      {wifiPorts.length > 0 && (
        <SectionCard title="WiFi Configuration" icon="wifi-outline">
          {wifiPorts.map((wp, i) => (
            <View key={i} style={[styles.wifiPortCard, wp.admin_state === 'Enabled' ? styles.wifiEnabled : styles.wifiDisabled]}>
              <View style={styles.wifiPortHeader}>
                <Text style={styles.wifiPortName}>{wp.port || `WiFi ${i + 1}`}</Text>
                <View style={[styles.miniPill, wp.admin_state === 'Enabled' ? styles.pillGreen : styles.pillGray]}>
                  <Text style={[styles.miniPillText, { color: wp.admin_state === 'Enabled' ? '#059669' : COLORS.textMuted }]}>
                    {wp.admin_state || 'Unknown'}
                  </Text>
                </View>
                {wp.mode && (
                  <View style={[styles.miniPill, styles.pillBlue]}>
                    <Text style={[styles.miniPillText, { color: COLORS.primary }]}>{wp.mode}</Text>
                  </View>
                )}
              </View>
              <InfoGrid items={[
                { label: 'SSID', value: wp.ssid || '(not managed)' },
                { label: 'Password', value: wp.password ? '••••••••' : '(not managed)' },
                { label: 'Auth', value: wp.auth_mode?.toUpperCase() },
                { label: 'DHCP', value: wp.dhcp },
              ]} />
            </View>
          ))}
          <TouchableOpacity
            style={styles.changeWifiBtn}
            onPress={() => navigation.navigate('ChangePassword', { tab: 'wifi' })}
          >
            <Ionicons name="create-outline" size={18} color="#fff" />
            <Text style={styles.changeWifiBtnText}>Change WiFi Settings</Text>
          </TouchableOpacity>
        </SectionCard>
      )}

      {/* ── WAN Interfaces ── */}
      {wanIfs.length > 0 && (
        <SectionCard title={`WAN Interfaces (${wanIfs.length})`} icon="globe-outline">
          {wanIfs.map((wan, i) => (
            <View key={i} style={styles.wanCard}>
              <View style={styles.wanHeader}>
                <Text style={styles.wanName}>{wan.name || `WAN ${i + 1}`}</Text>
                <View style={[styles.miniPill, wan.connectionStatus === 'Connected' ? styles.pillGreen : styles.pillRed]}>
                  <Text style={[styles.miniPillText, { color: wan.connectionStatus === 'Connected' ? '#059669' : '#DC2626' }]}>
                    {wan.connectionStatus || 'Unknown'}
                  </Text>
                </View>
              </View>
              <InfoGrid items={[
                { label: 'Service', value: wan.serviceType },
                { label: 'Access Type', value: wan.accessType },
                { label: 'IPv4', value: wan.ipv4Address },
                { label: 'Gateway', value: wan.gateway },
                { label: 'Subnet', value: wan.subnet },
                { label: 'VLAN', value: wan.vlan },
                { label: 'MAC', value: wan.mac },
              ]} />
            </View>
          ))}
        </SectionCard>
      )}

      {/* ── LAN Ports ── */}
      {lans.length > 0 && (
        <SectionCard title={`LAN Ports (${lans.length})`} icon="git-network-outline">
          {lans.map((lp, i) => (
            <View key={i} style={styles.lanRow}>
              <View style={styles.lanIcon}>
                <Ionicons
                  name="radio-button-on"
                  size={10}
                  color={lp.linkState?.toLowerCase() === 'up' ? COLORS.success : COLORS.textMuted}
                />
              </View>
              <Text style={styles.lanPort}>LAN {lp.port || i + 1}</Text>
              <Text style={styles.lanDetail}>{lp.speed || '—'}</Text>
              <Text style={styles.lanDetail}>{lp.duplex || '—'}</Text>
              <View style={[styles.miniPill, lp.linkState?.toLowerCase() === 'up' ? styles.pillGreen : styles.pillGray]}>
                <Text style={[styles.miniPillText, { color: lp.linkState?.toLowerCase() === 'up' ? '#059669' : COLORS.textMuted }]}>
                  {lp.linkState || '—'}
                </Text>
              </View>
            </View>
          ))}
        </SectionCard>
      )}

      </View>

      {/* ── Footer ── */}
      <View style={styles.footer}>
        <Ionicons name="time-outline" size={14} color={COLORS.textMuted} />
        <Text style={styles.footerText}>
          Last synced: {onu.lastSynced ? new Date(onu.lastSynced).toLocaleString() : '—'}
        </Text>
      </View>

    </ScrollView>
  );
}

// ═══════════════════════════════════════════════
// Reusable components
// ═══════════════════════════════════════════════

function SectionCard({ title, icon, children, highlight }) {
  return (
    <View style={[styles.sectionCard, highlight && styles.sectionCardHighlight]}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={18} color={COLORS.primary} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function InfoGrid({ items }) {
  const filtered = items.filter(i => i.value && i.value !== '—' && i.value !== 'null');
  if (filtered.length === 0) return null;
  return (
    <View style={styles.infoGrid}>
      {filtered.map((item, i) => (
        <View key={i} style={styles.infoItem}>
          <Text style={styles.infoLabel}>{item.label}</Text>
          <Text style={[
            styles.infoValue,
            item.highlight && styles.infoHighlight,
            item.signal && styles.infoMono,
          ]}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Guide Step Component ──
function GuideStep({ number, title, desc, icon }) {
  return (
    <View style={guideStyles.step}>
      <View style={guideStyles.stepNum}>
        <Text style={guideStyles.stepNumText}>{number}</Text>
      </View>
      <View style={guideStyles.stepBody}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name={icon} size={16} color={COLORS.primary} />
          <Text style={guideStyles.stepTitle}>{title}</Text>
        </View>
        <Text style={guideStyles.stepDesc}>{desc}</Text>
      </View>
    </View>
  );
}

const guideStyles = StyleSheet.create({
  step: { flexDirection: 'row', marginBottom: SIZES.md },
  stepNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center',
    marginRight: SIZES.sm, marginTop: 2,
  },
  stepNumText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  stepBody: { flex: 1 },
  stepTitle: { fontSize: SIZES.body, fontWeight: '700', color: COLORS.text },
  stepDesc: { fontSize: SIZES.caption, color: COLORS.textSecondary, lineHeight: 20, marginTop: 4 },
});

// ═══════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SIZES.md, paddingBottom: 100 },
  contentDesktop: {
    alignItems: 'center',
    paddingHorizontal: SIZES.lg,
  },
  desktopShell: {
    width: '100%',
    maxWidth: 960,
  },
  guideContent: { padding: SIZES.md, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SIZES.xl },
  loadingText: { fontSize: SIZES.body, color: COLORS.text, fontWeight: '600', marginTop: SIZES.md },
  loadingSubText: { fontSize: SIZES.caption, color: COLORS.textMuted, marginTop: 4 },
  errorText: { fontSize: SIZES.body, color: COLORS.textMuted, textAlign: 'center', marginTop: SIZES.md, lineHeight: 22 },
  retryBtn: {
    marginTop: SIZES.lg, backgroundColor: COLORS.primary, borderRadius: SIZES.radius,
    paddingHorizontal: SIZES.xl, paddingVertical: SIZES.sm,
  },
  retryBtnText: { color: '#fff', fontWeight: '600', fontSize: SIZES.body },

  // Hero
  heroCard: {
    flexDirection: 'row', alignItems: 'center', gap: SIZES.md,
    borderRadius: SIZES.radiusLg, padding: SIZES.lg, marginBottom: SIZES.md, ...SHADOWS.medium,
  },
  heroOnline: { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0' },
  heroOffline: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  heroIcon: {
    width: 52, height: 52, borderRadius: 16, backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center', ...SHADOWS.small,
  },
  heroName: { fontSize: SIZES.bodyLg, fontWeight: '700', color: COLORS.text },
  heroSub: { fontSize: SIZES.caption, color: COLORS.textSecondary, marginTop: 2 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  pillOnline: { backgroundColor: '#D1FAE5' },
  pillOffline: { backgroundColor: '#FEE2E2' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  dotGreen: { backgroundColor: '#10B981' },
  dotRed: { backgroundColor: '#EF4444' },
  statusText: { fontSize: SIZES.caption, fontWeight: '700' },

  // Section card
  sectionCard: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusLg,
    padding: SIZES.lg, marginBottom: SIZES.md, ...SHADOWS.small,
  },
  sectionCardHighlight: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    backgroundColor: '#F8FBFF',
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SIZES.md,
  },
  sectionTitle: { fontSize: SIZES.body, fontWeight: '700', color: COLORS.text },

  // Info grid
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  infoItem: { width: '50%', paddingVertical: 6, paddingRight: 8 },
  infoLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '500' },
  infoValue: { fontSize: SIZES.body, color: COLORS.text, fontWeight: '600', marginTop: 1 },
  infoHighlight: { color: COLORS.primary, fontWeight: '700' },
  infoMono: { fontFamily: 'monospace' },

  // Connected devices
  emptyText: { fontSize: SIZES.body, color: COLORS.textMuted, fontStyle: 'italic' },
  deviceRow: {
    flexDirection: 'row', alignItems: 'center', gap: SIZES.sm,
    paddingVertical: SIZES.sm, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  deviceNum: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.primaryBg,
    justifyContent: 'center', alignItems: 'center',
  },
  deviceNumText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  deviceMac: { fontSize: SIZES.body, fontWeight: '600', color: COLORS.text, fontFamily: 'monospace' },
  deviceSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },

  // WiFi
  wifiPortCard: {
    borderRadius: SIZES.radius, padding: SIZES.md, marginBottom: SIZES.sm,
    borderWidth: 1,
  },
  wifiEnabled: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  wifiDisabled: { backgroundColor: COLORS.background, borderColor: COLORS.border, opacity: 0.7 },
  wifiPortHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SIZES.sm },
  wifiPortName: { fontSize: SIZES.body, fontWeight: '700', color: COLORS.text },
  changeWifiBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#6366F1', borderRadius: SIZES.radius,
    paddingVertical: 14, marginTop: SIZES.sm, ...SHADOWS.medium,
  },
  changeWifiBtnText: { color: '#fff', fontSize: SIZES.body, fontWeight: '600' },

  // Mini pills
  miniPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  pillGreen: { backgroundColor: '#D1FAE5' },
  pillRed: { backgroundColor: '#FEE2E2' },
  pillGray: { backgroundColor: '#F3F4F6' },
  pillBlue: { backgroundColor: COLORS.primaryBg },
  miniPillText: { fontSize: 11, fontWeight: '600' },

  // WAN
  wanCard: {
    backgroundColor: COLORS.background, borderRadius: SIZES.radius,
    padding: SIZES.md, marginBottom: SIZES.sm, borderWidth: 1, borderColor: COLORS.border,
  },
  wanHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SIZES.sm },
  wanName: { fontSize: SIZES.body, fontWeight: '700', color: COLORS.text },

  // LAN
  lanRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  lanIcon: { width: 20, alignItems: 'center' },
  lanPort: { fontSize: SIZES.body, fontWeight: '600', color: COLORS.text, width: 60 },
  lanDetail: { fontSize: SIZES.caption, color: COLORS.textSecondary, flex: 1 },

  // Optical
  opticalWrap: { marginTop: SIZES.md, paddingTop: SIZES.sm, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  opticalTitle: { fontSize: SIZES.caption, fontWeight: '700', color: COLORS.textMuted, marginBottom: 6 },

  // Footer
  footer: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, marginTop: 4 },
  footerText: { fontSize: SIZES.caption, color: COLORS.textMuted },

  // ── Router Access Guide ──
  guideHeader: { alignItems: 'center', marginBottom: SIZES.lg, paddingTop: SIZES.md },
  guideIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: COLORS.primaryBg, justifyContent: 'center', alignItems: 'center',
    marginBottom: SIZES.md,
  },
  guideTitle: { fontSize: SIZES.subtitle, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  guideSub: { fontSize: SIZES.body, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, marginTop: SIZES.xs, paddingHorizontal: SIZES.md },
  guideCard: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusLg,
    padding: SIZES.lg, marginBottom: SIZES.md, ...SHADOWS.medium,
  },
  guideCardTitle: { fontSize: SIZES.bodyLg, fontWeight: '700', color: COLORS.text, marginBottom: SIZES.lg },

  ipGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    marginBottom: SIZES.lg, marginLeft: 36,
  },
  ipChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.primaryBg, borderRadius: 20,
    paddingVertical: 8, paddingHorizontal: 14,
    borderWidth: 1, borderColor: '#C4D7F2',
  },
  ipChipText: { fontSize: SIZES.body, fontWeight: '600', color: COLORS.primary, fontFamily: 'monospace' },

  credTable: { marginBottom: SIZES.lg, marginLeft: 36, borderRadius: SIZES.radius, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
  credHeader: { flexDirection: 'row', backgroundColor: COLORS.primary, paddingVertical: 8, paddingHorizontal: 10 },
  credHeaderText: { fontWeight: '700', color: '#fff', fontSize: 11 },
  credRow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10 },
  credRowAlt: { backgroundColor: '#F8FAFC' },
  credCell: { flex: 1, fontSize: 12, color: COLORS.text },

  guideTipsCard: {
    backgroundColor: '#FFFBEB', borderRadius: SIZES.radiusLg,
    padding: SIZES.lg, marginBottom: SIZES.lg,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  guideTipsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SIZES.sm },
  guideTipsTitle: { fontSize: SIZES.body, fontWeight: '700', color: '#92400E' },
  guideTip: { fontSize: SIZES.caption, color: '#78350F', lineHeight: 20, marginBottom: 4 },

  guideOpenBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.primary, borderRadius: SIZES.radius,
    paddingVertical: 14, marginBottom: SIZES.md, ...SHADOWS.soft,
  },
  guideOpenBtnText: { fontSize: SIZES.body, fontWeight: '700', color: '#fff' },

  // ── Service Picker (gradient header) ──
  servicePickerGradient: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    marginBottom: SIZES.md,
    borderRadius: SIZES.radiusLg,
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
