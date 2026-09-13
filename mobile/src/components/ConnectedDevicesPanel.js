import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants/theme';

/**
 * Connected devices list — shared by My Network & Usage (web/desktop).
 */
export default function ConnectedDevicesPanel({
  devices = [],
  loading = false,
  compact = false,
  emptyMessage = 'No devices detected, or ONU is offline.',
}) {
  const isWeb = Platform.OS === 'web';

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.loadingText}>Loading connected devices…</Text>
      </View>
    );
  }

  if (!devices.length) {
    return <Text style={styles.emptyText}>{emptyMessage}</Text>;
  }

  return (
    <View style={[styles.grid, isWeb && styles.gridWeb, compact && styles.gridCompact]}>
      {devices.map((dev, i) => (
        <View key={`${dev.mac}-${i}`} style={[styles.card, isWeb && styles.cardWeb]}>
          <View style={styles.cardHead}>
            <View style={styles.numBadge}>
              <Text style={styles.numText}>{i + 1}</Text>
            </View>
            <Ionicons name="ellipse" size={8} color={COLORS.success} />
          </View>
          <Text style={styles.mac}>{dev.mac}</Text>
          <Text style={styles.meta}>
            {dev.port}{dev.vlan && dev.vlan !== '—' ? ` · VLAN ${dev.vlan}` : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { paddingVertical: SIZES.md },
  loadingText: { color: COLORS.textMuted, fontSize: SIZES.body },
  emptyText: { fontSize: SIZES.body, color: COLORS.textMuted, fontStyle: 'italic' },
  grid: { gap: SIZES.sm },
  gridWeb: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  gridCompact: { marginTop: 4 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.sm,
    paddingVertical: SIZES.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  cardWeb: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    width: 220,
    minHeight: 88,
    padding: 14,
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  numBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primaryBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  numText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  mac: {
    fontSize: SIZES.body,
    fontWeight: '600',
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    flex: 1,
  },
  meta: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
});
