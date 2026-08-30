import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createBottomTabNavigator, BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { radii, spacing } from "../theme/layout";
import { AlertBadgeProvider, useAlertBadge } from "../context/AlertBadgeContext";
import { GuardianProvider } from "../context/GuardianContext";
import { HomeScreen } from "../screens/HomeScreen";
import { PaymentsScreen } from "../screens/PaymentsScreen";
import { ProtectionScreen } from "../screens/ProtectionScreen";
import { TrustedScreen } from "../screens/TrustedScreen";
import { ProfileScreen } from "../screens/ProfileScreen";

const Tab = createBottomTabNavigator();

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

const CustomBottomTabBar: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  navigation,
}) => {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, Platform.OS === "android" ? 8 : 16);
  const { protectionBadge } = useAlertBadge();

  return (
    <View style={[styles.tabBarContainer, { paddingBottom: bottomPadding }]}>
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
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={config.label}
              testID={`tab-${route.name.toLowerCase()}`}
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.tabButton}
              activeOpacity={0.7}
            >
              <View style={[styles.pill, isFocused && styles.pillFocused]}>
                <View style={styles.iconContainer}>
                  <Ionicons
                    name={isFocused ? config.iconName : config.outlineIconName}
                    size={20}
                    color={isFocused ? colors.navTextActive : colors.navText}
                  />
                  {badgeCount > 0 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{badgeCount}</Text>
                    </View>
                  ) : null}
                </View>
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
          <Tab.Screen name="Home" component={HomeScreen} />
          <Tab.Screen name="Payments" component={PaymentsScreen} />
          <Tab.Screen name="Protection" component={ProtectionScreen} />
          <Tab.Screen name="Trusted" component={TrustedScreen} />
          <Tab.Screen name="Profile" component={ProfileScreen} />
        </Tab.Navigator>
      </AlertBadgeProvider>
    </GuardianProvider>
  );
};

const styles = StyleSheet.create({
  tabBarContainer: {
    backgroundColor: colors.navBackground,
    borderTopWidth: 1,
    borderTopColor: colors.navBorder,
    paddingTop: 6,
    elevation: 4,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
  },
  tabBarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    width: "100%",
    paddingHorizontal: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
    minHeight: 48,
  },
  pill: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    minWidth: 72,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  pillFocused: {
    backgroundColor: colors.navActiveSurface,
    borderBottomColor: colors.navIndicator,
  },
  iconContainer: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    height: 22,
  },
  tabText: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
    letterSpacing: 0.1,
    textAlign: "center",
    includeFontPadding: false,
  },
  tabTextFocused: {
    color: colors.navTextActive,
  },
  tabTextInactive: {
    color: colors.navText,
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
