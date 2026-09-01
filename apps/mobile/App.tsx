import React, { useEffect, useRef, useState } from "react";
import { Linking, View, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer, NavigationContainerRef } from "@react-navigation/native";
import { ErrorBoundary } from "./src/components/common/ErrorBoundary";
import { AppHealthProvider } from "./src/context/AppHealthContext";
import { BiometricProvider } from "./src/context/BiometricContext";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { SecurityProvider } from "./src/context/SecurityContext";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { BiometricLockOverlay } from "./src/components/security/BiometricLockOverlay";
import { SplashScreen } from "./src/components/common/SplashScreen";
import { PaymentLinkService } from "./src/services/payment-link-service";
import { AppLockService } from "./src/services/app-lock-service";

// Inject Cinzel font on web for the premium Roman serif typography
if (Platform.OS === "web" && typeof document !== "undefined") {
  const fontId = "google-font-cinzel";
  if (!document.getElementById(fontId)) {
    const link = document.createElement("link");
    link.id = fontId;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
  }

  // Neutralize browser autofill and pre-fill blue rectangular overlay across all inputs
  const inputStyleId = "avaran-input-reset-styles";
  if (!document.getElementById(inputStyleId)) {
    const style = document.createElement("style");
    style.id = inputStyleId;
    style.textContent = `
      input:-webkit-autofill,
      input:-webkit-autofill:hover, 
      input:-webkit-autofill:focus, 
      input:-webkit-autofill:active,
      textarea:-webkit-autofill,
      textarea:-webkit-autofill:hover,
      textarea:-webkit-autofill:focus,
      textarea:-webkit-autofill:active,
      select:-webkit-autofill,
      select:-webkit-autofill:hover,
      select:-webkit-autofill:focus,
      select:-webkit-autofill:active {
        -webkit-box-shadow: 0 0 0 1000px #FFFFFF inset !important;
        box-shadow: 0 0 0 1000px #FFFFFF inset !important;
        -webkit-text-fill-color: #171717 !important;
        caret-color: #171717 !important;
        background-color: transparent !important;
        transition: background-color 5000s ease-in-out 0s;
      }
      input, textarea, select {
        outline: none !important;
        background-color: transparent !important;
      }
    `;
    document.head.appendChild(style);
  }
}

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
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    AppLockService.initLifecycleWatcher();
  }, []);

  return (
    <ErrorBoundary>
      <AppHealthProvider>
        <BiometricProvider>
          <SafeAreaProvider>
            <AuthProvider>
              <SecurityProvider>
                <View style={{ flex: 1 }}>
                  <NavigationContainer ref={navRef} linking={linking}>
                    <StatusBar style="dark" />
                    <DeepLinkHandler navRef={navRef} />
                    <RootNavigator />
                    <BiometricLockOverlay />
                  </NavigationContainer>
                  {showSplash && (
                    <SplashScreen onFinish={() => setShowSplash(false)} />
                  )}
                </View>
              </SecurityProvider>
            </AuthProvider>
          </SafeAreaProvider>
        </BiometricProvider>
      </AppHealthProvider>
    </ErrorBoundary>
  );
}
