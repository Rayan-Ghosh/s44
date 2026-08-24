export interface ConnectedApp {
  id: string;
  name: string;
  type: "UPI Application" | "Digital Wallet" | "Banking App" | "Payment Gateway";
  status: "Protected" | "Syncing" | "Requires Reauth";
  lastProtectedTxn: string;
  iconName: string;
  protectionTier: "Full 4-Signal Fusion" | "Payment & Device Shield";
}

export const INITIAL_CONNECTED_APPS: ConnectedApp[] = [
  {
    id: "app-gpay",
    name: "Google Pay (UPI)",
    type: "UPI Application",
    status: "Protected",
    lastProtectedTxn: "Today · 2:15 PM",
    iconName: "logo-google",
    protectionTier: "Full 4-Signal Fusion",
  },
  {
    id: "app-phonepe",
    name: "PhonePe",
    type: "UPI Application",
    status: "Protected",
    lastProtectedTxn: "Yesterday · 6:30 PM",
    iconName: "phone-portrait-outline",
    protectionTier: "Full 4-Signal Fusion",
  },
  {
    id: "app-paytm",
    name: "Paytm Wallet & UPI",
    type: "Digital Wallet",
    status: "Protected",
    lastProtectedTxn: "Yesterday · 1:10 PM",
    iconName: "wallet-outline",
    protectionTier: "Payment & Device Shield",
  },
  {
    id: "app-sbi",
    name: "SBI YONO Banking",
    type: "Banking App",
    status: "Protected",
    lastProtectedTxn: "21 Aug · 11:20 AM",
    iconName: "business-outline",
    protectionTier: "Full 4-Signal Fusion",
  },
];

export class IntegrationService {
  /**
   * Connected Payment Applications Service
   * Demonstrates the multi-app integration capability of the Avaran Fraud Protection API.
   */
  static async getConnectedApps(): Promise<ConnectedApp[]> {
    return [...INITIAL_CONNECTED_APPS];
  }

  static async toggleAppProtection(id: string, enabled: boolean): Promise<void> {
    await new Promise((r) => setTimeout(r, 150));
  }
}
