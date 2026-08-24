import { ViewStyle } from "react-native";

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
};

export const radii = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  full: 9999,
};

export const shadows: Record<string, ViewStyle> = {
  sm: {
    shadowColor: "#111817",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: "#111817",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
};
