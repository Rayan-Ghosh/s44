import React, { createContext, useContext, useState, useCallback } from "react";
import {
  AuthService,
  UserSession,
  UserLoginCredentials,
  UserSignupCredentials,
  DEFAULT_USER_SESSION,
} from "../services/auth-service";

interface AuthContextType {
  session: UserSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: UserLoginCredentials) => Promise<{ success: boolean; error?: string }>;
  signup: (data: UserSignupCredentials) => Promise<{ success: boolean; error?: string }>;
  loginWithDemo: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

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

  const loginWithDemo = useCallback(async () => {
    setIsLoading(true);
    try {
      setSession(DEFAULT_USER_SESSION);
    } finally {
      setIsLoading(false);
    }
  }, []);

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
        login,
        signup,
        loginWithDemo,
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
