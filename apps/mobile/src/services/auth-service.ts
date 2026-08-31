import * as SecureStore from "expo-secure-store";
import { ApiClient, setAuthToken, IS_DEMO_MODE } from "./api-client";

export interface UserSession {
  isAuthenticated: boolean;
  userId: number;
  name: string;
  email: string;
  phone: string;
  memberSince: string;
  token: string;
  accessToken?: string;
  refreshToken?: string;
  isOfflineMode?: boolean;
}

export interface UserLoginCredentials {
  identifier: string; // Email or Mobile Number
  password?: string;
}

export interface UserSignupCredentials {
  fullName: string;
  mobileNumber: string;
  email: string;
  password?: string;
  confirmPassword?: string;
  termsAccepted: boolean;
}

const SESSION_STORAGE_KEY = "avaran.session.v1";

/**
 * Only used when EXPO_PUBLIC_DEMO_MODE="true" is explicitly set — this is an
 * opt-in judge/demo path, not a silent fallback for network failures. See
 * getDemoSession() below for how a login/signup identifier gets folded in.
 */
const buildDemoSession = (overrides: Partial<UserSession> = {}): UserSession => ({
  isAuthenticated: true,
  userId: 1,
  name: "Demo User",
  email: "demo@avaran.app",
  phone: "+91 90000 00000",
  memberSince: "Demo Mode",
  token: "usr_tok_avaran_demo",
  ...overrides,
});

export const persistSession = async (session: UserSession): Promise<void> => {
  try {
    await SecureStore.setItemAsync(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // SecureStore can be unavailable (e.g. certain web/simulator contexts) —
    // the session still works for the current app run, it just won't survive
    // a restart. Not fatal.
  }
};

export const clearPersistedSession = async (): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
  } catch {
    // best-effort
  }
};

export const loadPersistedSession = async (): Promise<UserSession | null> => {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as UserSession;
    if (!session || typeof session.userId !== "number" || !session.token) return null;
    return session;
  } catch {
    return null;
  }
};

export class AuthService {
  /**
   * User Authentication Service Layer
   * Calls the FastAPI backend endpoint: POST /api/v1/auth/login
   */
  static async login(
    credentials: UserLoginCredentials
  ): Promise<{ success: boolean; session?: UserSession; error?: string }> {
    const id = credentials.identifier ? credentials.identifier.trim() : "";
    if (!id) {
      return { success: false, error: "Please enter your email address or mobile number." };
    }

    if (IS_DEMO_MODE) {
      const session = buildDemoSession({
        name: id.includes("@") ? id.split("@")[0].replace(".", " ") : "Demo User",
        email: id.includes("@") ? id : "demo@avaran.app",
        phone: id.startsWith("+") || /^\d+$/.test(id) ? id : "+91 90000 00000",
      });
      setAuthToken(session.token);
      await persistSession(session);
      return { success: true, session };
    }

    const response = await ApiClient.post<{
      success: boolean;
      token: string;
      access_token?: string;
      refresh_token?: string;
      user: { id: number; name: string; phone: string; email: string };
    }>("/api/v1/auth/login", {
      identifier: id,
      password: credentials.password || "password123",
    });

    if (response.data && response.data.success) {
      const u = response.data.user;
      const accessToken = response.data.access_token || response.data.token;
      const session: UserSession = {
        isAuthenticated: true,
        userId: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        memberSince: "Active Member",
        token: accessToken,
        accessToken: accessToken,
        refreshToken: response.data.refresh_token,
      };
      setAuthToken(session.token);
      await persistSession(session);
      return { success: true, session };
    }

    return {
      success: false,
      error: response.isNetworkError
        ? response.error || "Unable to reach the Avaran server. Please check your connection."
        : response.error || "Login failed. Please verify your credentials.",
    };
  }

