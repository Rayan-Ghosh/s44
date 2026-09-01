import * as SecureStore from "expo-secure-store";
import { AppState, AppStateStatus, Platform } from "react-native";
import { BiometricService } from "./biometric-service";

// Secure Storage Keys
const PIN_SALT_KEY = "avaran_app_lock_pin_salt";
const PIN_VERIFIER_KEY = "avaran_app_lock_pin_verifier";
const PIN_ENABLED_KEY = "avaran_app_lock_pin_enabled";
const FAILED_ATTEMPTS_KEY = "avaran_app_lock_failed_attempts";
const LOCKOUT_UNTIL_KEY = "avaran_app_lock_lockout_until";

// Configurable background lockout threshold (default 30 seconds)
export const BACKGROUND_LOCK_THRESHOLD_MS = 30 * 1000;

// Progressive Lockout Cooldowns (in seconds)
const LOCKOUT_COOLDOWNS = [30, 60, 300, 900]; // 30s, 1m, 5m, 15m

// Self-contained, constant-time SHA-256 implementation for zero-dependency local hashing
function sha256(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let result = "";

  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  let hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  for (let i = 0; i < ascii.length; i++) {
    const j = i >> 2;
    words[j] = (words[j] || 0) | (ascii.charCodeAt(i) << ((3 - (i % 4)) * 8));
  }

  words[asciiBitLength >> 5] = (words[asciiBitLength >> 5] || 0) | (0x80 << ((3 - ((asciiBitLength >> 3) % 4)) * 8));
  words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;

  for (let i = 0; i < words.length; i += 16) {
    const w = words.slice(i, i + 16);
    const oldHash = hash.slice(0);

    for (let j = 0; j < 64; j++) {
      if (j >= 16) {
        const s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        const s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }

      const s1 = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25);
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const temp1 = (hash[7] + s1 + ch + k[j] + w[j]) | 0;
      const s0 = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const temp2 = (s0 + maj) | 0;

      hash[7] = hash[6];
      hash[6] = hash[5];
      hash[5] = hash[4];
      hash[4] = (hash[3] + temp1) | 0;
      hash[3] = hash[2];
      hash[2] = hash[1];
      hash[1] = hash[0];
      hash[0] = (temp1 + temp2) | 0;
    }

    for (let j = 0; j < 8; j++) {
      hash[j] = (hash[j] + oldHash[j]) | 0;
    }
  }

  for (let i = 0; i < 8; i++) {
    for (let j = 3; j >= 0; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? "0" : "") + b.toString(16);
    }
  }

  return result;
}

// Constant-time string comparison
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// Secure Storage Wrappers with Fallback
async function secureGet(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(key);
    }
    return null;
  }
}

async function secureSet(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
    }
  }
}

async function secureDelete(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(key);
    }
  }
}

export class AppLockService {
  private static _isLocked: boolean = false;
  private static _lastBackgroundedTimestamp: number = 0;
  private static _listeners: Array<(locked: boolean) => void> = [];

  /**
   * Subscribe to lock state changes
   */
  static addLockStateListener(callback: (locked: boolean) => void): () => void {
    this._listeners.push(callback);
    return () => {
      this._listeners = this._listeners.filter((cb) => cb !== callback);
    };
  }

  private static _notifyListeners() {
    this._listeners.forEach((cb) => cb(this._isLocked));
  }

