import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import api from '../api/client';

function signalQuality(dbm) {
  const val = parseFloat(dbm);
  if (isNaN(val)) return { label: 'Unknown', color: COLORS.textMuted };
  if (val >= -25) return { label: 'Excellent', color: COLORS.success };
  if (val >= -28) return { label: 'Good', color: '#22C55E' };
  if (val >= -30) return { label: 'Fair', color: COLORS.accent };
  return { label: 'Poor', color: COLORS.danger };
}

export default function ConnectionScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    try {
      const result = await api.getConnectionStatus();
      setData(result);
    } catch (err) {
      console.warn('Failed to load connection status:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.loadingWrap}>
        <Ionicons name="cloud-offline-outline" size={48} color={COLORS.textMuted} />
        <Text style={styles.errorText}>Could not load connection status</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isOnline = data.status === 'online';
  const rx = signalQuality(data.signal?.rx_power);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
    >
      {/* Status Banner */}
      <View style={[styles.statusBanner, { backgroundColor: isOnline ? COLORS.success : COLORS.danger }]}>
        <View style={styles.statusDot} />
        <Text style={styles.statusText}>
          {isOnline ? 'Connected' : 'Disconnected'}
        </Text>
        <Ionicons
          name={isOnline ? 'checkmark-circle' : 'close-circle'}
          size={24} color="#fff"
        />
      </View>

      {/* ONU Info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>ONU Information</Text>
        <InfoRow icon="hardware-chip-outline" label="ONU Type" value={data.onu_type || '—'} />
        <InfoRow icon="barcode-outline" label="Serial Number" value={data.sn || '—'} />
        <InfoRow icon="person-outline" label="PPPoE Name" value={data.pppoe_name || '—'} />
        <InfoRow icon="time-outline" label="Uptime" value={data.uptime || '—'} />
      </View>

      {/* Signal Strength */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Signal Strength</Text>
        <View style={styles.signalMain}>
          <View style={styles.signalCircle}>
            <Text style={[styles.signalValue, { color: rx.color }]}>
              {data.signal?.rx_power || '—'}
            </Text>
            <Text style={styles.signalUnit}>dBm</Text>
          </View>
          <Text style={[styles.signalQuality, { color: rx.color }]}>{rx.label}</Text>
        </View>
        <View style={styles.signalGrid}>
          <SignalMetric label="RX Power (1490nm)" value={data.signal?.rx_power} unit="dBm" />
          <SignalMetric label="TX Power (1310nm)" value={data.signal?.tx_power} unit="dBm" />
          <SignalMetric label="OLT RX Power" value={data.signal?.olt_rx_power} unit="dBm" />
          <SignalMetric label="Temperature" value={data.signal?.temperature} unit="°C" />
          <SignalMetric label="Voltage" value={data.signal?.voltage} unit="V" />
          <SignalMetric label="Distance" value={data.signal?.distance} unit="m" />
        </View>
      </View>

      {/* Connected Devices */}
      {data.connected_devices && data.connected_devices.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Connected Devices ({data.connected_devices.length})
          </Text>
          {data.connected_devices.map((dev, i) => (
            <View key={i} style={styles.deviceRow}>
              <View style={styles.deviceIcon}>
                <Ionicons
                  name={dev.connection === 'WiFi' ? 'wifi-outline' : 'git-network-outline'}
                  size={18} color={COLORS.primary}
                />
              </View>
              <View style={styles.deviceInfo}>
                <Text style={styles.deviceName}>{dev.name || 'Unknown Device'}</Text>
                <Text style={styles.deviceMeta}>
                  {dev.ip} • {dev.mac}
                </Text>
              </View>
              <View style={[
                styles.connectionBadge,
                { backgroundColor: dev.connection === 'WiFi' ? '#EFF6FF' : '#F0FDF4' }
              ]}>
                <Text style={[
                  styles.connectionText,
                  { color: dev.connection === 'WiFi' ? '#2563EB' : COLORS.success }
                ]}>
                  {dev.connection}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* LAN Ports */}
      {data.lan_ports && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>LAN Ports</Text>
          <View style={styles.portGrid}>
            {Object.entries(data.lan_ports).map(([port, status]) => (
              <View key={port} style={styles.portItem}>
                <View style={[
                  styles.portIcon,
                  { backgroundColor: status === 'up' ? '#D1FAE5' : '#F3F4F6' }
                ]}>
                  <Ionicons
                    name="git-network-outline"
                    size={20}
                    color={status === 'up' ? COLORS.success : COLORS.textMuted}
                  />
                </View>
                <Text style={styles.portLabel}>{port.toUpperCase()}</Text>
                <Text style={[
                  styles.portStatus,
                  { color: status === 'up' ? COLORS.success : COLORS.textMuted }
                ]}>
                  {status === 'up' ? 'Active' : 'Inactive'}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* WiFi Info */}
      {data.wifi && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>WiFi Configuration</Text>
          <InfoRow icon="wifi-outline" label="SSID" value={data.wifi.ssid || '—'} />
          <InfoRow icon="radio-outline" label="Band" value={data.wifi.band || '—'} />
          <InfoRow icon="speedometer-outline" label="Channel" value={data.wifi.channel || '—'} />
        </View>
      )}
    </ScrollView>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color={COLORS.primary} style={{ marginRight: SIZES.sm }} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function SignalMetric({ label, value, unit }) {
  return (
    <View style={styles.metricItem}>
      <Text style={styles.metricValue}>
        {value ?? '—'} <Text style={styles.metricUnit}>{value ? unit : ''}</Text>
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SIZES.md, paddingBottom: 100 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: SIZES.md },
  errorText: { fontSize: SIZES.body, color: COLORS.textMuted },
  retryBtn: {
    backgroundColor: COLORS.primary, borderRadius: SIZES.radius,
    paddingVertical: SIZES.sm, paddingHorizontal: SIZES.xl,
  },
  retryBtnText: { color: '#fff', fontWeight: '600', fontSize: SIZES.body },

  // Status Banner
  statusBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: SIZES.radiusLg, padding: SIZES.lg, marginBottom: SIZES.lg,
    gap: SIZES.sm,
  },
  statusDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff',
  },
  statusText: { fontSize: SIZES.subtitle, fontWeight: '700', color: '#fff' },

  // Card
  card: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusLg,
    padding: SIZES.lg, marginBottom: SIZES.md, ...SHADOWS.medium,
  },
  cardTitle: {
    fontSize: SIZES.bodyLg, fontWeight: '700', color: COLORS.text,
    marginBottom: SIZES.md,
  },

  // Info Rows
  infoRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: SIZES.sm, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  infoLabel: { flex: 1, fontSize: SIZES.body, color: COLORS.textSecondary },
  infoValue: { fontSize: SIZES.body, fontWeight: '600', color: COLORS.text },

  // Signal
  signalMain: { alignItems: 'center', marginBottom: SIZES.lg },
  signalCircle: {
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 3, borderColor: COLORS.border,
    justifyContent: 'center', alignItems: 'center', marginBottom: SIZES.sm,
  },
  signalValue: { fontSize: SIZES.subtitle, fontWeight: '700' },
  signalUnit: { fontSize: SIZES.caption, color: COLORS.textMuted },
  signalQuality: { fontSize: SIZES.bodyLg, fontWeight: '700' },

  signalGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: SIZES.sm,
  },
  metricItem: {
    width: '48%', backgroundColor: COLORS.background,
    borderRadius: SIZES.radius, padding: SIZES.md, alignItems: 'center',
  },
  metricValue: { fontSize: SIZES.bodyLg, fontWeight: '700', color: COLORS.text },
  metricUnit: { fontSize: SIZES.caption, fontWeight: '400', color: COLORS.textMuted },
  metricLabel: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center', marginTop: 4 },

  // Devices
  deviceRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: SIZES.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  deviceIcon: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primaryBg,
    justifyContent: 'center', alignItems: 'center', marginRight: SIZES.sm,
  },
  deviceInfo: { flex: 1 },
  deviceName: { fontSize: SIZES.body, fontWeight: '600', color: COLORS.text },
  deviceMeta: { fontSize: SIZES.caption, color: COLORS.textMuted, marginTop: 2 },
  connectionBadge: { paddingHorizontal: SIZES.sm, paddingVertical: 4, borderRadius: 12 },
  connectionText: { fontSize: 11, fontWeight: '600' },

  // LAN Ports
  portGrid: { flexDirection: 'row', gap: SIZES.md, justifyContent: 'center' },
  portItem: { alignItems: 'center' },
  portIcon: {
    width: 48, height: 48, borderRadius: 24,
    justifyContent: 'center', alignItems: 'center', marginBottom: SIZES.xs,
  },
  portLabel: { fontSize: SIZES.caption, fontWeight: '600', color: COLORS.text },
  portStatus: { fontSize: 11, marginTop: 2 },
});