  static async signup(
    data: UserSignupCredentials
  ): Promise<{ success: boolean; session?: UserSession; error?: string }> {
    if (!data.fullName.trim()) {
      return { success: false, error: "Please enter your full name." };
    }
    if (!data.mobileNumber.trim()) {
      return { success: false, error: "Please enter your mobile number." };
    }
    if (!data.email.trim() || !data.email.includes("@")) {
      return { success: false, error: "Please enter a valid email address." };
    }
    if (!data.password || data.password.length < 6) {
      return { success: false, error: "Password must be at least 6 characters." };
    }
    if (data.password !== data.confirmPassword) {
      return { success: false, error: "Passwords do not match." };
    }
    if (!data.termsAccepted) {
      return { success: false, error: "Please accept the Terms of Service & Privacy Policy." };
    }

    if (IS_DEMO_MODE) {
      const session = buildDemoSession({
        userId: Date.now(),
        name: data.fullName.trim(),
        email: data.email.trim(),
        phone: data.mobileNumber.trim(),
        memberSince: "Today",
        token: `usr_tok_reg_${Date.now()}`,
      });
      setAuthToken(session.token);
      await persistSession(session);
      return { success: true, session };
    }

    const response = await ApiClient.post<{
      success: boolean;
      token: string;
      access_token?: string;
      refresh_token?: string;
      user: { id: number; name: string; phone: string; email: string };
    }>("/api/v1/auth/signup", {
      fullName: data.fullName.trim(),
      mobileNumber: data.mobileNumber.trim(),
      email: data.email.trim(),
      password: data.password,
      termsAccepted: data.termsAccepted,
    });

    if (response.data && response.data.success) {
      const u = response.data.user;
      const accessToken = response.data.access_token || response.data.token;
      const session: UserSession = {
        isAuthenticated: true,
        userId: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        memberSince: "Today",
        token: accessToken,
        accessToken: accessToken,
        refreshToken: response.data.refresh_token,
      };
      setAuthToken(session.token);
      await persistSession(session);
      return { success: true, session };
    }

    return {
      success: false,
      error: response.isNetworkError
        ? response.error || "Unable to reach the Avaran server. Please check your connection."
        : response.error || "Registration failed. Please try again.",
    };
  }

  static async updateProfile(
    userId: number,
    data: { name: string; email: string; phone: string }
  ): Promise<{ success: boolean; session?: UserSession; error?: string }> {
    if (!data.name.trim()) {
      return { success: false, error: "Name cannot be empty." };
    }
    if (!data.phone.trim()) {
      return { success: false, error: "Please enter a valid mobile number." };
    }
    if (!data.email.trim() || !data.email.includes("@")) {
      return { success: false, error: "Please enter a valid email address." };
    }

    const response = await ApiClient.patch<{
      success: boolean;
      user: { id: number; name: string; email: string; phone: string };
    }>(`/api/v1/users/${userId}`, {
      name: data.name.trim(),
      email: data.email.trim(),
      phone: data.phone.trim(),
    });

    if (!response.data || !response.data.success) {
      return {
        success: false,
        error: response.error || "Profile update failed. Please try again.",
      };
    }

    const existing = await loadPersistedSession();
    const updatedSession: UserSession = {
      isAuthenticated: true,
      userId,
      name: response.data.user.name,
      email: response.data.user.email,
      phone: response.data.user.phone,
      memberSince: existing?.memberSince || "Active Member",
      token: existing?.token || "",
    };

    await persistSession(updatedSession);
    return { success: true, session: updatedSession };
  }

  static async logout(): Promise<void> {
    try {
      const current = await loadPersistedSession();
      if (current?.refreshToken) {
        await ApiClient.post("/api/v1/auth/logout", { refresh_token: current.refreshToken });
      }
    } catch {
      // best-effort remote revocation
    }
    setAuthToken(null);
    await clearPersistedSession();
  }

  /** Restores a persisted session on app boot, if one exists. */
  static async getCurrentUser(): Promise<UserSession | null> {
    const session = await loadPersistedSession();
    if (session) {
      setAuthToken(session.token);
    }
    return session;
  }

  /**
   * Re-fetches the real profile from GET /api/v1/users/{id} and merges it
   * into the cached session — the cached copy could predate a profile edit
   * made from another device/session. Fails soft: on any error the caller
   * just keeps using the cached session rather than losing it.
   */
  static async refreshProfile(session: UserSession): Promise<UserSession> {
    const res = await ApiClient.get<{ id: number; name: string; email: string; phone: string }>(
      `/api/v1/users/${session.userId}`
    );
    if (!res.data) return session;

    const refreshed: UserSession = {
      ...session,
      name: res.data.name || session.name,
      email: res.data.email || session.email,
      phone: res.data.phone || session.phone,
    };
    await persistSession(refreshed);
    return refreshed;
  }
}
