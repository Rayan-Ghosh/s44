import React, { useEffect, useRef } from "react";
import { Linking } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer, NavigationContainerRef } from "@react-navigation/native";
import { ErrorBoundary } from "./src/components/common/ErrorBoundary";
import { AppHealthProvider } from "./src/context/AppHealthContext";
import { BiometricProvider } from "./src/context/BiometricContext";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
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

/** Handles incoming UPI/deep-link payment URLs — needs useAuth(), so it must
 * render inside AuthProvider rather than in App() itself. */
const DeepLinkHandler: React.FC<{ navRef: React.RefObject<NavigationContainerRef<any> | null> }> = ({ navRef }) => {
  const { session } = useAuth();

  useEffect(() => {
    const handleUrl = async (url: string | null) => {
      if (!url || !session?.userId) return;
      if (url.startsWith("upi://") || url.startsWith("avaran://pay") || url.includes("/pay?")) {
        const parsed = PaymentLinkService.parsePaymentUrl(url);
        const newTx = await PaymentLinkService.createAndEvaluate(parsed, session.userId);
        if (newTx && navRef.current && navRef.current.isReady()) {
          navRef.current.navigate("Tabs", {
            screen: "Payments",
            params: { selectedTxId: newTx.id },
          });
        }
      }
    };

    Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener("url", (event) => {
      handleUrl(event.url);
    });

    return () => {
      sub.remove();
    };
  }, [session?.userId]);

  return null;
};

export default function App() {
  const navRef = useRef<NavigationContainerRef<any>>(null);

  return (
    <ErrorBoundary>
      <AppHealthProvider>
        <BiometricProvider>
          <SafeAreaProvider>
            <AuthProvider>
              <SecurityProvider>
                <NavigationContainer ref={navRef} linking={linking}>
                  <StatusBar style="dark" />
                  <DeepLinkHandler navRef={navRef} />
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
