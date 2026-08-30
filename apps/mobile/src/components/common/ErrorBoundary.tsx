import React, { Component, ErrorInfo, ReactNode } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii, shadows } from "../../theme/layout";
import { Button } from "./Button";
import { AvaranLogo } from "./AvaranLogo";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    });
    // Log exception to local telemetry
    console.error("[Avaran ErrorBoundary Caught Exception]:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const errorMessage = this.state.error?.message || "An unexpected runtime error occurred.";
      const stack = this.state.error?.stack || this.state.errorInfo?.componentStack || "";

      return (
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.container}>
            {/* Header */}
            <View style={styles.brandRow}>
              <AvaranLogo size="sm" showText={false} />
              <Text style={styles.brandTitle}>AVARAN</Text>
            </View>

            {/* Error Card */}
            <View style={styles.card}>
              <View style={styles.iconCircle}>
                <Ionicons name="warning-outline" size={32} color={colors.threat} />
              </View>

              <Text style={styles.title}>Runtime Error Intercepted</Text>
              <Text style={styles.subtitle}>
                Avaran's resilience boundary prevented an unhandled exception from freezing the application.
              </Text>

              {/* Diagnostic Box */}
              <View style={styles.diagnosticBox}>
                <Text style={styles.diagnosticHeading}>ERROR TELEMETRY</Text>
                <Text style={styles.errorText} numberOfLines={3}>
                  {errorMessage}
                </Text>

                {stack ? (
                  <ScrollView style={styles.stackScroll} nestedScrollEnabled>
                    <Text style={styles.stackText}>{stack}</Text>
                  </ScrollView>
                ) : null}
              </View>

              {/* Action Buttons */}
              <View style={styles.actionButtons}>
                <Button
                  label="Recover Session & Retry"
                  onPress={this.handleReset}
                  variant="primary"
                  size="lg"
                  icon="refresh"
                  style={{ width: "100%" }}
                />

                <Button
                  label="Restart to Safe Baseline"
                  onPress={() => {
                    this.handleReset();
                  }}
                  variant="secondary"
                  size="md"
                  style={{ width: "100%" }}
                />
              </View>
            </View>

            <View style={styles.footerRow}>
              <Ionicons name="shield-outline" size={12} color={colors.textMuted} />
              <Text style={styles.footerText}>Avaran Resilience Architecture</Text>
            </View>
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  logoBox: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  brandTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    letterSpacing: 1.5,
    fontWeight: "800",
    fontSize: 16,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.threat,
    padding: spacing.xl,
    alignItems: "center",
    ...shadows.md,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.threatSurface,
    borderWidth: 1,
    borderColor: colors.threatBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  diagnosticBox: {
    width: "100%",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  diagnosticHeading: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "800",
    fontSize: 10,
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  errorText: {
    ...typography.smallSemibold,
    color: colors.threat,
    fontSize: 12,
  },
  stackScroll: {
    maxHeight: 90,
    marginTop: spacing.xs,
  },
  stackText: {
    fontFamily: "monospace",
    fontSize: 10,
    color: colors.textSecondary,
    lineHeight: 14,
  },
  actionButtons: {
    width: "100%",
    gap: spacing.sm,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: spacing.xs,
  },
  footerText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
  },
});
