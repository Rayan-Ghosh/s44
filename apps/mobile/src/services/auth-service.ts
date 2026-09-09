import * as SecureStore from "expo-secure-store";
import { ApiClient, setAuthToken, IS_DEMO_MODE, isDemoMode } from "./api-client";
import { getDevicePayload } from "./device-info-service";

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

export interface LoginResult {
  success: boolean;
  session?: UserSession;
  requiresDeviceTransfer?: boolean;
  userId?: number;
  maskedContact?: string;
  error?: string;
}

export interface DeviceTransferInitResult {
  success: boolean;
  requiresDeviceTransfer?: boolean;
  userId?: number;
  maskedContact?: string;
  resendCooldownSeconds?: number;
  isLiveDelivery?: boolean;
  devTestCode?: string;
  error?: string;
}

const SESSION_STORAGE_KEY = "avaran.session.v1";

/**
 * Only used when EXPO_PUBLIC_DEMO_MODE="true" is explicitly set.
 */
const buildDemoSession = (overrides: Partial<UserSession> = {}): UserSession => ({
  isAuthenticated: true,
  userId: 1,
  name: "Rahul Sharma",
  email: "rahul@example.com",
  phone: "+91 98765 43210",
  memberSince: "August 2025",
  token: "usr_sess_demo_token_avaran_2026",
  ...overrides,
});

export const persistSession = async (session: UserSession): Promise<void> => {
  const data = JSON.stringify(session);
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, data);
    } catch {}
  }
  try {
    await SecureStore.setItemAsync(SESSION_STORAGE_KEY, data);
  } catch {}
};

export const clearPersistedSession = async (): Promise<void> => {
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {}
  }
  try {
    await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
  } catch {}
};

export const loadPersistedSession = async (): Promise<UserSession | null> => {
  try {
    let raw: string | null = null;
    if (typeof localStorage !== "undefined") {
      try {
        raw = localStorage.getItem(SESSION_STORAGE_KEY);
      } catch {}
    }
    if (!raw) {
      try {
        raw = await SecureStore.getItemAsync(SESSION_STORAGE_KEY);
      } catch {}
    }
    if (!raw) return null;
    const session = JSON.parse(raw) as UserSession;
    if (!session || typeof session.userId !== "number" || !session.token) return null;
    return session;
  } catch {
    return null;
  }
};

export interface SignupResult {
  success: boolean;
  pendingVerification?: boolean;
  userId?: number;
  maskedContact?: string;
  resendCooldownSeconds?: number;
  isLiveDelivery?: boolean;
  devTestCode?: string;
  session?: UserSession;
  error?: string;
}

