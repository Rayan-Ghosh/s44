import * as SecureStore from "expo-secure-store";
import * as Device from "expo-device";

const DEVICE_ID_KEY = "avaran.device_identifier.v1";

let _cachedDeviceId: string | null = null;

const generateUuid = (): string => {
  // RFC4122-ish v4 UUID without pulling in a crypto dependency — this only
  // needs to be a stable, effectively-unique local identifier, not a
  // cryptographic one.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

/**
 * A stable per-install device identifier, persisted in SecureStore.
 *
 * This replaces a previous hardcoded literal ("mobile-app-session") that
 * every install shared — since the backend hashes this identifier to
 * detect "new device" risk signals (spec device-risk detector), a shared
 * constant made that detector meaningless for every user. A real per-
 * install ID is what makes device-risk scoring actually mean something.
 */
export const getDeviceIdentifier = async (): Promise<string> => {
  if (_cachedDeviceId) return _cachedDeviceId;
  try {
    const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (existing) {
      _cachedDeviceId = existing;
      return existing;
    }
    const generated = generateUuid();
    await SecureStore.setItemAsync(DEVICE_ID_KEY, generated);
    _cachedDeviceId = generated;
    return generated;
  } catch {
    // SecureStore unavailable — fall back to a per-session-only id rather
    // than a shared constant.
    if (!_cachedDeviceId) _cachedDeviceId = generateUuid();
    return _cachedDeviceId;
  }
};

/** Real device model name, e.g. "Pixel 8 Pro" — from expo-device, not invented. */
export const getDeviceName = (): string => {
  return Device.modelName || Device.deviceName || `${Device.osName || "Unknown"} Device`;
};

/** Real OS + version label, e.g. "Android 15". */
export const getDeviceType = (): string => {
  const os = Device.osName || "Unknown OS";
  const version = Device.osVersion ? ` ${Device.osVersion}` : "";
  return `${os}${version}`;
};
