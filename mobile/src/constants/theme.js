// TCOM Customer App — Theme & Constants
// Matches tonycommgroupltd.com design system
export const COLORS = {
  // Primary brand — Logo Blue across the entire app
  primary: '#1A73E8',        // TCOM logo blue
  primaryLight: '#4285F4',
  primaryDark: '#1557B0',
  primaryBg: '#E8F0FE',      // Blue-50

  // Secondary — Slightly darker blue for depth/contrast
  secondary: '#1557B0',
  secondaryLight: '#1A73E8',
  secondaryDark: '#0D47A1',
  secondaryBg: '#DBEAFE',

  // Accent — M-Pesa green for payments
  accent: '#10B981',
  accentLight: '#34D399',
  accentDark: '#059669',
  accentBg: '#ECFDF5',

  // Status
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',

  // Neutral — Clean whites & Tailwind grays
  background: '#F8FAFC',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  border: '#E5E7EB',
  borderLight: '#F3F4F6',

  // Text
  text: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  textOnPrimary: '#FFFFFF',
  textOnDark: '#F9FAFB',

  // Dark surfaces
  dark: '#1F2937',
  darker: '#111827',
};

export const FONTS = {
  regular: { fontWeight: '400' },
  medium: { fontWeight: '500' },
  semiBold: { fontWeight: '600' },
  bold: { fontWeight: '700' },
};

export const SIZES = {
  // Padding / Margins
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,

  // Border radius
  radiusSm: 8,
  radius: 12,
  radiusLg: 16,
  radiusXl: 24,
  radiusFull: 999,

  // Font sizes
  caption: 12,
  body: 14,
  bodyLg: 16,
  subtitle: 18,
  title: 22,
  heading: 28,
  hero: 34,
};

export const SHADOWS = {
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  large: {
    shadowColor: '#1A73E8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  // Elevated card with blue tint like website
  card: {
    shadowColor: '#1A73E8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
};
