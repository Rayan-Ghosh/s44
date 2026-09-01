import React from "react";
import { Text, StyleSheet, TextStyle, StyleProp, Platform } from "react-native";
import { colors } from "../../theme/colors";

export interface AvaranBrandNameProps {
  size?: number;
  color?: string;
  letterSpacing?: number;
  style?: StyleProp<TextStyle>;
}

export const AvaranBrandName: React.FC<AvaranBrandNameProps> = ({
  size = 17,
  color = colors.textPrimary,
  letterSpacing = 4.5,
  style,
}) => {
  return (
    <Text
      style={[
        styles.brandText,
        {
          fontSize: size,
          color,
          letterSpacing,
        },
        style,
      ]}
    >
      AVARAN
    </Text>
  );
};

const styles = StyleSheet.create({
  brandText: {
    fontFamily: Platform.select({
      web: "Cinzel, 'Cinzel Decorative', Georgia, 'Times New Roman', serif",
      ios: "Cinzel",
      android: "Cinzel",
      default: "Cinzel",
    }),
    fontWeight: "600",
    textTransform: "uppercase",
  },
});
