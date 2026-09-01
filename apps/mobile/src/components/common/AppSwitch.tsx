/**
 * AppSwitch — single source of truth for all toggle/switch controls across Avaran.
 *
 * Track:  off = colors.borderLight   |  on = colors.safeSurface  (subtle teal)
 * Thumb:  off = colors.textMuted     |  on = colors.safe          (brand green)
 *
 * Drop-in replacement for <Switch> — accepts the same `value` and `onValueChange` props.
 */
import React from "react";
import { Switch, SwitchProps } from "react-native";
import { colors } from "../../theme/colors";

export interface AppSwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  style?: SwitchProps["style"];
}

export const AppSwitch: React.FC<AppSwitchProps> = ({ value, onValueChange, disabled, style }) => (
  <Switch
    value={value}
    onValueChange={onValueChange}
    disabled={disabled}
    trackColor={{ false: colors.borderLight, true: colors.safeSurface }}
    thumbColor={value ? colors.safe : colors.textMuted}
    style={style}
  />
);
