/**
 * Regression test for Model Cache Service
 * (`apps/mobile/src/utils/__tests__/model-cache.regression.ts`)
 *
 * Part 1: Dependencies & Directory Setup.
 */

import {
  MODEL_CACHE_SUBDIR,
  getModelCacheDirectory,
  getModelPath,
  ensureModelCacheDirectory,
  isModelCached,
  getModelFileInfo,
  listCachedModels,
  deleteCachedModel,
} from "../../services/model-cache-service";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`[OK]   ${message}`);
}

async function runTests() {
  console.log("\n================ MODEL CACHE TESTS ================\n");

  // 1. Constants
  assert(MODEL_CACHE_SUBDIR === "models", "MODEL_CACHE_SUBDIR is 'models'");

  // 2. Directory Resolution
  const dir = getModelCacheDirectory();
  assert(typeof dir === "string", "getModelCacheDirectory() returns a string");
  assert(dir.endsWith("models/"), `Directory ends with 'models/' (${dir})`);
  assert(dir.startsWith("file://"), `Directory uses file:// URI scheme (${dir})`);

  // 3. Model Path Resolution
  const modelName = "s40_transaction_fraud_real.onnx";
  const modelPath = getModelPath(modelName);
  assert(modelPath === `${dir}${modelName}`, `Model path matches expected URI (${modelPath})`);

  // 4. Model Path with leading slashes stripped
  const leadingSlashPath = getModelPath("/leading/slash.onnx");
  assert(leadingSlashPath === `${dir}leading/slash.onnx`, "Leading slashes normalized");

  // 5. Ensure directory async
  const ensured = await ensureModelCacheDirectory();
  assert(ensured === dir, `ensureModelCacheDirectory() returns directory URI (${ensured})`);

  // 6. Metadata inspection (with stubbed file system)
  const info = await getModelFileInfo("test_model.onnx");
  assert(typeof info.exists === "boolean", "getModelFileInfo() returns valid CachedModelInfo");
  assert(info.uri === `${dir}test_model.onnx`, "Metadata URI matches model path");
  assert(info.filename === "test_model.onnx", "Metadata filename preserved");

  // 7. Cached checks & listing
  const isCached = await isModelCached("test_model.onnx");
  assert(typeof isCached === "boolean", "isModelCached returns a boolean");

  const list = await listCachedModels();
  assert(Array.isArray(list), "listCachedModels returns an array");

  const deleted = await deleteCachedModel("test_model.onnx");
  assert(typeof deleted === "boolean", "deleteCachedModel returns a boolean");

  console.log("\nALL MODEL CACHE CHECKS PASSED\n");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
