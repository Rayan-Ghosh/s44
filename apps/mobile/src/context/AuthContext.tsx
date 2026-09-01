import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import {
  AuthService,
  UserSession,
  UserLoginCredentials,
  UserSignupCredentials,
  SignupResult,
  LoginResult,
  DeviceTransferInitResult,
} from "../services/auth-service";
import { setOnUnauthorizedCallback } from "../services/api-client";

interface AuthContextType {
  session: UserSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isRestoringSession: boolean;
  isPostLoginLoading: boolean;
  setPostLoginLoading: (loading: boolean) => void;
  login: (credentials: UserLoginCredentials) => Promise<LoginResult>;
  signup: (data: UserSignupCredentials) => Promise<SignupResult>;
  verifyOtp: (userId: number, otp: string) => Promise<{ success: boolean; error?: string }>;
  resendOtp: (userId: number) => Promise<{ success: boolean; maskedContact?: string; resendCooldownSeconds?: number; isLiveDelivery?: boolean; devTestCode?: string; error?: string }>;
  requestDeviceTransfer: (userId: number, password?: string) => Promise<DeviceTransferInitResult>;
  verifyDeviceTransfer: (userId: number, otp: string) => Promise<{ success: boolean; error?: string }>;
  requestPasswordReset: (identifier: string) => Promise<{
    success: boolean;
    maskedContact?: string;
    resendCooldownSeconds?: number;
    isLiveDelivery?: boolean;
    devTestCode?: string;
    message?: string;
    error?: string;
  }>;
  verifyPasswordResetOtp: (identifier: string, otp: string) => Promise<{ success: boolean; resetToken?: string; error?: string }>;
  resetPassword: (resetToken: string, newPassword: string) => Promise<{ success: boolean; error?: string; message?: string }>;
  updateProfile: (data: { name: string; email: string; phone: string }) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRestoringSession, setIsRestoringSession] = useState<boolean>(true);
  const [isPostLoginLoading, setIsPostLoginLoading] = useState<boolean>(false);

  // Set up unauthorized interceptor to clear session on 401
  useEffect(() => {
    setOnUnauthorizedCallback(() => {
      setSession(null);
      setIsPostLoginLoading(false);
    });
    return () => {
      setOnUnauthorizedCallback(null);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const restored = await AuthService.getCurrentUser();
      if (cancelled) return;
      setSession(restored);
      setIsRestoringSession(false);

      if (restored) {
        AuthService.refreshProfile(restored).then((refreshed) => {
          if (!cancelled) setSession(refreshed);
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (credentials: UserLoginCredentials): Promise<LoginResult> => {
    setIsLoading(true);
    try {
      const res = await AuthService.login(credentials);
      if (res.success && res.session) {
        setIsPostLoginLoading(true);
        setSession(res.session);
        return { success: true, session: res.session };
      }
      return res;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signup = useCallback(async (data: UserSignupCredentials) => {
    setIsLoading(true);
    try {
      const res = await AuthService.signup(data);
      return res;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const verifyOtp = useCallback(async (userId: number, otp: string) => {
    setIsLoading(true);
    try {
      const res = await AuthService.verifyOtp({ userId, otp });
      if (res.success && res.session) {
        setIsPostLoginLoading(true);
        setSession(res.session);
        return { success: true };
      }
      return { success: false, error: res.error || "Verification failed." };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const resendOtp = useCallback(async (userId: number) => {
    setIsLoading(true);
    try {
      const res = await AuthService.resendOtp({ userId });
      return res;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const requestDeviceTransfer = useCallback(async (userId: number, password?: string) => {
    setIsLoading(true);
    try {
      const res = await AuthService.requestDeviceTransfer({ userId, password });
      return res;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const verifyDeviceTransfer = useCallback(async (userId: number, otp: string) => {
    setIsLoading(true);
    try {
      const res = await AuthService.verifyDeviceTransfer({ userId, otp });
      if (res.success && res.session) {
        setIsPostLoginLoading(true);
        setSession(res.session);
        return { success: true };
      }
      return { success: false, error: res.error || "Device transfer verification failed." };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const requestPasswordReset = useCallback(async (identifier: string) => {
    setIsLoading(true);
    try {
      const res = await AuthService.requestPasswordReset(identifier);
      return res;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const verifyPasswordResetOtp = useCallback(async (identifier: string, otp: string) => {
    setIsLoading(true);
    try {
      const res = await AuthService.verifyPasswordResetOtp(identifier, otp);
      return res;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const resetPassword = useCallback(async (resetToken: string, newPassword: string) => {
    setIsLoading(true);
    try {
      const res = await AuthService.resetPassword(resetToken, newPassword);
      if (res.success) {
        setSession(null);
        setIsPostLoginLoading(false);
      }
      return res;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateProfile = useCallback(async (data: { name: string; email: string; phone: string }) => {
    if (!session) {
      return { success: false, error: "You must be logged in to update your profile." };
    }
    setIsLoading(true);
    try {
      const res = await AuthService.updateProfile(session.userId, data);
      if (res.success && res.session) {
        setSession(res.session);
        return { success: true };
      }
      return { success: false, error: res.error || "Profile update failed." };
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await AuthService.logout();
      setIsPostLoginLoading(false);
      setSession(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        isAuthenticated: !!session?.isAuthenticated,
        isLoading,
        isRestoringSession,
        isPostLoginLoading,
        setPostLoginLoading: setIsPostLoginLoading,
        login,
        signup,
        verifyOtp,
        resendOtp,
        requestDeviceTransfer,
        verifyDeviceTransfer,
        requestPasswordReset,
        verifyPasswordResetOtp,
        resetPassword,
        updateProfile,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
