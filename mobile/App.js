import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Image, View, Text, TouchableOpacity, StyleSheet, Platform, Animated, PanResponder, Dimensions, Easing } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';

import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { COLORS } from './src/constants/theme';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import OtpScreen from './src/screens/OtpScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import InvoicesScreen from './src/screens/InvoicesScreen';
import StatementScreen from './src/screens/StatementScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import PaymentScreen from './src/screens/PaymentScreen';
import ChangePasswordScreen from './src/screens/ChangePasswordScreen';
import SetPasswordScreen from './src/screens/SetPasswordScreen';
import ChatScreen from './src/screens/ChatScreen';
import SupportScreen from './src/screens/SupportScreen';
import TicketsScreen from './src/screens/TicketsScreen';
import UpgradePlanScreen from './src/screens/UpgradePlanScreen';
import UsageScreen from './src/screens/UsageScreen';
import DataUsageScreen from './src/screens/DataUsageScreen';
import RewardsScreen from './src/screens/RewardsScreen';
import MyNetworkScreen from './src/screens/MyNetworkScreen';
import EditProfileScreen from './src/screens/EditProfileScreen';
import NotificationScreen from './src/screens/NotificationScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import WelcomeScreen from './src/screens/WelcomeScreen';
import TermsScreen from './src/screens/TermsScreen';
import FupScreen from './src/screens/FupScreen';
import JoinCommunityScreen from './src/screens/JoinCommunityScreen';
import TcomServicesScreen from './src/screens/TcomServicesScreen';
import TcomHostingScreen from './src/screens/TcomHostingScreen';
import CoverageMapScreen from './src/screens/CoverageMapScreen';
import api from './src/api/client';

// ErrorBoundary to prevent chat crashes from killing the entire app
class ChatErrorBoundary extends React.Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  reset = () => this.setState({ hasError: false });
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Ionicons name="warning-outline" size={40} color="#F59E0B" />
          <Text style={{ fontSize: 16, fontWeight: '600', marginTop: 12, color: '#333' }}>Chat encountered an error</Text>
          <TouchableOpacity
            onPress={this.reset}
            style={{ marginTop: 16, backgroundColor: '#F58220', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 }}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// Shared header config — clean white with indigo text
const HEADER_CONFIG = {
  headerStyle: { backgroundColor: COLORS.surface, elevation: 2, shadowOpacity: 0.08 },
  headerTintColor: COLORS.primary,
  headerTitleStyle: { fontWeight: '600', color: COLORS.text },
};

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();
const InvoicesStack = createNativeStackNavigator();
const SupportStack = createNativeStackNavigator();
const UsageStackNav = createNativeStackNavigator();
const ProfileStackNav = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();

