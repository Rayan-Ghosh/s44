/**
 * TabTransitionWrapper
 *
 * Wraps each tab screen. When the screen gains focus (tab switch), it plays a
 * premium blur-to-sharp + fade-in entrance animation.
 *
 * On web: uses CSS filter: blur() animated via a direct DOM ref listener,
 * bypassing React Native Web's style whitelist. Also animates opacity.
 * On native: pure opacity fade (expo-blur not required).
 */
import React, { useEffect, useRef, useCallback } from "react";
import { Animated, StyleSheet, Platform, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";

interface TabTransitionWrapperProps {
  children: React.ReactNode;
}

// Animation config
const DURATION_IN = 300; // ms
const BLUR_MAX = 8;      // px (web only)

export const TabTransitionWrapper: React.FC<TabTransitionWrapperProps> = ({ children }) => {
  const isFocused = useIsFocused();

  // Single Animated.Value drives both opacity and blur (0 = start, 1 = end)
  const progress = useRef(new Animated.Value(0)).current;

  // A ref to the underlying DOM node (web only) to set CSS filter directly
  const domRef = useRef<any>(null);

  const playEntrance = useCallback(() => {
    // Reset to start state
    progress.setValue(0);

    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: DURATION_IN,
      useNativeDriver: Platform.OS !== "web",
    });

    if (Platform.OS === "web") {
      // On web, drive CSS filter via addListener → direct DOM style mutation.
      // This bypasses RN Web's limited style whitelist and reliably applies blur.
      const listenerId = progress.addListener(({ value }) => {
        const blurPx = BLUR_MAX * (1 - value);
        if (domRef.current) {
          // domRef.current is the Animated.View div on web
          const node = domRef.current as HTMLElement;
          node.style.filter = `blur(${blurPx.toFixed(2)}px)`;
          node.style.opacity = String(value);
        }
      });

      anim.start(() => {
        progress.removeListener(listenerId);
        // Ensure final state is clean
        if (domRef.current) {
          const node = domRef.current as HTMLElement;
          node.style.filter = "blur(0px)";
          node.style.opacity = "1";
        }
      });
    } else {
      anim.start();
    }
  }, [progress]);

  useEffect(() => {
    if (isFocused) {
      playEntrance();
    }
  }, [isFocused, playEntrance]);

  if (Platform.OS === "web") {
    return (
      <Animated.View
        ref={domRef}
        style={[styles.wrapper, { opacity: progress }]}
      >
        {children}
      </Animated.View>
    );
  }

  // Native: opacity fade
  return (
    <Animated.View style={[styles.wrapper, { opacity: progress }]}>
      {children}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
});
