import React from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { ErrorBoundary } from "./src/components/common/ErrorBoundary";
import { AppHealthProvider } from "./src/context/AppHealthContext";
import { BiometricProvider } from "./src/context/BiometricContext";
import { AuthProvider } from "./src/context/AuthContext";
import { SecurityProvider } from "./src/context/SecurityContext";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { WatchdogToast } from "./src/components/common/WatchdogToast";
import { BiometricLockOverlay } from "./src/components/security/BiometricLockOverlay";

export default function App() {
  return (
    <ErrorBoundary>
      <AppHealthProvider>
        <BiometricProvider>
          <SafeAreaProvider>
            <AuthProvider>
              <SecurityProvider>
                <NavigationContainer>
                  <StatusBar style="dark" />
                  <RootNavigator />
                  <WatchdogToast />
                  <BiometricLockOverlay />
                </NavigationContainer>
              </SecurityProvider>
            </AuthProvider>
          </SafeAreaProvider>
        </BiometricProvider>
      </AppHealthProvider>
    </ErrorBoundary>
  );
}
