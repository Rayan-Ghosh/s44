import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleProp, ViewStyle, View } from "react-native";

interface StaggerRevealCardProps {
  children: React.ReactNode;
  index: number;
  baseDelay?: number;       // Initial delay before stagger starts (ms)
  staggerInterval?: number; // Delay between consecutive cards (ms)
  duration?: number;        // Transition duration (ms)
  distance?: number;        // Subtle upward travel distance (px)
  style?: StyleProp<ViewStyle>;
  hasPlayed?: boolean;      // If true, renders static view without animation
}

export const StaggerRevealCard: React.FC<StaggerRevealCardProps> = ({
  children,
  index,
  baseDelay = 0,
  staggerInterval = 90,
  duration = 280,
  distance = 8,
  style,
  hasPlayed = false,
}) => {
  // If already played earlier in this session, render static View immediately
  if (hasPlayed) {
    return <View style={style}>{children}</View>;
  }

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(distance)).current;

  useEffect(() => {
    const delay = baseDelay + index * staggerInterval;
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]),
    ]);

    anim.start();

    return () => {
      anim.stop();
    };
  }, [baseDelay, index, staggerInterval, duration, distance, opacity, translateY]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
};
