import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Animated,
  Easing,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createBottomTabNavigator, BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { radii, spacing, shadows } from "../theme/layout";
import { typography } from "../theme/typography";
import { AlertBadgeProvider, useAlertBadge } from "../context/AlertBadgeContext";
import { GuardianProvider } from "../context/GuardianContext";
import { TabTransitionWrapper } from "../components/common/TabTransitionWrapper";
import { HomeScreen } from "../screens/HomeScreen";
import { PaymentsScreen } from "../screens/PaymentsScreen";
import { ProtectionScreen } from "../screens/ProtectionScreen";
import { TrustedScreen } from "../screens/TrustedScreen";
import { ProfileScreen } from "../screens/ProfileScreen";

const Tab = createBottomTabNavigator();

// Thin wrapper components — each wraps the real screen in TabTransitionWrapper
// so the blur-to-sharp entrance plays on every tab switch.
const HomeTab = () => (
  <TabTransitionWrapper>
    <HomeScreen />
  </TabTransitionWrapper>
);
const PaymentsTab = () => (
  <TabTransitionWrapper>
    <PaymentsScreen />
  </TabTransitionWrapper>
);
const ProtectionTab = () => (
  <TabTransitionWrapper>
    <ProtectionScreen />
  </TabTransitionWrapper>
);
const TrustedTab = () => (
  <TabTransitionWrapper>
    <TrustedScreen />
  </TabTransitionWrapper>
);
const ProfileTab = () => (
  <TabTransitionWrapper>
    <ProfileScreen />
  </TabTransitionWrapper>
);

interface TabConfig {
  name: string;
  label: string;
  iconName: keyof typeof Ionicons.glyphMap;
  outlineIconName: keyof typeof Ionicons.glyphMap;
  badge?: number;
}

const TAB_CONFIGS: TabConfig[] = [
  {
    name: "Home",
    label: "Home",
    iconName: "home",
    outlineIconName: "home-outline",
  },
  {
    name: "Payments",
    label: "Payments",
    iconName: "card",
    outlineIconName: "card-outline",
  },
  {
    name: "Protection",
    label: "Protection",
    iconName: "shield-checkmark",
    outlineIconName: "shield-checkmark-outline",
  },
  {
    name: "Trusted",
    label: "Trusted",
    iconName: "people",
    outlineIconName: "people-outline",
  },
  {
    name: "Profile",
    label: "Profile",
    iconName: "person",
    outlineIconName: "person-outline",
  },
];

interface TabItemProps {
  route: any;
  isFocused: boolean;
  config: TabConfig;
  badgeCount: number;
  onPress: () => void;
  onLongPress: () => void;
}

const TabItemButton: React.FC<TabItemProps> = ({
  route,
  isFocused,
  config,
  badgeCount,
  onPress,
  onLongPress,
}) => {
  const animValue = useRef(new Animated.Value(isFocused ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(animValue, {
      toValue: isFocused ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [isFocused, animValue]);

  const pillOpacity = animValue;
  const pillScale = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1],
  });

  const iconScale = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });

  const iconTranslateY = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -1],
  });

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={config.label}
      testID={`tab-${route.name.toLowerCase()}`}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.tabButton}
      activeOpacity={0.75}
    >
      <View style={styles.pillContainer}>
        {/* Animated Active Pill Background */}
        <Animated.View
          style={[
            styles.activePillBackground,
            {
              opacity: pillOpacity,
              transform: [{ scale: pillScale }],
            },
          ]}
        />

        <Animated.View
          style={[
            styles.iconContainer,
            {
              transform: [
                { scale: iconScale },
                { translateY: iconTranslateY },
              ],
            },
          ]}
        >
          <Ionicons
            name={isFocused ? config.iconName : config.outlineIconName}
            size={20}
            color={isFocused ? colors.brand : colors.textSecondary}
          />
          {badgeCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badgeCount}</Text>
            </View>
          )}
        </Animated.View>

        <Text
          numberOfLines={1}
          ellipsizeMode="clip"
          style={[
            styles.tabText,
            isFocused ? styles.tabTextFocused : styles.tabTextInactive,
          ]}
        >
          {config.label}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const CustomBottomTabBar: React.FC<BottomTabBarProps> = ({
  state,
  navigation,
}) => {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, Platform.OS === "android" ? 6 : 14);
  const { protectionBadge } = useAlertBadge();

  return (
    <View
      style={[
        styles.tabBarContainer,
        { paddingBottom: bottomPadding },
        Platform.OS === "web" ? ({ backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" } as any) : {},
      ]}
    >
      <View style={styles.tabBarRow}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const config = TAB_CONFIGS.find((c) => c.name === route.name) || {
            name: route.name,
            label: route.name,
            iconName: "square" as const,
            outlineIconName: "square-outline" as const,
          };
          const badgeCount =
            route.name === "Protection" ? protectionBadge : (config.badge ?? 0);

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          return (
            <TabItemButton
              key={route.key}
              route={route}
              isFocused={isFocused}
              config={config}
              badgeCount={badgeCount}
              onPress={onPress}
              onLongPress={onLongPress}
            />
          );
        })}
      </View>
    </View>
  );
};

export const TabNavigator: React.FC = () => {
  return (
    <GuardianProvider>
      <AlertBadgeProvider>
        <Tab.Navigator
          tabBar={(props) => <CustomBottomTabBar {...props} />}
          screenOptions={{
            headerShown: false,
          }}
        >
          <Tab.Screen name="Home" component={HomeTab} />
          <Tab.Screen name="Payments" component={PaymentsTab} />
          <Tab.Screen name="Protection" component={ProtectionTab} />
          <Tab.Screen name="Trusted" component={TrustedTab} />
          <Tab.Screen name="Profile" component={ProfileTab} />
        </Tab.Navigator>
      </AlertBadgeProvider>
    </GuardianProvider>
  );
};

const styles = StyleSheet.create({
  tabBarContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(243, 242, 239, 0.78)",
    borderTopWidth: 1,
    borderTopColor: "rgba(217, 216, 211, 0.65)",
    paddingTop: 6,
    elevation: 10,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    zIndex: 100,
  },
  tabBarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    width: "100%",
    paddingHorizontal: 6,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
    minHeight: 50,
  },
  pillContainer: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: radii.full,
    minWidth: 64,
  },
  activePillBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: "rgba(23, 107, 91, 0.16)",
    ...shadows.sm,
  },
  iconContainer: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    height: 22,
  },
  tabText: {
    ...typography.caption,
    fontSize: 10,
    marginTop: 2,
    letterSpacing: 0.2,
    textAlign: "center",
    includeFontPadding: false,
  },
  tabTextFocused: {
    color: colors.textPrimary,
    fontWeight: "800",
  },
  tabTextInactive: {
    color: colors.textSecondary,
    fontWeight: "500",
  },
  badge: {
    position: "absolute",
    top: -3,
    right: -10,
    backgroundColor: colors.threat,
    borderRadius: 7,
    minWidth: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
    borderWidth: 1,
    borderColor: colors.surface,
  },
  badgeText: {
    color: colors.textInverse,
    fontSize: 8,
    fontWeight: "800",
    lineHeight: 10,
  },
});