export class AuthService {
  /**
   * User Authentication Service Layer
   * Calls the FastAPI backend endpoint: POST /api/v1/auth/login
   */
  static async login(
    credentials: UserLoginCredentials
  ): Promise<LoginResult> {
    const id = credentials.identifier ? credentials.identifier.trim() : "";
    if (!id) {
      return { success: false, error: "Please enter your email address or mobile number." };
    }

    if (isDemoMode()) {
      const session = buildDemoSession({
        name: id.includes("@") ? id.split("@")[0].replace(".", " ") : "Demo User",
        email: id.includes("@") ? id : "demo@avaran.app",
        phone: id.startsWith("+") || /^\d+$/.test(id) ? id : "+91 90000 00000",
      });
      setAuthToken(session.token);
      await persistSession(session);
      return { success: true, session };
    }

    const devInfo = await getDevicePayload();

    const response = await ApiClient.post<{
      success?: boolean;
      token?: string;
      access_token?: string;
      refresh_token?: string;
      user?: { id: number; name: string; phone: string; email: string };
      requiresDeviceTransfer?: boolean;
      userId?: number;
      maskedContact?: string;
      message?: string;
    }>("/api/v1/auth/login", {
      identifier: id,
      password: credentials.password || "password123",
      deviceId: devInfo.deviceId,
      deviceName: devInfo.deviceName,
      deviceType: devInfo.deviceType,
    });

    if (response.data && response.data.success && response.data.token && response.data.user) {
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

    // Check if login requires device transfer
    const detail = (response.data as any)?.detail || response.data;
    if (response.status === 409 || detail?.requiresDeviceTransfer) {
      return {
        success: false,
        requiresDeviceTransfer: true,
        userId: detail?.userId,
        maskedContact: detail?.maskedContact,
        error: detail?.message || "This account is currently secured to another device.",
      };
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
  ): Promise<SignupResult> {
    if (!data.fullName.trim()) {
      return { success: false, error: "Please enter your full name." };
    }
    if (!data.mobileNumber.trim()) {
      return { success: false, error: "Please enter your mobile number." };
    }
    if (!data.email.trim() || !data.email.includes("@")) {
      return { success: false, error: "Please enter a valid email address." };
    }
    if (!data.password || data.password.length < 10) {
      return { success: false, error: "Password must be at least 10 characters long." };
    }
    if (!/[A-Z]/.test(data.password)) {
      return { success: false, error: "Password must contain at least one uppercase letter." };
    }
    if (!/[a-z]/.test(data.password)) {
      return { success: false, error: "Password must contain at least one lowercase letter." };
    }
    if (!/[0-9]/.test(data.password)) {
      return { success: false, error: "Password must contain at least one number." };
    }
    if (!/[^A-Za-z0-9]/.test(data.password)) {
      return { success: false, error: "Password must contain at least one special character." };
    }
    if (data.password !== data.confirmPassword) {
      return { success: false, error: "Passwords do not match." };
    }
    if (!data.termsAccepted) {
      return { success: false, error: "Please accept the Terms of Service & Privacy Policy." };
    }

    if (IS_DEMO_MODE) {
      return {
        success: true,
        pendingVerification: true,
        userId: 1,
        maskedContact: data.mobileNumber ? "+91 ******" + data.mobileNumber.slice(-4) : "+91 ******3210",
        resendCooldownSeconds: 30,
        isLiveDelivery: false,
        devTestCode: "123456",
      };
    }

    const devInfo = await getDevicePayload();

    const response = await ApiClient.post<{
      success: boolean;
      pendingVerification?: boolean;
      userId?: number;
      maskedContact?: string;
      resendCooldownSeconds?: number;
      isLiveDelivery?: boolean;
      devTestCode?: string;
      token?: string;
      access_token?: string;
      refresh_token?: string;
      user?: { id: number; name: string; phone: string; email: string };
    }>("/api/v1/auth/signup", {
      fullName: data.fullName.trim(),
      mobileNumber: data.mobileNumber.trim(),
      email: data.email.trim(),
      password: data.password,
      termsAccepted: data.termsAccepted,
      deviceId: devInfo.deviceId,
      deviceName: devInfo.deviceName,
      deviceType: devInfo.deviceType,
    });

    if (response.data && response.data.success) {
      return {
        success: true,
        pendingVerification: response.data.pendingVerification ?? true,
        userId: response.data.userId,
        maskedContact: response.data.maskedContact,
        resendCooldownSeconds: response.data.resendCooldownSeconds ?? 30,
        isLiveDelivery: response.data.isLiveDelivery ?? false,
        devTestCode: response.data.devTestCode,
      };
    }

    return {
      success: false,
      error: response.isNetworkError
        ? response.error || "Unable to reach the Avaran server. Please check your connection."
        : response.error || "Registration failed. Please try again.",
    };
  }

  static async verifyOtp(params: {
    userId: number;
    otp: string;
  }): Promise<{ success: boolean; session?: UserSession; error?: string }> {
    const cleanOtp = params.otp.trim();
    if (!cleanOtp || cleanOtp.length !== 6) {
      return { success: false, error: "Please enter the 6-digit verification code." };
    }

    if (IS_DEMO_MODE) {
      const session = buildDemoSession({
        userId: params.userId,
        memberSince: "Today",
        token: `usr_sess_reg_${Date.now()}`,
      });
      setAuthToken(session.token);
      await persistSession(session);
      return { success: true, session };
    }

    const devInfo = await getDevicePayload();

    const response = await ApiClient.post<{
      success: boolean;
      token: string;
      access_token?: string;
      refresh_token?: string;
      user: { id: number; name: string; phone: string; email: string };
    }>("/api/v1/auth/verify-otp", {
      userId: params.userId,
      otp: cleanOtp,
      deviceId: devInfo.deviceId,
      deviceName: devInfo.deviceName,
      deviceType: devInfo.deviceType,
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
        : response.error || "Verification failed. Please check your code.",
    };
  }

  static async requestDeviceTransfer(params: {
    userId: number;
    password?: string;
  }): Promise<DeviceTransferInitResult> {
    if (IS_DEMO_MODE) {
      return {
        success: true,
        requiresDeviceTransfer: true,
        userId: params.userId,
        maskedContact: "+91 ******3210",
        resendCooldownSeconds: 30,
        isLiveDelivery: false,
        devTestCode: "123456",
      };
    }

    const devInfo = await getDevicePayload();

    const response = await ApiClient.post<{
      success: boolean;
      requiresDeviceTransfer?: boolean;
      userId: number;
      maskedContact: string;
      resendCooldownSeconds?: number;
      isLiveDelivery?: boolean;
      devTestCode?: string;
      message?: string;
    }>("/api/v1/auth/request-device-transfer", {
      userId: params.userId,
      password: params.password,
      deviceId: devInfo.deviceId,
      deviceName: devInfo.deviceName,
      deviceType: devInfo.deviceType,
    });

    if (response.data && response.data.success) {
      return {
        success: true,
        requiresDeviceTransfer: true,
        userId: response.data.userId,
        maskedContact: response.data.maskedContact,
        resendCooldownSeconds: response.data.resendCooldownSeconds ?? 30,
        isLiveDelivery: response.data.isLiveDelivery ?? false,
        devTestCode: response.data.devTestCode,
      };
    }

    return {
      success: false,
      error: response.error || "Failed to initiate device transfer. Please try again.",
    };
  }

  static async verifyDeviceTransfer(params: {
    userId: number;
    otp: string;
  }): Promise<{ success: boolean; session?: UserSession; error?: string }> {
    const cleanOtp = params.otp.trim();
    if (!cleanOtp || cleanOtp.length !== 6) {
      return { success: false, error: "Please enter the 6-digit transfer code." };
    }

    if (IS_DEMO_MODE) {
      const session = buildDemoSession({
        userId: params.userId,
        memberSince: "Transferred Today",
        token: `usr_sess_transferred_${Date.now()}`,
      });
      setAuthToken(session.token);
      await persistSession(session);
      return { success: true, session };
    }

    const devInfo = await getDevicePayload();

    const response = await ApiClient.post<{
      success: boolean;
      token: string;
      user: { id: number; name: string; phone: string; email: string };
    }>("/api/v1/auth/verify-device-transfer", {
      userId: params.userId,
      otp: cleanOtp,
      deviceId: devInfo.deviceId,
      deviceName: devInfo.deviceName,
      deviceType: devInfo.deviceType,
    });

    if (response.data && response.data.success) {
      const u = response.data.user;
      const session: UserSession = {
        isAuthenticated: true,
        userId: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        memberSince: "Transferred Device",
        token: response.data.token,
      };
      setAuthToken(session.token);
      await persistSession(session);
      return { success: true, session };
    }

    return {
      success: false,
      error: response.error || "Invalid transfer verification code.",
    };
  }

  static async resendOtp(params: {
    userId: number;
  }): Promise<{ success: boolean; maskedContact?: string; resendCooldownSeconds?: number; isLiveDelivery?: boolean; devTestCode?: string; error?: string }> {
    if (IS_DEMO_MODE) {
      return { success: true, resendCooldownSeconds: 30, isLiveDelivery: false, devTestCode: "123456" };
    }

    const response = await ApiClient.post<{
      success: boolean;
      maskedContact: string;
      resendCooldownSeconds: number;
      isLiveDelivery?: boolean;
      devTestCode?: string;
      message: string;
    }>("/api/v1/auth/resend-otp", {
      userId: params.userId,
    });

    if (response.data && response.data.success) {
      return {
        success: true,
        maskedContact: response.data.maskedContact,
        resendCooldownSeconds: response.data.resendCooldownSeconds,
        isLiveDelivery: response.data.isLiveDelivery ?? false,
        devTestCode: response.data.devTestCode,
      };
    }

    return {
      success: false,
      error: response.isNetworkError
        ? response.error || "Unable to reach the Avaran server. Please check your connection."
        : response.error || "Failed to resend code. Please wait before trying again.",
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

  /**
   * Secure Logout:
   * 1. Explicitly revokes server session.
   * 2. Clears in-memory auth token.
   * 3. Wipes SecureStore and localStorage.
   */
  static async logout(): Promise<void> {
    try {
      const current = await loadPersistedSession();
      if (current?.refreshToken) {
        await ApiClient.post("/api/v1/auth/logout", { refresh_token: current.refreshToken });
      } else {
        await ApiClient.post("/api/v1/auth/logout");
      }
    } catch {
      // best-effort remote revocation
    }
    setAuthToken(null);
    await clearPersistedSession();
  }

  /**
   * Validates persisted session with backend on app boot.
   * If server rejects (session revoked or expired), wipes local session immediately.
   */
  static async getCurrentUser(): Promise<UserSession | null> {
    const session = await loadPersistedSession();
    if (!session || !session.token) {
      return null;
    }

    setAuthToken(session.token);

    if (IS_DEMO_MODE) {
      return session;
    }

    try {
      const check = await ApiClient.get<{ valid: boolean; userId: number }>("/api/v1/auth/validate-session");
      if (check.status === 401 || (check.data && check.data.valid === false)) {
        // Session was revoked or expired on server — clear local session cache
        setAuthToken(null);
        await clearPersistedSession();
        return null;
      }
      return session;
    } catch {
      // If network is offline, maintain session in offline state
      return session;
    }
  }

  /**
   * Password Recovery Flow
   */
  static async requestPasswordReset(identifier: string): Promise<{
    success: boolean;
    maskedContact?: string;
    resendCooldownSeconds?: number;
    isLiveDelivery?: boolean;
    devTestCode?: string;
    message?: string;
    error?: string;
  }> {
    const cleanId = identifier.trim();
    if (!cleanId) {
      return { success: false, error: "Please enter your email address or mobile number." };
    }

    if (IS_DEMO_MODE) {
      return {
        success: true,
        maskedContact: "+91 ******3210",
        resendCooldownSeconds: 30,
        isLiveDelivery: false,
        devTestCode: "123456",
        message: "If an account exists for this information, a verification process has been initiated.",
      };
    }

    const response = await ApiClient.post<{
      success: boolean;
      maskedContact: string;
      resendCooldownSeconds?: number;
      isLiveDelivery?: boolean;
      devTestCode?: string;
      message: string;
    }>("/api/v1/auth/request-password-reset", {
      identifier: cleanId,
    });

    if (response.data && response.data.success) {
      return {
        success: true,
        maskedContact: response.data.maskedContact,
        resendCooldownSeconds: response.data.resendCooldownSeconds ?? 30,
        isLiveDelivery: response.data.isLiveDelivery ?? false,
        devTestCode: response.data.devTestCode,
        message: response.data.message,
      };
    }

    return {
      success: false,
      error: response.error || "Failed to initiate password recovery. Please try again.",
    };
  }

  static async verifyPasswordResetOtp(
    identifier: string,
    otp: string
  ): Promise<{ success: boolean; resetToken?: string; error?: string }> {
    const cleanOtp = otp.trim();
    if (!cleanOtp || cleanOtp.length !== 6) {
      return { success: false, error: "Please enter the 6-digit verification code." };
    }

    if (IS_DEMO_MODE) {
      return {
        success: true,
        resetToken: `pwd_reset_auth_demo_${Date.now()}`,
      };
    }

    const response = await ApiClient.post<{
      success: boolean;
      resetToken: string;
      message: string;
    }>("/api/v1/auth/verify-password-reset-otp", {
      identifier: identifier.trim(),
      otp: cleanOtp,
    });

    if (response.data && response.data.success && response.data.resetToken) {
      return {
        success: true,
        resetToken: response.data.resetToken,
      };
    }

    return {
      success: false,
      error: response.error || "Invalid or expired recovery code.",
    };
  }

  static async resetPassword(
    resetToken: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string; message?: string }> {
    if (!resetToken) {
      return { success: false, error: "Invalid password reset authorization." };
    }

    if (IS_DEMO_MODE) {
      return {
        success: true,
        message: "Password has been reset successfully. Please log in with your new password.",
      };
    }

    const response = await ApiClient.post<{
      success: boolean;
      message: string;
    }>("/api/v1/auth/reset-password", {
      resetToken,
      newPassword,
    });

    if (response.data && response.data.success) {
      // Password changed & server revoked all sessions -> clear local state immediately
      setAuthToken(null);
      await clearPersistedSession();
      return {
        success: true,
        message: response.data.message,
      };
    }

    return {
      success: false,
      error: response.error || "Password reset failed. Please try again.",
    };
  }

  static async refreshProfile(session: UserSession): Promise<UserSession> {
    if (IS_DEMO_MODE) return session;

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
