/**
 * Centralized API Client for Avaran Mobile Application.
 * Communicates with the FastAPI backend at EXPO_PUBLIC_API_URL.
 */

declare const process: any;

export const API_BASE_URL =
  (typeof process !== "undefined" && process?.env?.EXPO_PUBLIC_API_URL) ||
  (typeof window !== "undefined" && window?.location?.hostname === "localhost"
    ? "http://localhost:8000"
    : "http://10.0.2.2:8000");

export const IS_DEMO_MODE =
  typeof process !== "undefined" && process?.env?.EXPO_PUBLIC_DEMO_MODE === "true";

let _authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  _authToken = token;
};

export const getAuthToken = (): string | null => {
  return _authToken;
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
    const url = `${API_BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
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
        } else if (data && typeof data.message === "string") {
          errorMsg = data.message;
        } else if (response.status === 401) {
          errorMsg = "Unauthorized. Please log in again.";
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