// --- Home stack (Dashboard + Payment + ChangePassword) ---
function HomeStackScreen() {
  const [unreadCount, setUnreadCount] = useState(0);
  const intervalRef = useRef(null);

  const fetchUnread = useCallback(async () => {
    try {
      const res = await api.getUnreadCount();
      const count = res.count || 0;
      setUnreadCount(count);
      // Update app icon badge (the number on the app icon on home screen)
      Notifications.setBadgeCountAsync(count).catch(() => {});
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchUnread();
    intervalRef.current = setInterval(fetchUnread, 30000); // poll every 30s
    return () => clearInterval(intervalRef.current);
  }, [fetchUnread]);

  return (
    <HomeStack.Navigator screenOptions={HEADER_CONFIG}>
      <HomeStack.Screen
        name="DashboardHome"
        component={DashboardScreen}
        options={({ navigation }) => ({
          headerTitle: () => (
            <Image
              source={require('./assets/logo.png')}
              style={{ width: 100, height: 32 }}
              resizeMode="contain"
            />
          ),
          headerTitleAlign: 'center',
          headerLeft: () => null,
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 4 }}>
              <TouchableOpacity
                style={{ width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' }}
                onPress={() => { navigation.navigate('Notifications'); fetchUnread(); }}
              >
                <Ionicons name="notifications-outline" size={22} color={COLORS.text} />
                {unreadCount > 0 && (
                  <View style={bellBadgeStyles.badge}>
                    <Text style={bellBadgeStyles.badgeText}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={{ width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' }}
                onPress={() => navigation.navigate('Profile')}
              >
                <Ionicons name="person-circle-outline" size={26} color={COLORS.text} />
              </TouchableOpacity>
            </View>
          ),
        })}
      />
      <HomeStack.Screen
        name="Payment"
        component={PaymentScreen}
        options={{ title: 'Pay Invoice' }}
      />
      <HomeStack.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
        options={{ title: 'Change Password' }}
      />
      <HomeStack.Screen
        name="ChangePlan"
        component={UpgradePlanScreen}
        options={{ title: 'Change Plan' }}
      />
      <HomeStack.Screen
        name="Rewards"
        component={RewardsScreen}
        options={{ title: 'Loyalty Rewards' }}
      />
      <HomeStack.Screen
        name="MyNetwork"
        component={MyNetworkScreen}
        options={{ title: 'My Network' }}
      />
      <HomeStack.Screen
        name="DataUsage"
        component={DataUsageScreen}
        options={{ title: 'Data Usage' }}
      />
      <HomeStack.Screen
        name="Notifications"
        component={NotificationScreen}
        options={{ title: 'Notifications' }}
      />
      <HomeStack.Screen
        name="CoverageMap"
        component={CoverageMapScreen}
        options={{ title: 'Coverage Map' }}
      />
    </HomeStack.Navigator>
  );
}

// --- Invoices stack (list + pay + statement) ---
function InvoicesStackScreen() {
  return (
    <InvoicesStack.Navigator screenOptions={HEADER_CONFIG}>
      <InvoicesStack.Screen
        name="InvoicesList"
        component={InvoicesScreen}
        options={{ title: 'Invoices' }}
      />
      <InvoicesStack.Screen
        name="Payment"
        component={PaymentScreen}
        options={{ title: 'Pay Invoice' }}
      />
      <InvoicesStack.Screen
        name="Statement"
        component={StatementScreen}
        options={{ title: 'Full Statement' }}
      />
    </InvoicesStack.Navigator>
  );
}

// --- Usage / Services stack ---
function UsageStackScreen() {
  return (
    <UsageStackNav.Navigator screenOptions={HEADER_CONFIG}>
      <UsageStackNav.Screen
        name="UsageHub"
        component={UsageScreen}
        options={{ title: 'My Service' }}
      />
      <UsageStackNav.Screen
        name="MyNetwork"
        component={MyNetworkScreen}
        options={{ title: 'My Network' }}
      />
      <UsageStackNav.Screen
        name="DataUsage"
        component={DataUsageScreen}
        options={{ title: 'Data Usage' }}
      />
      <UsageStackNav.Screen
        name="ChangePlan"
        component={UpgradePlanScreen}
        options={{ title: 'Change Plan' }}
      />

      <UsageStackNav.Screen
        name="Rewards"
        component={RewardsScreen}
        options={{ title: 'Loyalty Rewards' }}
      />
      <UsageStackNav.Screen
        name="CoverageMap"
        component={CoverageMapScreen}
        options={{ title: 'Coverage Map' }}
      />
    </UsageStackNav.Navigator>
  );
}

// --- Support stack (Hub + Tickets + Chat) ---
function SupportStackScreen() {
  return (
    <SupportStack.Navigator screenOptions={HEADER_CONFIG}>
      <SupportStack.Screen
        name="SupportHub"
        component={SupportScreen}
        options={{ title: 'Support' }}
      />
      <SupportStack.Screen
        name="TicketsList"
        component={TicketsScreen}
        options={{ title: 'My Tickets' }}
      />
      <SupportStack.Screen
        name="AIChat"
        component={ChatScreen}
        options={({ navigation }) => ({
          title: 'AI Assistant',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginRight: 4 }}
            >
              <Ionicons name="close" size={20} color="#666" />
            </TouchableOpacity>
          ),
        })}
      />
    </SupportStack.Navigator>
  );
}

// --- Profile stack (Profile + Statement + MyNetwork + ChangePassword) ---
function ProfileStackScreen() {
  return (
    <ProfileStackNav.Navigator screenOptions={HEADER_CONFIG}>
      <ProfileStackNav.Screen
        name="ProfileHome"
        component={ProfileScreen}
        options={{ title: 'Profile' }}
      />
      <ProfileStackNav.Screen
        name="Statement"
        component={StatementScreen}
        options={{ title: 'Account Statement' }}
      />
      <ProfileStackNav.Screen
        name="MyNetwork"
        component={MyNetworkScreen}
        options={{ title: 'My Network' }}
      />
      <ProfileStackNav.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
        options={{ title: 'Change Password' }}
      />
      <ProfileStackNav.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ title: 'Edit Profile' }}
      />
    </ProfileStackNav.Navigator>
  );
}

