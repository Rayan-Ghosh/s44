/**
 * Model Cache Service (`apps/mobile/src/services/model-cache-service.ts`)
 *
 * Part 1: Dependencies & Directory Setup.
 *
 * Provides sandbox filesystem directory resolution, verification, and lifecycle
 * helpers for local ONNX / ML models in the Avaran mobile application.
 *
 * STORAGE SANDBOX POLICY:
 * - Local ML models (e.g. s40_transaction_fraud_real.onnx) are placed inside a dedicated
 *   `models/` subdirectory under the app's persistent `documentDirectory` (with fallback
 *   to `cacheDirectory` if documents storage is unavailable).
 * - Persistent documents storage ensures offline ML evaluation remains resilient
 *   against aggressive OS memory sweeps on Android / iOS devices.
 */

import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

/**
 * Subdirectory within the app's sandboxed document/cache folder reserved for ML models.
 */
export const MODEL_CACHE_SUBDIR = "models";

/**
 * Metadata descriptor for a cached model file.
 */
export interface CachedModelInfo {
  exists: boolean;
  uri: string;
  filename: string;
  size?: number;
  modificationTime?: number;
  isDirectory?: boolean;
}

/**
 * Returns the base sandbox URI for model storage.
 * Defaults to `${documentDirectory}models/`, falling back to `${cacheDirectory}models/`
 * or a local fallback path in web/test runtimes.
 */
export function getModelCacheDirectory(): string {
  const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory || "file:///app/sandbox/";
  const normalized = baseDir.endsWith("/") ? baseDir : `${baseDir}/`;
  return `${normalized}${MODEL_CACHE_SUBDIR}/`;
}

/**
 * Resolves the full URI for a specific model filename within the model cache.
 */
export function getModelPath(modelFilename: string): string {
  const cleanName = modelFilename.replace(/^[/\\]+/, "");
  return `${getModelCacheDirectory()}${cleanName}`;
}

/**
 * Verifies that the model cache directory exists in the app's sandbox.
 * Creates the directory with intermediate parents if it does not yet exist.
 *
 * @returns The absolute URI of the verified model cache directory.
 */
export async function ensureModelCacheDirectory(): Promise<string> {
  const dirUri = getModelCacheDirectory();

  if (Platform.OS === "web") {
    return dirUri;
  }

  try {
    const dirInfo = await FileSystem.getInfoAsync(dirUri);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
    }
  } catch (error) {
    // In unit testing / mocked environments, gracefully handle or rethrow
    if (__DEV__) {
      console.warn(`[ModelCache] Note: ensureModelCacheDirectory check: ${(error as Error)?.message || error}`);
    }
  }

  return dirUri;
}

/**
 * Checks whether a specific model file exists in the model cache and is non-empty.
 */
export async function isModelCached(modelFilename: string): Promise<boolean> {
  const fileUri = getModelPath(modelFilename);

  if (Platform.OS === "web") {
    return false;
  }

  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    return Boolean(info.exists && (info.size === undefined || info.size > 0));
  } catch {
    return false;
  }
}

/**
 * Retrieves detailed file metadata for a specific model in the cache.
 */
export async function getModelFileInfo(modelFilename: string): Promise<CachedModelInfo> {
  const fileUri = getModelPath(modelFilename);

  if (Platform.OS === "web") {
    return {
      exists: false,
      uri: fileUri,
      filename: modelFilename,
    };
  }

  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    return {
      exists: info.exists,
      uri: fileUri,
      filename: modelFilename,
      size: info.exists && "size" in info ? info.size : undefined,
      modificationTime: info.exists && "modificationTime" in info ? info.modificationTime : undefined,
      isDirectory: info.isDirectory,
    };
  } catch {
    return {
      exists: false,
      uri: fileUri,
      filename: modelFilename,
    };
  }
}

/**
 * Lists all cached model filenames currently residing in the model cache directory.
 */
export async function listCachedModels(): Promise<string[]> {
  const dirUri = getModelCacheDirectory();

  if (Platform.OS === "web") {
    return [];
  }

  try {
    const dirInfo = await FileSystem.getInfoAsync(dirUri);
    if (!dirInfo.exists) {
      return [];
    }
    return await FileSystem.readDirectoryAsync(dirUri);
  } catch {
    return [];
  }
}

/**
 * Deletes a specific model file from the cache if it exists.
 */
export async function deleteCachedModel(modelFilename: string): Promise<boolean> {
  const fileUri = getModelPath(modelFilename);

  if (Platform.OS === "web") {
    return false;
  }

  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (info.exists) {
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
