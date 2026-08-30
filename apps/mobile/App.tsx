import React, { useEffect, useRef } from "react";
import { Linking } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer, NavigationContainerRef } from "@react-navigation/native";
import { ErrorBoundary } from "./src/components/common/ErrorBoundary";
import { AppHealthProvider } from "./src/context/AppHealthContext";
import { BiometricProvider } from "./src/context/BiometricContext";
import { AuthProvider } from "./src/context/AuthContext";
import { SecurityProvider } from "./src/context/SecurityContext";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { WatchdogToast } from "./src/components/common/WatchdogToast";
import { BiometricLockOverlay } from "./src/components/security/BiometricLockOverlay";
import { PaymentLinkService } from "./src/services/payment-link-service";

const linking = {
  prefixes: ["avaran://", "upi://", "https://avaran.ai"],
  config: {
    screens: {
      Tabs: {
        screens: {
          Payments: "pay",
          Home: "home",
          Protection: "protection",
          Trusted: "trusted",
          Profile: "profile",
        },
      },
    },
  },
};

export default function App() {
  const navRef = useRef<NavigationContainerRef<any>>(null);

  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) return;
      if (url.startsWith("upi://") || url.startsWith("avaran://pay") || url.includes("/pay?")) {
        const parsed = PaymentLinkService.parsePaymentUrl(url);
        const newTx = PaymentLinkService.ingestPaymentRequest(parsed);
        if (navRef.current && navRef.current.isReady()) {
          navRef.current.navigate("Tabs", {
            screen: "Payments",
            params: { selectedTxId: newTx.id },
          });
        }
      }
    };

    // Check initial deep link
    Linking.getInitialURL().then(handleUrl);

    // Listen for incoming deep links while app is open
    const sub = Linking.addEventListener("url", (event) => {
      handleUrl(event.url);
    });

    return () => {
      sub.remove();
    };
  }, []);

  return (
    <ErrorBoundary>
      <AppHealthProvider>
        <BiometricProvider>
          <SafeAreaProvider>
            <AuthProvider>
              <SecurityProvider>
                <NavigationContainer ref={navRef} linking={linking}>
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
