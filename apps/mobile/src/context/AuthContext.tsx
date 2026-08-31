import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import {
  AuthService,
  UserSession,
  UserLoginCredentials,
  UserSignupCredentials,
} from "../services/auth-service";

interface AuthContextType {
  session: UserSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isRestoringSession: boolean;
  login: (credentials: UserLoginCredentials) => Promise<{ success: boolean; error?: string }>;
  signup: (data: UserSignupCredentials) => Promise<{ success: boolean; error?: string }>;
  updateProfile: (data: { name: string; email: string; phone: string }) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRestoringSession, setIsRestoringSession] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const restored = await AuthService.getCurrentUser();
      if (cancelled) return;
      setSession(restored);
      setIsRestoringSession(false);

      // Don't block first paint on this — refresh in the background and
      // update the session if the server has newer profile data.
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

  const login = useCallback(async (credentials: UserLoginCredentials) => {
    setIsLoading(true);
    try {
      const res = await AuthService.login(credentials);
      if (res.success && res.session) {
        setSession(res.session);
        return { success: true };
      }
      return { success: false, error: res.error || "Login failed. Please check your credentials." };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signup = useCallback(async (data: UserSignupCredentials) => {
    setIsLoading(true);
    try {
      const res = await AuthService.signup(data);
      if (res.success && res.session) {
        setSession(res.session);
        return { success: true };
      }
      return { success: false, error: res.error || "Signup failed." };
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
        login,
        signup,
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
