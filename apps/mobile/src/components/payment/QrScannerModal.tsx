import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, type BarcodeScanningResult } from "expo-camera";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { spacing, radii } from "../../theme/layout";
import { Button } from "../common/Button";

export interface QrScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScan: (scannedData: string) => void;
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({
  visible,
  onClose,
  onScan,
}) => {
  const [isCameraActive, setIsCameraActive] = useState<boolean>(true);
  const hasScannedRef = useRef<boolean>(false);

  // Reset scan lock whenever the modal opens
  useEffect(() => {
    if (visible) {
      hasScannedRef.current = false;
      setIsCameraActive(true);
    } else {
      setIsCameraActive(false);
    }
  }, [visible]);

  const handleBarcodeScanned = (result: BarcodeScanningResult) => {
    const data = result?.data;
    if (hasScannedRef.current || !data) {
      return;
    }

    // Lock further scanning immediately to avoid duplicate scans
    hasScannedRef.current = true;
    setIsCameraActive(false);
    onScan(data);
  };

  const handleCancel = () => {
    hasScannedRef.current = true;
    setIsCameraActive(false);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleCancel}
    >
      <View style={styles.container}>
        {/* Camera Feed with Barcode Scanner */}
        {isCameraActive ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ["qr"],
            }}
            onBarcodeScanned={handleBarcodeScanned}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.cameraOffBackdrop]}>
            <ActivityIndicator size="large" color={colors.brand} />
          </View>
        )}

        {/* Viewfinder Overlay */}
        <View style={styles.overlay}>
          {/* Top Header Bar */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Ionicons name="qr-code" size={18} color={colors.brand} style={{ marginRight: 8 }} />
              <Text style={styles.headerTitle}>SCAN UPI QR CODE</Text>
            </View>
            <TouchableOpacity
              onPress={handleCancel}
              style={styles.closeBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Cancel QR scanning"
            >
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Center Target Frame */}
          <View style={styles.centerTargetContainer}>
            <View style={styles.targetBox}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
            </View>
            <Text style={styles.targetHint}>Align UPI QR code inside the frame</Text>
          </View>

          {/* Bottom Controls */}
          <View style={styles.bottomControls}>
            <Button
              label="CANCEL"
              variant="outline"
              size="md"
              icon="close-outline"
              onPress={handleCancel}
              style={styles.cancelBtn}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  cameraOffBackdrop: {
    backgroundColor: "#0a0d12",
    alignItems: "center",
    justifyContent: "center",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 50 : 30,
    paddingBottom: Platform.OS === "ios" ? 40 : 25,
    paddingHorizontal: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: "rgba(10, 14, 22, 0.85)",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerTitle: {
    ...typography.small,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: colors.textPrimary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  centerTargetContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  targetBox: {
    width: 250,
    height: 250,
    position: "relative",
    backgroundColor: "transparent",
  },
  corner: {
    position: "absolute",
    width: 32,
    height: 32,
    borderColor: colors.brand,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 10,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 10,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 10,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 10,
  },
  targetHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: "center",
    backgroundColor: "rgba(10, 14, 22, 0.75)",
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: radii.full,
  },
  bottomControls: {
    alignItems: "center",
    paddingBottom: spacing.sm,
  },
  cancelBtn: {
    width: "100%",
    maxWidth: 240,
    backgroundColor: "rgba(15, 23, 42, 0.9)",
    borderColor: colors.borderLight,
  },
});