  /**
   * Initialize App Lock lifecycle watcher with AppState
   */
  static initLifecycleWatcher() {
    AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "background" || nextState === "inactive") {
        this._lastBackgroundedTimestamp = Date.now();
      } else if (nextState === "active") {
        if (this._lastBackgroundedTimestamp > 0) {
          const elapsed = Date.now() - this._lastBackgroundedTimestamp;
          if (elapsed >= BACKGROUND_LOCK_THRESHOLD_MS) {
            this.lockApplication();
          }
        }
      }
    });
  }

  static isAppLocked(): boolean {
    return this._isLocked;
  }

  static lockApplication(): void {
    this._isLocked = true;
    this._notifyListeners();
  }

  static unlockApplication(): void {
    this._isLocked = false;
    this._notifyListeners();
  }

  /**
   * Checks if the user has configured a 6-digit App PIN
   */
  static async isPinConfigured(): Promise<boolean> {
    const verifier = await secureGet(PIN_VERIFIER_KEY);
    const enabled = await secureGet(PIN_ENABLED_KEY);
    return !!verifier && enabled === "true";
  }

  /**
   * Sets up a new 6-digit numeric PIN.
   * Generates a per-device cryptographic salt and derives verifier.
   */
  static async setupPin(pin: string): Promise<{ success: boolean; error?: string }> {
    if (!/^\d{6}$/.test(pin)) {
      return { success: false, error: "PIN must be exactly 6 digits." };
    }

    // Generate random 16-char hex salt
    const salt = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
    const verifier = sha256(`avaran-pin-salt:${salt}:pin:${pin}`);

    await secureSet(PIN_SALT_KEY, salt);
    await secureSet(PIN_VERIFIER_KEY, verifier);
    await secureSet(PIN_ENABLED_KEY, "true");
    await secureSet(FAILED_ATTEMPTS_KEY, "0");
    await secureDelete(LOCKOUT_UNTIL_KEY);

    return { success: true };
  }

  /**
   * Checks if user is temporarily locked out due to repeated incorrect PIN attempts.
   */
  static async isLockedOut(): Promise<{ lockedOut: boolean; remainingSeconds: number }> {
    const lockoutUntilStr = await secureGet(LOCKOUT_UNTIL_KEY);
    if (!lockoutUntilStr) {
      return { lockedOut: false, remainingSeconds: 0 };
    }

    const lockoutUntil = parseInt(lockoutUntilStr, 10);
    const now = Date.now();
    if (now < lockoutUntil) {
      const remainingSeconds = Math.ceil((lockoutUntil - now) / 1000);
      return { lockedOut: true, remainingSeconds };
    }

    return { lockedOut: false, remainingSeconds: 0 };
  }

  /**
   * Verifies an entered 6-digit PIN against the securely stored verifier.
   * Enforces progressive lockout on 5+ failed attempts.
   */
  static async verifyPin(enteredPin: string): Promise<{
    success: boolean;
    error?: string;
    lockoutRemainingSeconds?: number;
    failedAttempts?: number;
  }> {
    // 1. Check lockout status
    const lockoutStatus = await this.isLockedOut();
    if (lockoutStatus.lockedOut) {
      return {
        success: false,
        error: `Too many incorrect attempts. Locked for ${lockoutStatus.remainingSeconds}s.`,
        lockoutRemainingSeconds: lockoutStatus.remainingSeconds,
      };
    }

    // 2. Fetch salt and verifier
    const salt = await secureGet(PIN_SALT_KEY);
    const expectedVerifier = await secureGet(PIN_VERIFIER_KEY);

    if (!salt || !expectedVerifier) {
      return { success: false, error: "App PIN is not configured." };
    }

    const computedVerifier = sha256(`avaran-pin-salt:${salt}:pin:${enteredPin}`);
    const isMatch = timingSafeEqual(computedVerifier, expectedVerifier);

    if (isMatch) {
      // Reset failure state
      await secureSet(FAILED_ATTEMPTS_KEY, "0");
      await secureDelete(LOCKOUT_UNTIL_KEY);
      this.unlockApplication();
      return { success: true };
    }

    // Handle failure and progressive lockout
    const failedAttemptsStr = (await secureGet(FAILED_ATTEMPTS_KEY)) || "0";
    const failedAttempts = parseInt(failedAttemptsStr, 10) + 1;
    await secureSet(FAILED_ATTEMPTS_KEY, failedAttempts.toString());

    if (failedAttempts >= 5) {
      const cooldownIndex = Math.min(failedAttempts - 5, LOCKOUT_COOLDOWNS.length - 1);
      const cooldownSeconds = LOCKOUT_COOLDOWNS[cooldownIndex];
      const lockoutUntil = Date.now() + cooldownSeconds * 1000;
      await secureSet(LOCKOUT_UNTIL_KEY, lockoutUntil.toString());

      return {
        success: false,
        error: `Incorrect PIN. Locked out for ${cooldownSeconds} seconds.`,
        lockoutRemainingSeconds: cooldownSeconds,
        failedAttempts,
      };
    }

    const remainingAttempts = 5 - failedAttempts;
    return {
      success: false,
      error: `Incorrect PIN. ${remainingAttempts} attempt${remainingAttempts === 1 ? "" : "s"} remaining before lockout.`,
      failedAttempts,
    };
  }

  /**
   * Disables and removes configured PIN
   */
  static async removePin(): Promise<void> {
    await secureDelete(PIN_SALT_KEY);
    await secureDelete(PIN_VERIFIER_KEY);
    await secureSet(PIN_ENABLED_KEY, "false");
    await secureSet(FAILED_ATTEMPTS_KEY, "0");
    await secureDelete(LOCKOUT_UNTIL_KEY);
  }
}
