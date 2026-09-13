// ============================================
// HOMELINK Customer App — Edit Profile Screen
// ============================================
// Allows customers to update their personal info:
// name, phone, address, city
// ============================================

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES, SHADOWS } from '../constants/theme';
import api from '../api/client';

export default function EditProfileScreen({ route, navigation }) {
  const { profile } = route.params || {};

  // ── Form state (pre-filled from current profile) ──
  const [name, setName] = useState(profile?.name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [address, setAddress] = useState(profile?.address || '');
  const [city, setCity] = useState(profile?.city || '');
  const [saving, setSaving] = useState(false);

  // Track if anything changed
  const hasChanges =
    name !== (profile?.name || '') ||
    phone !== (profile?.phone || '') ||
    address !== (profile?.address || '') ||
    city !== (profile?.city || '');

  const handleSave = async () => {
    // Validate
    if (!name.trim()) {
      Alert.alert('Required', 'Full name is required');
      return;
    }
    if (!phone.trim() || phone.trim().length < 10) {
      Alert.alert('Required', 'Please enter a valid phone number');
      return;
    }

    setSaving(true);
    try {
      const result = await api.updateProfile({
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        city: city.trim(),
      });

      if (result.success) {
        Alert.alert('Success', 'Your profile has been updated', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else {
        Alert.alert('Error', result.error || 'Failed to update profile');
      }
    } catch (err) {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header Icon */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="create-outline" size={28} color={COLORS.primary} />
          </View>
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <Text style={styles.headerSub}>Update your personal information below</Text>
        </View>

        {/* Form Fields */}
        <View style={styles.formCard}>
          <FormField
            icon="person-outline"
            label="Full Name"
            value={name}
            onChangeText={setName}
            placeholder="Enter your full name"
            autoCapitalize="words"
          />
          <FormField
            icon="call-outline"
            label="Phone Number"
            value={phone}
            onChangeText={setPhone}
            placeholder="0712345678"
            keyboardType="phone-pad"
          />
          <FormField
            icon="location-outline"
            label="Address"
            value={address}
            onChangeText={setAddress}
            placeholder="Enter your address"
            autoCapitalize="sentences"
          />
          <FormField
            icon="business-outline"
            label="City / Town"
            value={city}
            onChangeText={setCity}
            placeholder="Enter your city or town"
            autoCapitalize="words"
            isLast
          />
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveBtn, (!hasChanges || saving) && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!hasChanges || saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
              <Text style={styles.saveBtnText}>Save Changes</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Cancel */}
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Form Field Component ──
function FormField({ icon, label, value, onChangeText, placeholder, keyboardType, autoCapitalize, isLast }) {
  return (
    <View style={[styles.fieldWrap, !isLast && styles.fieldBorder]}>
      <View style={styles.fieldLabel}>
        <Ionicons name={icon} size={15} color={COLORS.primary} />
        <Text style={styles.fieldLabelText}>{label}</Text>
      </View>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
        keyboardType={keyboardType || 'default'}
        autoCapitalize={autoCapitalize || 'none'}
        returnKeyType="next"
      />
    </View>
  );
}

// ── Styles ──
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SIZES.lg, paddingBottom: 40 },

  header: { alignItems: 'center', marginBottom: SIZES.xl, marginTop: SIZES.sm },
  headerIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: COLORS.primaryBg,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: SIZES.sm,
  },
  headerTitle: { fontSize: SIZES.subtitle, fontWeight: '700', color: COLORS.text },
  headerSub: { fontSize: SIZES.caption, color: COLORS.textMuted, marginTop: 4 },

  formCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    overflow: 'hidden',
    ...SHADOWS.medium,
  },

  fieldWrap: { paddingHorizontal: SIZES.md, paddingVertical: SIZES.md },
  fieldBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  fieldLabel: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6,
  },
  fieldLabelText: {
    fontSize: SIZES.caption, fontWeight: '600', color: COLORS.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  fieldInput: {
    fontSize: SIZES.body, color: COLORS.text, paddingVertical: 8,
    paddingHorizontal: 12, backgroundColor: COLORS.background,
    borderRadius: SIZES.radius, borderWidth: 1, borderColor: COLORS.border,
  },

  saveBtn: {
    backgroundColor: COLORS.primary, borderRadius: SIZES.radius,
    paddingVertical: 16, flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', gap: 8, marginTop: SIZES.xl, ...SHADOWS.medium,
  },
  saveBtnText: { color: '#fff', fontSize: SIZES.bodyLg, fontWeight: '700' },
  saveBtnDisabled: { opacity: 0.5 },

  cancelBtn: { alignItems: 'center', marginTop: SIZES.md, paddingVertical: 12 },
  cancelBtnText: { fontSize: SIZES.body, color: COLORS.textMuted, fontWeight: '500' },
});
