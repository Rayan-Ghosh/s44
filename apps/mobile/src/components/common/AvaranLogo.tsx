import React from "react";
import { View, Image, Text, StyleSheet, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii } from "../../theme/layout";

interface AvaranLogoProps {
  size?: "sm" | "md" | "lg" | "hero";
  showText?: boolean;
  tagline?: string;
  style?: ViewStyle;
}

export const AvaranLogo: React.FC<AvaranLogoProps> = ({
  size = "md",
  showText = true,
  tagline = "FRAUD PROTECTION",
  style,
}) => {
  const getDims = () => {
    switch (size) {
      case "sm":
        return { box: 32, iconSize: 18, titleSize: 14, subSize: 9 };
      case "lg":
        return { box: 56, iconSize: 28, titleSize: 20, subSize: 11 };
      case "hero":
        return { box: 72, iconSize: 36, titleSize: 26, subSize: 12 };
      case "md":
      default:
        return { box: 44, iconSize: 22, titleSize: 17, subSize: 10 };
    }
  };

  const dims = getDims();
  let hasImage = false;

  try {
    require("../../../assets/icon.png");
    hasImage = true;
  } catch {
    hasImage = false;
  }

  return (
    <View style={[styles.container, style]}>
      <View
        style={[
          styles.logoBox,
          {
            width: dims.box,
            height: dims.box,
            borderRadius: dims.box * 0.28,
          },
        ]}
      >
        {hasImage ? (
          <Image
            source={require("../../../assets/icon.png")}
            style={styles.logoImage}
            resizeMode="cover"
          />
        ) : (
          <Ionicons name="shield-checkmark" size={dims.iconSize} color={colors.brand} />
        )}
      </View>

      {showText && (
        <View style={styles.textCol}>
          <Text style={[styles.brandTitle, { fontSize: dims.titleSize }]}>AVARAN</Text>
          {tagline ? (
            <Text style={[styles.brandTagline, { fontSize: dims.subSize }]}>
              {tagline}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoBox: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  logoImage: {
    width: "100%",
    height: "100%",
  },
  textCol: {
    marginLeft: spacing.sm,
    justifyContent: "center",
  },
  brandTitle: {
    fontWeight: "800",
    color: colors.textPrimary,
    letterSpacing: 1.2,
  },
  brandTagline: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginTop: 1,
  },
});
