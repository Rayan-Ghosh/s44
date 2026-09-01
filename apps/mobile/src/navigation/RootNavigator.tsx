import React from "react";
import { View, ActivityIndicator } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import { LandingScreen } from "../screens/LandingScreen";
import { LoginScreen } from "../screens/LoginScreen";
import { CreateAccountScreen } from "../screens/CreateAccountScreen";
import { OtpVerificationScreen } from "../screens/OtpVerificationScreen";
import { ForgotPasswordScreen } from "../screens/ForgotPasswordScreen";
import { ResetPasswordOtpScreen } from "../screens/ResetPasswordOtpScreen";
import { NewPasswordScreen } from "../screens/NewPasswordScreen";
import { TabNavigator } from "./TabNavigator";
import { ConnectedAppsScreen } from "../screens/ConnectedAppsScreen";
import { AlertDetailScreen } from "../screens/AlertDetailScreen";
import { HistoryDetailScreen } from "../screens/HistoryDetailScreen";
import { VoiceScreen } from "../screens/VoiceScreen";
import { PostLoginSplashScreen } from "../components/common/PostLoginSplashScreen";
import { SecurityAlert } from "../types/alert";
import { HistoryItem } from "../types/history";

export type RootStackParamList = {
  Landing: undefined;
  Login: undefined;
  CreateAccount: undefined;
  Signup: undefined;
  OtpVerification: {
    userId: number;
    maskedContact: string;
    email?: string;
    phone?: string;
    isLiveDelivery?: boolean;
    devTestCode?: string;
  };
  ForgotPassword: undefined;
  ResetPasswordOtp: {
    identifier: string;
    maskedContact: string;
    resendCooldownSeconds?: number;
    isLiveDelivery?: boolean;
    devTestCode?: string;
  };
  NewPassword: {
    resetToken: string;
  };
  Tabs: undefined;
  ConnectedApps: undefined;
  AlertDetail: { alert: SecurityAlert };
  HistoryDetail: { item: HistoryItem };
  Voice: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator: React.FC = () => {
  const { isAuthenticated, isRestoringSession, isPostLoginLoading, setPostLoginLoading } = useAuth();

  if (isRestoringSession) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F3F2EF" }}>
        <ActivityIndicator size="large" color="#0F172A" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: "slide_from_right",
          animationDuration: 300,
        }}
      >
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
              name="OtpVerification"
              component={OtpVerificationScreen}
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
            <Stack.Screen
              name="ForgotPassword"
              component={ForgotPasswordScreen}
              options={{
                animation: "slide_from_right",
              }}
            />
            <Stack.Screen
              name="ResetPasswordOtp"
              component={ResetPasswordOtpScreen}
              options={{
                animation: "slide_from_right",
              }}
            />
            <Stack.Screen
              name="NewPassword"
              component={NewPasswordScreen}
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
      {isAuthenticated && isPostLoginLoading && (
        <PostLoginSplashScreen onFinish={() => setPostLoginLoading(false)} />
      )}
    </View>
  );
};
