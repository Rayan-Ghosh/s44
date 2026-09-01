import React, { useEffect, useRef, useState } from "react";
import { Text, TextStyle, StyleProp } from "react-native";

interface AnimatedAmountProps {
  amount: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  style?: StyleProp<TextStyle>;
  animateOnlyOnce?: boolean;
}

export const AnimatedAmount: React.FC<AnimatedAmountProps> = ({
  amount,
  prefix = "₹",
  suffix = "",
  duration = 900,
  style,
  animateOnlyOnce = false,
}) => {
  const [displayValue, setDisplayValue] = useState<number>(animateOnlyOnce ? amount : 0);
  const hasAnimatedRef = useRef(animateOnlyOnce);
  const prevAmountRef = useRef(amount);

  useEffect(() => {
    // If already animated once or amount is 0, display immediately
    if (hasAnimatedRef.current || amount === 0) {
      setDisplayValue(amount);
      return;
    }

    hasAnimatedRef.current = true;
    prevAmountRef.current = amount;

    const startTime = Date.now();
    const startVal = 0;
    const endVal = amount;

    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Smooth cubic ease-out curve
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startVal + (endVal - startVal) * eased);

      setDisplayValue(current);

      if (progress >= 1) {
        clearInterval(interval);
        setDisplayValue(endVal);
      }
    }, 16);

    return () => clearInterval(interval);
  }, [amount, duration]);

  const formatted = `${prefix}${displayValue.toLocaleString("en-IN")}${suffix}`;

  return <Text style={style}>{formatted}</Text>;
};
