import React from "react";
import { View, ActivityIndicator } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import { LandingScreen } from "../screens/LandingScreen";
import { LoginScreen } from "../screens/LoginScreen";
import { CreateAccountScreen } from "../screens/CreateAccountScreen";
import { TabNavigator } from "./TabNavigator";
import { ConnectedAppsScreen } from "../screens/ConnectedAppsScreen";
import { AlertDetailScreen } from "../screens/AlertDetailScreen";
import { HistoryDetailScreen } from "../screens/HistoryDetailScreen";
import { VoiceScreen } from "../screens/VoiceScreen";
import { SecurityAlert } from "../types/alert";
import { HistoryItem } from "../types/history";

export type RootStackParamList = {
  Landing: undefined;
  Login: undefined;
  CreateAccount: undefined;
  Signup: undefined;
  Tabs: undefined;
  ConnectedApps: undefined;
  AlertDetail: { alert: SecurityAlert };
  HistoryDetail: { item: HistoryItem };
  Voice: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator: React.FC = () => {
  const { isAuthenticated, isRestoringSession } = useAuth();

  if (isRestoringSession) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F3F2EF" }}>
        <ActivityIndicator size="large" color="#0F172A" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isAuthenticated ? (
        <>
          <Stack.Screen
            name="Landing"
            component={LandingScreen}
            options={{
              animation: "fade",
            }}
          />
          <Stack.Screen
            name="CreateAccount"
            component={CreateAccountScreen}
            options={{
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="Signup"
            component={CreateAccountScreen}
            options={{
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{
              animation: "slide_from_right",
            }}
          />
        </>
      ) : (
        <>
          <Stack.Screen
            name="Tabs"
            component={TabNavigator}
            options={{
              animation: "fade",
            }}
          />
          <Stack.Screen
            name="ConnectedApps"
            component={ConnectedAppsScreen}
            options={{
              presentation: "card",
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="AlertDetail"
            component={AlertDetailScreen}
            options={{
              presentation: "card",
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="HistoryDetail"
            component={HistoryDetailScreen}
            options={{
              presentation: "card",
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="Voice"
            component={VoiceScreen}
            options={{
              presentation: "card",
              animation: "slide_from_right",
            }}
          />
        </>
      )}
    </Stack.Navigator>
  );
};
