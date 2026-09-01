import { Platform } from "react-native";
import Constants from "expo-constants";
import { getDevicePayload } from "./device-info-service";

declare const process: any;

/**
 * Default fallback URLs based on environment:
 * - Web / Desktop: http://localhost:8000
 * - Android Emulator: http://10.0.2.2:8000
 * - Physical Phone / Production: Configured via EXPO_PUBLIC_API_URL or runtime setApiBaseUrl()
 */
const getDefaultFallbackUrl = (): string => {
  if (Platform.OS === "web" || (typeof window !== "undefined" && window?.location?.hostname === "localhost")) {
    return "http://localhost:8000";
  }
  if (Platform.OS === "android") {
    return "http://10.0.2.2:8000";
  }
  return "http://localhost:8000";
};

let _customApiBaseUrl: string | null = null;

export const sanitizeApiUrl = (url: string): string => {
  let clean = url.trim();
  if (!clean) return getDefaultFallbackUrl();
  if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
    clean = `http://${clean}`;
  }
  return clean.replace(/\/+$/, "");
};

export const getApiBaseUrl = (): string => {
  if (_customApiBaseUrl) {
    return _customApiBaseUrl;
  }
  const envUrl = typeof process !== "undefined" ? process?.env?.EXPO_PUBLIC_API_URL : null;
  if (envUrl && typeof envUrl === "string" && envUrl.trim()) {
    return sanitizeApiUrl(envUrl);
  }
  const extraUrl = Constants?.expoConfig?.extra?.apiUrl;
  if (extraUrl && typeof extraUrl === "string" && extraUrl.trim()) {
    return sanitizeApiUrl(extraUrl);
  }
  return getDefaultFallbackUrl();
};

export const setApiBaseUrl = (url: string | null): void => {
  if (!url || !url.trim()) {
    _customApiBaseUrl = null;
  } else {
    _customApiBaseUrl = sanitizeApiUrl(url);
  }
};

export const resetApiBaseUrl = (): void => {
  _customApiBaseUrl = null;
};

export const API_BASE_URL = getApiBaseUrl();

export const IS_DEMO_MODE =
  typeof process !== "undefined" && process?.env?.EXPO_PUBLIC_DEMO_MODE === "true";

let _authToken: string | null = null;
let _onUnauthorizedCallback: (() => void) | null = null;

export const setAuthToken = (token: string | null) => {
  _authToken = token;
};

export const getAuthToken = (): string | null => {
  return _authToken;
};

export const setOnUnauthorizedCallback = (cb: (() => void) | null) => {
  _onUnauthorizedCallback = cb;
};

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: number;
  isNetworkError?: boolean;
}

export class ApiClient {
  static async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const baseUrl = getApiBaseUrl();
    const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    const url = `${baseUrl}${cleanEndpoint}`;

    let devInfo: { deviceId: string; deviceName: string; deviceType: string } | null = null;
    try {
      devInfo = await getDevicePayload();
    } catch {
      // best-effort
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(devInfo
        ? {
            "X-Device-Id": devInfo.deviceId,
            "X-Device-Name": devInfo.deviceName,
            "X-Device-Type": devInfo.deviceType,
          }
        : {}),
      ...(options.headers as Record<string, string>),
    };

    if (_authToken) {
      headers["Authorization"] = `Bearer ${_authToken}`;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      let data: any = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        let errorMsg = "An unexpected error occurred.";
        if (data && typeof data.detail === "string") {
          errorMsg = data.detail;
        } else if (data && data.detail && typeof data.detail === "object" && data.detail.message) {
          errorMsg = data.detail.message;
        } else if (data && typeof data.message === "string") {
          errorMsg = data.message;
        } else if (response.status === 401) {
          errorMsg = "Unauthorized. Please log in again.";
          if (_onUnauthorizedCallback) {
            _onUnauthorizedCallback();
          }
        } else if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          if (retryAfter) {
            const minutes = Math.ceil(parseInt(retryAfter, 10) / 60);
            errorMsg = `Too many attempts. Please wait ${minutes > 1 ? `${minutes} minutes` : "a few moments"} before trying again.`;
          } else if (data && typeof data.detail === "string") {
            errorMsg = data.detail;
          } else {
            errorMsg = "Too many attempts. Please wait a few minutes before trying again.";
          }
        } else if (response.status === 404) {
          errorMsg = "Resource not found.";
        } else if (response.status >= 500) {
          errorMsg = "Server error. Please try again later.";
        }

        return {
          status: response.status,
          error: errorMsg,
          data,
        };
      }

      return {
        status: response.status,
        data,
      };
    } catch (err: any) {
      const isAbort = err?.name === "AbortError";
      return {
        status: 0,
        isNetworkError: true,
        error: isAbort
          ? "Request timed out. Please check your connection."
          : "Unable to connect to Avaran server. Using offline security protection.",
      };
    }
  }

  static get<T>(endpoint: string, headers?: Record<string, string>) {
    return this.request<T>(endpoint, { method: "GET", headers });
  }

  static post<T>(endpoint: string, body?: any, headers?: Record<string, string>) {
    return this.request<T>(endpoint, {
      method: "POST",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  static patch<T>(endpoint: string, body?: any, headers?: Record<string, string>) {
    return this.request<T>(endpoint, {
      method: "PATCH",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }
}
