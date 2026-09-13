import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Linking, StatusBar, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';

import { BASE_URL as API_URL } from '../api/client';
const WA_NUMBER = '254110345166';

const SPEED_DESC = {
  5:   'Basic browsing & social media',
  8:   'Streaming & light gaming',
  10:  'HD streaming & remote work',
  12:  'Multiple devices & video calls',
  15:  'Heavy usage & 4K streaming',
  20:  'Power users & smart home',
  35:  'Ultra-fast for large households',
  100: 'Business-grade speed',
};

export default function JoinCommunityScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/plans/packages`)
      .then(r => r.json())
      .then(data => {
        setPlans(data.map(p => ({
          speed: p.speed,
          price: p.price,
          desc: SPEED_DESC[p.speed] || 'High-speed internet',
        })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleApply = () => {
    if (selected === null) return;
    const plan = plans[selected];
    const msg =
      `Hello HOMELINK! 👋\n\nI would like to apply for a new internet connection.\n\n` +
      `📦 Package: *${plan.speed} Mbps (${plan.speed * 2} Mbps double speed) - KES ${plan.price.toLocaleString()}/month*\n\n` +
      `Please advise on the next steps. Thank you!`;
    const url = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
    Linking.openURL(url);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1A1A2E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Join HOMELINK Community</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Installation Info */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Ionicons name="construct-outline" size={22} color="#F58220" />
            <Text style={styles.infoTitle}>Installation Charges</Text>
          </View>

          <View style={styles.priceRow}>
            <View style={styles.priceItem}>
              <Text style={styles.priceAmount}>KES 3,500</Text>
              <Text style={styles.priceLabel}>Full Installation</Text>
              <Text style={styles.priceNote}>Includes router + setup</Text>
            </View>
            <View style={styles.priceDivider} />
            <View style={styles.priceItem}>
              <Text style={styles.priceAmount}>KES 1,500</Text>
              <Text style={styles.priceLabel}>Own Gadget</Text>
              <Text style={styles.priceNote}>Bring your own router</Text>
            </View>
          </View>

          <View style={styles.freeTag}>
            <Ionicons name="gift-outline" size={16} color="#10B981" />
            <Text style={styles.freeTagText}>1 Month FREE Internet included with every new installation!</Text>
          </View>
        </View>

        {/* Double Speed Banner */}
        <View style={styles.doubleSpeedBanner}>
          <Ionicons name="rocket-outline" size={18} color="#F58220" />
          <Text style={styles.doubleSpeedText}>
            🚀 All speeds are <Text style={{ fontWeight: '800' }}>DOUBLE SPEED</Text> — get twice the bandwidth!
          </Text>
        </View>

        {/* Select Package */}
        <Text style={styles.sectionTitle}>Select Your Package</Text>
        <Text style={styles.sectionSub}>Choose a plan that suits your needs</Text>

        {loading ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginVertical: 30 }} />
        ) : plans.map((plan, i) => {
          const active = selected === i;
          return (
            <TouchableOpacity
              key={i}
              style={[styles.planCard, active && styles.planCardActive]}
              onPress={() => setSelected(i)}
              activeOpacity={0.7}
            >
              <View style={styles.planLeft}>
                <View style={[styles.radio, active && styles.radioActive]}>
                  {active && <View style={styles.radioDot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.planName, active && styles.planNameActive]}>
                    {plan.speed} Mbps
                  </Text>
                  <Text style={styles.planSpeed}>
                    ⚡ {plan.speed * 2} Mbps double speed
                  </Text>
                  <Text style={styles.planDesc}>{plan.desc}</Text>
                </View>
              </View>
              <View style={styles.planRight}>
                <Text style={[styles.planPrice, active && styles.planPriceActive]}>
                  KES {plan.price.toLocaleString()}
                </Text>
                <Text style={styles.planPer}>/month</Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Apply Button */}
        <TouchableOpacity
          style={[styles.applyBtn, selected === null && styles.applyBtnDisabled]}
          onPress={handleApply}
          activeOpacity={0.85}
          disabled={selected === null}
        >
          <LinearGradient
            colors={selected !== null ? ['#25D366', '#128C7E'] : ['#A0AEC0', '#A0AEC0']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.applyGrad}
          >
            <Ionicons name="logo-whatsapp" size={22} color="#fff" />
            <Text style={styles.applyText}>Apply via WhatsApp</Text>
          </LinearGradient>
        </TouchableOpacity>

        <Text style={styles.applyHint}>
          You'll be redirected to WhatsApp to complete your application
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A2E',
  },
  scroll: {
    padding: 16,
  },

  // Installation Info
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A1A2E',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  priceItem: {
    flex: 1,
    alignItems: 'center',
  },
  priceAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F58220',
    marginBottom: 4,
  },
  priceLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A1A2E',
    marginBottom: 2,
  },
  priceNote: {
    fontSize: 11,
    color: '#8896AB',
  },
  priceDivider: {
    width: 1,
    height: 50,
    backgroundColor: '#E2E8F0',
  },
  freeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    padding: 12,
  },
  freeTagText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#10B981',
    lineHeight: 18,
  },

  // Double Speed Banner
  doubleSpeedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF4EB',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  doubleSpeedText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#F58220',
    lineHeight: 18,
  },

  // Section
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A2E',
    marginBottom: 4,
  },
  sectionSub: {
    fontSize: 13,
    color: '#8896AB',
    marginBottom: 16,
  },

  // Plan cards
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  planCardActive: {
    borderColor: '#F58220',
    backgroundColor: '#F0F7FF',
  },
  planLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    borderColor: '#F58220',
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#F58220',
  },
  planName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A2E',
  },
  planNameActive: {
    color: '#F58220',
  },
  planSpeed: {
    fontSize: 11,
    fontWeight: '600',
    color: '#F58220',
    marginTop: 2,
  },
  planDesc: {
    fontSize: 12,
    color: '#8896AB',
    marginTop: 2,
  },
  planRight: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  planPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1A1A2E',
  },
  planPriceActive: {
    color: '#F58220',
  },
  planPer: {
    fontSize: 11,
    color: '#8896AB',
  },

  // Apply
  applyBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 20,
    elevation: 4,
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  applyBtnDisabled: {
    elevation: 0,
    shadowOpacity: 0,
  },
  applyGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  applyText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  applyHint: {
    fontSize: 12,
    color: '#8896AB',
    textAlign: 'center',
    marginTop: 10,
  },
});
