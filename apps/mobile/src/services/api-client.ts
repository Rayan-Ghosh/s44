import { Platform } from "react-native";
import Constants from "expo-constants";
import { getDevicePayload } from "./device-info-service";

declare const process: any;

/**
 * Default API URL.
 *
 * Local development:
 * http://127.0.0.1:8000
 *
 * Android Emulator normally uses:
 * http://10.0.2.2:8000
 */
const getHostIp = (): string | null => {
  const hostUri =
    Constants?.expoConfig?.hostUri ||
    (Constants as any)?.manifest2?.extra?.expoClient?.hostUri ||
    (Constants as any)?.manifest?.debuggerHost ||
    (Constants as any)?.experienceUrl;
  if (hostUri && typeof hostUri === "string") {
    const cleaned = hostUri.replace(/^[a-zA-Z]+:\/\//, "");
    const ip = cleaned.split(":")[0];
    if (ip && ip !== "localhost" && ip !== "127.0.0.1") {
      return ip;
    }
  }
  return null;
};

/**
 * Default API URL.
 *
 * Automatically resolves computer LAN IP in Expo Go / physical devices,
 * with fallback to local development server.
 */
const getDefaultFallbackUrl = (): string => {
  const hostIp = getHostIp();
  if (hostIp) {
    return `http://${hostIp}:8000`;
  }
  return "http://10.160.81.164:8000";
};

let _customApiBaseUrl: string | null = null;

/**
 * Cleans and normalizes an API URL.
 * On physical devices (Android/iOS), rewrites localhost/127.0.0.1 to the computer's LAN IP.
 */
export const sanitizeApiUrl = (url: string): string => {
  let clean = url.trim();

  if (!clean) {
    return getDefaultFallbackUrl();
  }

  if (
    !clean.startsWith("http://") &&
    !clean.startsWith("https://")
  ) {
    clean = `http://${clean}`;
  }

  // On physical devices, localhost/127.0.0.1 points to the device itself.
  // Rewrite to the computer's LAN IP so network requests reach the backend.
  if (Platform.OS !== "web" && (clean.includes("://localhost") || clean.includes("://127.0.0.1"))) {
    const hostIp = getHostIp() || "10.160.81.164";
    clean = clean.replace("://localhost", `://${hostIp}`).replace("://127.0.0.1", `://${hostIp}`);
  }

  return clean.replace(/\/+$/, "");
};

/**
 * Gets the current API base URL.
 *
 * Priority:
 * 1. Runtime custom URL
 * 2. EXPO_PUBLIC_API_URL from .env
 * 3. Expo config extra.apiUrl
 * 4. Physical device fallback IP
 */
export const getApiBaseUrl = (): string => {
  if (_customApiBaseUrl) {
    return _customApiBaseUrl;
  }

  const envUrl =
    typeof process !== "undefined"
      ? process?.env?.EXPO_PUBLIC_API_URL
      : null;

  if (
    envUrl &&
    typeof envUrl === "string" &&
    envUrl.trim()
  ) {
    return sanitizeApiUrl(envUrl);
  }

  const extraUrl = Constants?.expoConfig?.extra?.apiUrl;

  if (
    extraUrl &&
    typeof extraUrl === "string" &&
    extraUrl.trim()
  ) {
    return sanitizeApiUrl(extraUrl);
  }

  return getDefaultFallbackUrl();
};

/**
 * Allows the user to override the API URL at runtime.
 */
export const setApiBaseUrl = (url: string | null): void => {
  if (!url || !url.trim()) {
    _customApiBaseUrl = null;
  } else {
    _customApiBaseUrl = sanitizeApiUrl(url);
  }
};

/**
 * Resets runtime API URL.
 */
export const resetApiBaseUrl = (): void => {
  _customApiBaseUrl = null;
};

/**
 * Initial API base URL.
 */
export const API_BASE_URL = getApiBaseUrl();

export interface DemoModeAudit {
  isDemoMode: boolean;
  source: "runtime_override" | "env_var" | "expo_extra" | "default_production";
  rawValue: unknown;
  isExplicitDemo: boolean;
}

let _runtimeDemoMode: boolean | null = null;

/**
 * Explicitly set or override demo mode at runtime (strictly for testing).
 * In ordinary application runtime, this should never be called.
 */
export const setDemoMode = (enabled: boolean | null): void => {
  _runtimeDemoMode = enabled;
};

/**
 * Resets the runtime demo mode override, returning configuration resolution to env/extra defaults.
 */
export const resetDemoMode = (): void => {
  _runtimeDemoMode = null;
};

/**
 * Centralized, hardened configuration resolver for demo mode.
 *
 * Strict Production Guarantees:
 * 1. Live/production is the default: if no explicit intentional configuration is found,
 *    demo mode is strictly FALSE.
 * 2. Strict evaluation of environment variables:
 *    - ONLY exact string "true" (case-sensitive) enables demo mode.
 *    - All other values ("1", "yes", "TRUE", "True", "true ", "0", "false", "", arbitrary)
 *      are treated as invalid / non-demo and evaluate to FALSE.
 * 3. Strict evaluation of Expo extra configuration:
 *    - ONLY boolean true or exact string "true" enables demo mode.
 *    - Missing, falsy, or malformed extra (numbers, objects, arrays, "yes", "1", "TRUE")
 *      evaluate to FALSE.
 * 4. Runtime override:
 *    - Only active when _runtimeDemoMode is explicitly non-null (set in tests).
 */
export const resolveDemoModeConfiguration = (): DemoModeAudit => {
  if (_runtimeDemoMode !== null) {
    return {
      isDemoMode: _runtimeDemoMode === true,
      source: "runtime_override",
      rawValue: _runtimeDemoMode,
      isExplicitDemo: _runtimeDemoMode === true,
    };
  }

  // 1. Check EXPO_PUBLIC_DEMO_MODE environment variable
  const rawEnv =
    typeof process !== "undefined" && process?.env
      ? process.env.EXPO_PUBLIC_DEMO_MODE
      : undefined;

  if (rawEnv !== undefined && rawEnv !== null) {
    const isExplicitTrue = typeof rawEnv === "string" && rawEnv === "true";
    return {
      isDemoMode: isExplicitTrue,
      source: "env_var",
      rawValue: rawEnv,
      isExplicitDemo: isExplicitTrue,
    };
  }

  // 2. Check Expo Constants extra
  const expoConfig =
    Constants?.expoConfig ?? (Constants as any)?.default?.expoConfig;
  const rawExtra = expoConfig?.extra?.demoMode;
  if (rawExtra !== undefined && rawExtra !== null) {
    const isExplicitTrue = rawExtra === true || rawExtra === "true";
    return {
      isDemoMode: isExplicitTrue,
      source: "expo_extra",
      rawValue: rawExtra,
      isExplicitDemo: isExplicitTrue,
    };
  }

  // 3. Default fallback: Live / Production mode
  return {
    isDemoMode: false,
    source: "default_production",
    rawValue: undefined,
    isExplicitDemo: false,
  };
};

/**
 * Determines whether the application is operating in explicit demo/test mode.
 */
export const isDemoMode = (): boolean => {
  return resolveDemoModeConfiguration().isDemoMode;
};

/**
 * Demo mode indicator. Evaluates dynamically via isDemoMode().
 */
export const IS_DEMO_MODE = isDemoMode();

/**
 * Authentication token.
 */
let _authToken: string | null = null;

/**
 * Callback for unauthorized responses.
 */
let _onUnauthorizedCallback: (() => void) | null = null;

export const setAuthToken = (token: string | null) => {
  _authToken = token;
};

export const getAuthToken = (): string | null => {
  return _authToken;
};

export const setOnUnauthorizedCallback = (
  cb: (() => void) | null
) => {
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

    const cleanEndpoint = endpoint.startsWith("/")
      ? endpoint
      : `/${endpoint}`;

    const url = `${baseUrl}${cleanEndpoint}`;

    let devInfo: {
      deviceId: string;
      deviceName: string;
      deviceType: string;
    } | null = null;

    try {
      devInfo = await getDevicePayload();
    } catch {
      // Device information is optional.
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

      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 10000);

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
        } else if (
          data &&
          data.detail &&
          typeof data.detail === "object" &&
          data.detail.message
        ) {
          errorMsg = data.detail.message;
        } else if (
          data &&
          typeof data.message === "string"
        ) {
          errorMsg = data.message;
        } else if (response.status === 401) {
          errorMsg = "Unauthorized. Please log in again.";

          if (_onUnauthorizedCallback) {
            _onUnauthorizedCallback();
          }
        } else if (response.status === 429) {
          const retryAfter =
            response.headers.get("Retry-After");

          if (retryAfter) {
            const minutes = Math.ceil(
              parseInt(retryAfter, 10) / 60
            );

            errorMsg = `Too many attempts. Please wait ${
              minutes > 1
                ? `${minutes} minutes`
                : "a few moments"
            } before trying again.`;
          } else {
            errorMsg =
              "Too many attempts. Please wait a few minutes before trying again.";
          }
        } else if (response.status === 404) {
          errorMsg = "Resource not found.";
        } else if (response.status >= 500) {
          errorMsg =
            "Server error. Please try again later.";
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

  static get<T>(
    endpoint: string,
    headers?: Record<string, string>
  ) {
    return this.request<T>(endpoint, {
      method: "GET",
      headers,
    });
  }

  static post<T>(
    endpoint: string,
    body?: any,
    headers?: Record<string, string>
  ) {
    return this.request<T>(endpoint, {
      method: "POST",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  static patch<T>(
    endpoint: string,
    body?: any,
    headers?: Record<string, string>
  ) {
    return this.request<T>(endpoint, {
      method: "PATCH",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }
}