import { TextStyle, Platform } from "react-native";

const fontFamily = Platform.select({
  ios: "System",
  android: "Roboto",
  default: "System",
});

export const typography: Record<string, TextStyle> = {
  // Page titles — large, prominent
  h1: {
    fontFamily,
    fontSize: 32,
    fontWeight: "700",
    lineHeight: 38,
    letterSpacing: -0.3,
  },
  // Section headings
  h2: {
    fontFamily,
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 30,
    letterSpacing: -0.2,
  },
  // Card titles
  h3: {
    fontFamily,
    fontSize: 20,
    fontWeight: "600",
    lineHeight: 26,
  },
  // Sub-headings
  h4: {
    fontFamily,
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 22,
  },
  // Body text
  body: {
    fontFamily,
    fontSize: 15,
    fontWeight: "400",
    lineHeight: 22,
  },
  bodySemibold: {
    fontFamily,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
  },
  // Small text
  small: {
    fontFamily,
    fontSize: 13,
    fontWeight: "400",
    lineHeight: 18,
  },
  smallSemibold: {
    fontFamily,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  smallMedium: {
    fontFamily,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },
  // Captions / labels
  caption: {
    fontFamily,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 14,
    letterSpacing: 0.3,
    textTransform: "uppercase" as const,
  },
  // Large monetary amounts
  amountLarge: {
    fontFamily,
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 34,
    letterSpacing: -0.3,
  },
  // Risk score labels
  riskLabel: {
    fontFamily,
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 14,
    letterSpacing: 0.4,
    textTransform: "uppercase" as const,
  },
};

export type Typography = typeof typography;
