// ============================================
// HOMELINK Customer App — Coverage Map Screen
// Pinch-to-zoom + pan coverage map (Android+iOS)
// ============================================

import React, { useRef, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, Image, Animated,
  Dimensions, TouchableOpacity, PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const coverageImage = require('../../assets/coverage-map.jpg');

// Distance between two touch points
function getDistance(touches) {
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

export default function CoverageMapScreen() {
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const baseScale = useRef(1);
  const baseTranslateX = useRef(0);
  const baseTranslateY = useRef(0);
  const pinchStartDist = useRef(0);
  const lastPanX = useRef(0);
  const lastPanY = useRef(0);
  const isPinching = useRef(false);

  const [zoomed, setZoomed] = useState(false);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,

    onPanResponderGrant: (evt) => {
      const touches = evt.nativeEvent.touches;
      if (touches.length === 2) {
        isPinching.current = true;
        pinchStartDist.current = getDistance(touches);
      } else {
        isPinching.current = false;
      }
      lastPanX.current = 0;
      lastPanY.current = 0;
    },

    onPanResponderMove: (evt, gestureState) => {
      const touches = evt.nativeEvent.touches;

      if (touches.length === 2 && isPinching.current) {
        const dist = getDistance(touches);
        const newScale = Math.min(Math.max(baseScale.current * (dist / pinchStartDist.current), 1), 5);
        scale.setValue(newScale);
        if (newScale > 1.1) setZoomed(true);
      } else if (baseScale.current > 1 || scale.__getValue() > 1) {
        // Pan (only when zoomed)
        const dx = gestureState.dx - lastPanX.current;
        const dy = gestureState.dy - lastPanY.current;
        lastPanX.current = gestureState.dx;
        lastPanY.current = gestureState.dy;
        const curX = baseTranslateX.current + gestureState.dx;
        const curY = baseTranslateY.current + gestureState.dy;
        translateX.setValue(curX);
        translateY.setValue(curY);
      }
    },

    onPanResponderRelease: () => {
      baseScale.current = scale.__getValue();
      baseTranslateX.current = translateX.__getValue();
      baseTranslateY.current = translateY.__getValue();
      isPinching.current = false;

      if (baseScale.current <= 1.05) {
        resetZoom();
      }
    },
  }), []);

  const resetZoom = () => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 8 }),
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
    ]).start();
    baseScale.current = 1;
    baseTranslateX.current = 0;
    baseTranslateY.current = 0;
    setZoomed(false);
  };

  return (
    <View style={styles.container}>
      {/* Info bar */}
      <View style={styles.infoBar}>
        <Ionicons name="location-outline" size={16} color={COLORS.primary} />
        <Text style={styles.infoText}>Nakuru County  —  Pinch to zoom</Text>
      </View>

      {/* Zoomable Image */}
      <View style={styles.imageWrapper} {...panResponder.panHandlers}>
        <Animated.Image
          source={coverageImage}
          style={[styles.mapImage, {
            transform: [
              { scale },
              { translateX },
              { translateY },
            ],
          }]}
          resizeMode="contain"
        />
      </View>

      {/* Reset button */}
      {zoomed && (
        <TouchableOpacity style={styles.resetBtn} onPress={resetZoom} activeOpacity={0.7}>
          <Ionicons name="scan-outline" size={18} color="#fff" />
          <Text style={styles.resetText}>Reset</Text>
        </TouchableOpacity>
      )}

      {/* Zoom buttons */}
      <View style={styles.zoomBtns}>
        <TouchableOpacity
          style={styles.zoomBtn}
          activeOpacity={0.7}
          onPress={() => {
            const newScale = Math.min(baseScale.current + 0.5, 5);
            baseScale.current = newScale;
            Animated.spring(scale, { toValue: newScale, useNativeDriver: true, friction: 8 }).start();
            setZoomed(newScale > 1.1);
          }}
        >
          <Ionicons name="add" size={22} color="#374151" />
        </TouchableOpacity>
        <View style={styles.zoomDivider} />
        <TouchableOpacity
          style={styles.zoomBtn}
          activeOpacity={0.7}
          onPress={() => {
            const newScale = Math.max(baseScale.current - 0.5, 1);
            baseScale.current = newScale;
            if (newScale <= 1) {
              resetZoom();
            } else {
              Animated.spring(scale, { toValue: newScale, useNativeDriver: true, friction: 8 }).start();
            }
          }}
        >
          <Ionicons name="remove" size={22} color="#374151" />
        </TouchableOpacity>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendRow}>
          <View style={[styles.legendSwatch, { backgroundColor: 'rgba(100,130,200,0.45)' }]} />
          <Text style={styles.legendLabel}>HOMELINK Coverage</Text>
        </View>
        <View style={styles.legendRow}>
          <View style={[styles.legendSwatch, { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#333' }]} />
          <Text style={styles.legendLabel}>County Boundary</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F2F5',
  },
  infoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#EFF6FF',
    borderBottomWidth: 1,
    borderBottomColor: '#DBEAFE',
  },
  infoText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.primary,
  },
  imageWrapper: {
    flex: 1,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapImage: {
    width: SCREEN_W,
    height: SCREEN_H * 0.78,
  },
  resetBtn: {
    position: 'absolute',
    top: 60,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  resetText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  zoomBtns: {
    position: 'absolute',
    bottom: 90,
    right: 16,
    backgroundColor: '#fff',
    borderRadius: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  zoomBtn: {
    width: 42,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  legend: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 10,
    padding: 10,
    paddingHorizontal: 14,
    gap: 6,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendSwatch: {
    width: 16,
    height: 16,
    borderRadius: 3,
  },
  legendLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#374151',
  },
});
