import React, { useState } from "react";
import {
  View,
  Text,
  TextInput as RNTextInput,
  TextInputProps as RNTextInputProps,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii } from "../../theme/layout";

export interface TextInputProps extends RNTextInputProps {
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightIconPress?: () => void;
  error?: string;
  containerStyle?: ViewStyle;
  isPassword?: boolean;
}

export const TextInput: React.FC<TextInputProps> = ({
  label,
  icon,
  rightIcon,
  onRightIconPress,
  error,
  containerStyle,
  isPassword,
  secureTextEntry,
  ...rest
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isSecure = isPassword ? !showPassword : secureTextEntry;

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputWrapper,
          isFocused && styles.inputWrapperFocused,
          !!error && styles.inputWrapperError,
        ]}
      >
        {icon && (
          <Ionicons
            name={icon}
            size={18}
            color={isFocused ? colors.textPrimary : colors.textMuted}
            style={styles.leftIcon}
          />
        )}
        <RNTextInput
          style={styles.input}
          placeholderTextColor={colors.textTertiary}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          secureTextEntry={isSecure}
          autoCapitalize="none"
          autoCorrect={false}
          {...rest}
        />
        {isPassword ? (
          <TouchableOpacity
            onPress={() => setShowPassword((p) => !p)}
            style={styles.rightIconButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={showPassword ? "Hide password" : "Show password"}
          >
            <Ionicons
              name={showPassword ? "eye-off-outline" : "eye-outline"}
              size={18}
              color={colors.textMuted}
            />
          </TouchableOpacity>
        ) : rightIcon ? (
          <TouchableOpacity
            onPress={onRightIconPress}
            style={styles.rightIconButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name={rightIcon} size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.xs,
  },
  label: {
    ...typography.small,
    color: colors.textSecondary,
    fontWeight: "600",
    marginBottom: spacing.xs,
    fontSize: 13,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  inputWrapperFocused: {
    borderColor: colors.textPrimary,
    borderWidth: 1.5,
  },
  inputWrapperError: {
    borderColor: colors.threat,
  },
  leftIcon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
    fontSize: 15,
  },
  rightIconButton: {
    padding: spacing.xs,
    marginLeft: spacing.xs,
  },
  errorText: {
    ...typography.small,
    color: colors.threat,
    marginTop: 4,
    fontSize: 12,
  },
});
