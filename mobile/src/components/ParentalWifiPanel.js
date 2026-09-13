import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Switch, ActivityIndicator, Alert, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import api from '../api/client';

/**
 * Parental control — toggle WiFi on/off for managed routers (SmartOLT / GenieACS).
 */
export default function ParentalWifiPanel({ serviceId, compact = false }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  const load = useCallback(async () => {
    if (!serviceId) {
      setLoading(false);
      return;
    }
    try {
      const data = await api.getWifiStatus(serviceId);
      setStatus(data);
    } catch {
      setStatus({ canControl: false, error: 'Could not load WiFi status' });
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onToggle = async (nextEnabled) => {
    if (!serviceId || saving) return;
    setSaving(true);
    try {
      const result = await api.setWifiControl(nextEnabled, serviceId);
      if (result?.success) {
        setStatus((prev) => ({
          ...prev,
          wifiEnabled: result.wifiEnabled,
          canControl: true,
        }));
        Alert.alert(
          nextEnabled ? 'WiFi enabled' : 'WiFi disabled',
          result.message || (nextEnabled ? 'Wireless is back on.' : 'Wireless is off.')
        );
      } else {
        Alert.alert('Failed', result?.error || 'Could not update WiFi.');
        await load();
      }
    } catch (e) {
      Alert.alert('Failed', e?.message || 'Could not update WiFi.');
      await load();
    } finally {
      setSaving(false);
    }
  };

  if (!serviceId) return null;

  if (loading) {
    return (
      <View style={[styles.card, compact && styles.cardCompact]}>
        <ActivityIndicator size="small" color={COLORS.primary} />
        <Text style={styles.loadingText}>Checking WiFi status…</Text>
      </View>
    );
  }

  if (!status?.canControl) {
    if (compact) return null;
    return (
      <View style={[styles.card, styles.cardMuted]}>
        <Ionicons name="information-circle-outline" size={20} color={COLORS.textMuted} />
        <Text style={styles.mutedText}>
          {status?.message || 'Parental WiFi control is not available for this router.'}
        </Text>
      </View>
    );
  }

  const enabled = !!status.wifiEnabled;

  if (compact) {
    return (
      <View style={[styles.card, styles.cardCompact]}>
        <View style={styles.row}>
          <View style={[styles.iconWrap, { backgroundColor: enabled ? '#ECFDF5' : '#FEF2F2' }]}>
            <Ionicons name="shield-checkmark-outline" size={22} color={enabled ? '#059669' : '#DC2626'} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Parental WiFi</Text>
            <Text style={styles.sub}>
              {enabled ? 'WiFi is on' : 'WiFi is off — kids offline'}
            </Text>
          </View>
          {saving ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <Switch
              value={enabled}
              onValueChange={onToggle}
              trackColor={{ false: '#D1D5DB', true: '#86EFAC' }}
              thumbColor={enabled ? '#059669' : '#f4f4f5'}
            />
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: '#FEF3C7' }]}>
          <Ionicons name="shield-checkmark-outline" size={24} color="#D97706" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Parental Control</Text>
          <Text style={styles.sub}>
            Turn WiFi off when you need a break — turn it back on anytime.
          </Text>
        </View>
      </View>

      <View style={styles.toggleRow}>
        <View>
          <Text style={styles.toggleLabel}>WiFi network</Text>
          <Text style={styles.toggleState}>
            {enabled ? 'Active — devices can connect' : 'Disabled — wireless is off'}
          </Text>
          {status.ssid ? (
            <Text style={styles.ssid}>{status.ssid}</Text>
          ) : null}
        </View>
        {saving ? (
          <ActivityIndicator size="small" color={COLORS.primary} />
        ) : (
          <Switch
            value={enabled}
            onValueChange={onToggle}
            trackColor={{ false: '#D1D5DB', true: '#86EFAC' }}
            thumbColor={enabled ? '#059669' : '#f4f4f5'}
          />
        )}
      </View>

      <View style={styles.hintBox}>
        <Ionicons name="bulb-outline" size={16} color={COLORS.primary} />
        <Text style={styles.hintText}>
          Internet via cable may still work. Changes can take 1–2 minutes on some routers.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: SIZES.radiusLg,
    padding: SIZES.lg,
    marginBottom: SIZES.lg,
    ...SHADOWS.card,
  },
  cardCompact: {
    marginBottom: 0,
    padding: SIZES.md,
  },
  cardMuted: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#F9FAFB',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  sub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SIZES.lg,
    paddingTop: SIZES.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  toggleState: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  ssid: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
    fontFamily: 'monospace',
  },
  hintBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: SIZES.md,
    padding: 12,
    backgroundColor: COLORS.primaryBg || '#FFF4EB',
    borderRadius: SIZES.radius,
  },
  hintText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 17,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  mutedText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
});
