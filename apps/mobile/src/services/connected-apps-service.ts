export interface ConnectedApp {
  id: string;
  name: string;
  description: string;
  category: string;
  type: "upi" | "banking";
  status: "Protected" | "Paused";
  iconName: "logo-google" | "wallet-outline" | "card-outline" | "swap-horizontal-outline" | "business-outline";
  isProtected: boolean;
  packageName?: string;
  scheme?: string;
  isCustomAdded?: boolean;
}

export const INITIAL_CONNECTED_APPS: ConnectedApp[] = [
  {
    id: "gpay",
    name: "Google Pay",
    description: "UPI Intent Interception & Velocity Shield",
    category: "Real-time UPI Interception",
    type: "upi",
    status: "Protected",
    iconName: "logo-google",
    isProtected: true,
    packageName: "com.google.android.apps.nbu.paisa.user",
    scheme: "tez://upi/pay",
  },
  {
    id: "phonepe",
    name: "PhonePe",
    description: "UPI Intent Interception & QR Guard",
    category: "Real-time UPI Interception",
    type: "upi",
    status: "Protected",
    iconName: "wallet-outline",
    isProtected: true,
    packageName: "com.phonepe.app",
    scheme: "phonepe://pay",
  },
  {
    id: "paytm",
    name: "Paytm Payments",
    description: "Wallet & FastPay Anomaly Protection",
    category: "Wallet & UPI Protection",
    type: "upi",
    status: "Protected",
    iconName: "card-outline",
    isProtected: true,
    packageName: "net.one97.paytm",
    scheme: "paytmmp://pay",
  },
  {
    id: "bhim",
    name: "BHIM UPI",
    description: "National UPI Gateway Protocol Guard",
    category: "National UPI Gateway",
    type: "upi",
    status: "Protected",
    iconName: "swap-horizontal-outline",
    isProtected: true,
    packageName: "in.org.npci.upiapp",
    scheme: "in.org.npci.upiapp://pay",
  },
  {
    id: "bank",
    name: "Primary Banking App",
    description: "IMPS / NEFT Account Transfer Guard",
    category: "Account Transfer Guard",
    type: "banking",
    status: "Protected",
    iconName: "business-outline",
    isProtected: true,
  },
];

export const SUPPORTED_CATALOG_APPS: Omit<ConnectedApp, "isProtected" | "status">[] = [
  {
    id: "gpay",
    name: "Google Pay",
    description: "UPI Intent Interception & Velocity Shield",
    category: "Real-time UPI Interception",
    type: "upi",
    iconName: "logo-google",
    packageName: "com.google.android.apps.nbu.paisa.user",
    scheme: "tez://upi/pay",
  },
  {
    id: "phonepe",
    name: "PhonePe",
    description: "UPI Intent Interception & QR Guard",
    category: "Real-time UPI Interception",
    type: "upi",
    iconName: "wallet-outline",
    packageName: "com.phonepe.app",
    scheme: "phonepe://pay",
  },
  {
    id: "paytm",
    name: "Paytm Payments",
    description: "Wallet & FastPay Anomaly Protection",
    category: "Wallet & UPI Protection",
    type: "upi",
    iconName: "card-outline",
    packageName: "net.one97.paytm",
    scheme: "paytmmp://pay",
  },
  {
    id: "bhim",
    name: "BHIM UPI",
    description: "National UPI Gateway Protocol Guard",
    category: "National UPI Gateway",
    type: "upi",
    iconName: "swap-horizontal-outline",
    packageName: "in.org.npci.upiapp",
    scheme: "in.org.npci.upiapp://pay",
  },
  {
    id: "cred",
    name: "CRED Pay UPI",
    description: "High-value Credit & Peer Transfer Shield",
    category: "Credit & Peer Transfer Guard",
    type: "upi",
    iconName: "card-outline",
    packageName: "com.dreamplug.androidapp",
    scheme: "credpay://upi",
  },
  {
    id: "amazonpay",
    name: "Amazon Pay",
    description: "Merchant UPI Gateway & Escrow Guard",
    category: "Merchant UPI Gateway",
    type: "upi",
    iconName: "business-outline",
    packageName: "in.amazon.mShop.android.shopping",
    scheme: "amazonpay://pay",
  },
];

type Listener = (apps: ConnectedApp[]) => void;

class ConnectedAppsManager {
  private apps: ConnectedApp[] = [...INITIAL_CONNECTED_APPS];
  private listeners: Set<Listener> = new Set();

  public getApps(): ConnectedApp[] {
    return [...this.apps];
  }

  public toggleAppProtection(id: string, isProtected: boolean): ConnectedApp | undefined {
    this.apps = this.apps.map((app) =>
      app.id === id
        ? {
            ...app,
            isProtected,
            status: isProtected ? "Protected" : "Paused",
          }
        : app
    );
    this.notify();
    return this.apps.find((app) => app.id === id);
  }

  public addApp(catalogApp: typeof SUPPORTED_CATALOG_APPS[0]): { success: boolean; app?: ConnectedApp; error?: string } {
    const existing = this.apps.find((a) => a.id === catalogApp.id);
    if (existing) {
      // Re-enable if exists
      this.toggleAppProtection(existing.id, true);
      return { success: true, app: existing };
    }

    const newApp: ConnectedApp = {
      ...catalogApp,
      isProtected: true,
      status: "Protected",
      isCustomAdded: true,
    };

    this.apps = [...this.apps, newApp];
    this.notify();
    return { success: true, app: newApp };
  }

  public removeApp(id: string): boolean {
    const beforeCount = this.apps.length;
    this.apps = this.apps.filter((a) => a.id !== id);
    if (this.apps.length !== beforeCount) {
      this.notify();
      return true;
    }
    return false;
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const copy = [...this.apps];
    this.listeners.forEach((listener) => {
      try {
        listener(copy);
      } catch {
        // Listener error handling
      }
    });
  }
}

export const ConnectedAppsService = new ConnectedAppsManager();