// --- Main tabs ---
function MainTabs() {
  const insets = useSafeAreaInsets();
  const tabBarBottomPadding = Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 0);

  // Draggable FAB
  const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
  const FAB_SIZE = 56;
  const pan = useRef(new Animated.ValueXY({ x: SCREEN_W - FAB_SIZE - 16, y: SCREEN_H - 200 })).current;
  const scale = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const isDragging = useRef(false);
  const panValue = useRef({ x: SCREEN_W - FAB_SIZE - 16, y: SCREEN_H - 200 });

  // Track pan position safely (avoids accessing internal ._value)
  useEffect(() => {
    const xId = pan.x.addListener(({ value }) => { panValue.current.x = value; });
    const yId = pan.y.addListener(({ value }) => { panValue.current.y = value; });
    return () => { pan.x.removeListener(xId); pan.y.removeListener(yId); };
  }, []);

  // Pulse animation loop — useNativeDriver: false to match pan/scale on same view
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, easing: Easing.out(Easing.ease), useNativeDriver: false }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 0, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const pulseScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] });
  const pulseOpacity = pulseAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.5, 0.2, 0] });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3,
      onPanResponderGrant: () => {
        isDragging.current = false;
        pan.setOffset({ x: panValue.current.x, y: panValue.current.y });
        pan.setValue({ x: 0, y: 0 });
        Animated.spring(scale, { toValue: 1.1, useNativeDriver: false }).start();
      },
      onPanResponderMove: (_, g) => {
        if (Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5) isDragging.current = true;
        Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false })(_, g);
      },
      onPanResponderRelease: (_, g) => {
        pan.flattenOffset();
        Animated.spring(scale, { toValue: 1, useNativeDriver: false }).start();

        // Snap to nearest edge
        const currentX = panValue.current.x;
        const snapX = currentX < SCREEN_W / 2 ? 8 : SCREEN_W - FAB_SIZE - 8;
        const clampedY = Math.max(insets.top + 8, Math.min(panValue.current.y, SCREEN_H - FAB_SIZE - tabBarBottomPadding - 80));

        Animated.spring(pan, {
          toValue: { x: snapX, y: clampedY },
          useNativeDriver: false,
          friction: 7,
        }).start();

        // Only open chat if it was a tap (not a drag) — navigate to AIChat screen
        if (!isDragging.current && navigationRef.isReady()) {
          navigationRef.navigate('Support', { screen: 'AIChat' });
        }
      },
    })
  ).current;

  return (
    <View style={{ flex: 1 }}>
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...HEADER_CONFIG,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: 'transparent',
          paddingBottom: tabBarBottomPadding + 6,
          paddingTop: 6,
          height: 64 + tabBarBottomPadding,
          elevation: 8,
          shadowOpacity: 0.1,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: -4 },
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ focused, color, size }) => {
          const icons = {
            Dashboard: focused ? 'home' : 'home-outline',
            Invoices: focused ? 'document-text' : 'document-text-outline',
            Support: focused ? 'ticket' : 'ticket-outline',
            Usage: focused ? 'analytics' : 'analytics-outline',
            Profile: focused ? 'person' : 'person-outline',
          };
          return <Ionicons name={icons[route.name]} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="Dashboard"
        component={HomeStackScreen}
        options={{ headerShown: false }}
      />
      <Tab.Screen
        name="Invoices"
        component={InvoicesStackScreen}
        options={{ headerShown: false }}
      />
      <Tab.Screen
        name="Support"
        component={SupportStackScreen}
        options={{ headerShown: false }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate('Support', { screen: 'SupportHub' });
          },
        })}
      />
      <Tab.Screen
        name="Usage"
        component={UsageStackScreen}
        options={{ headerShown: false, title: 'My Service' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStackScreen}
        options={{ headerShown: false, title: 'Profile' }}
      />
    </Tab.Navigator>

    {/* ── Floating Draggable AI Chat Button ── */}
    <Animated.View
      style={[
        fabStyles.fab,
        { transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale }] },
      ]}
      {...panResponder.panHandlers}
    >
      {/* Pulse ring */}
      <Animated.View
        style={[
          fabStyles.fabPulse,
          { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
        ]}
      />
      {/* Button */}
      <View style={fabStyles.fabInner}>
        <Ionicons name="chatbubble-ellipses" size={24} color="#fff" />
      </View>
      {/* Label */}
      <View style={fabStyles.fabLabel}>
        <Text style={fabStyles.fabLabelText}>Chat</Text>
      </View>
    </Animated.View>

    </View>
  );
}

const bellBadgeStyles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: COLORS.surface,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
});

const fabStyles = StyleSheet.create({
  fab: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 999,
    alignItems: 'center',
  },
  fabInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  fabPulse: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
  },
  fabLabel: {
    marginTop: 4,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  fabLabelText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
});

// --- Auth Stack ---
function AuthStack() {
  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Otp" component={OtpScreen} />
      <Stack.Screen name="SetPassword" component={SetPasswordScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="Terms" component={TermsScreen} />
      <Stack.Screen name="Fup" component={FupScreen} />
      <Stack.Screen name="JoinCommunity" component={JoinCommunityScreen} />
      <Stack.Screen name="TcomServices" component={TcomServicesScreen} />
      <Stack.Screen name="TcomHosting" component={TcomHostingScreen} />
      <Stack.Screen name="CoverageMap" component={CoverageMapScreen} options={{ headerShown: true, title: 'Coverage Map', ...HEADER_CONFIG }} />
    </Stack.Navigator>
  );
}

// --- Root navigator ---
function RootNavigator() {
  const { isAuthenticated, initializing } = useAuth();

  if (initializing) {
    return (
      <NavigationContainer>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
          <Image source={require('./assets/logo.png')} style={{ width: 200, height: 70 }} resizeMode="contain" />
        </View>
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      {isAuthenticated ? <MainTabs /> : <AuthStack />}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" backgroundColor={COLORS.surface} />
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
