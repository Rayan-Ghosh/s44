const ts = require("typescript");
const fs = require("fs");
const path = require("path");
const Module = require("module");

// Stub native/expo modules that can't run in Node
const STUBS = [
  "react-native", "react", "expo-camera", "expo-contacts",
  "@expo/vector-icons", "expo", "expo-modules-core", "expo-constants", "expo-device",
  "expo-secure-store", "expo-file-system", "expo-document-picker"
];

const origLoad = Module._load;
Module._load = function (r, p, ...a) {
  if (STUBS.some((s) => r === s || r.startsWith(s + "/"))) {
    return {
      getDocumentAsync: async () => ({ canceled: true, assets: null }),
      documentDirectory: "file:///data/user/0/com.avaran.security/files/",
      cacheDirectory: "file:///data/user/0/com.avaran.security/cache/",
      getInfoAsync: async () => ({ exists: true, isDirectory: true }),
      makeDirectoryAsync: async () => {},
      readDirectoryAsync: async () => [],
      deleteAsync: async () => {},
      StyleSheet: { create: (x) => x },
      Platform: { OS: "web", select: (obj) => (obj ? obj.web || obj.default || Object.values(obj)[0] : undefined) },
      Animated: { Value: class { interpolate() {} }, timing: () => ({ start: () => {} }), sequence: () => ({ start: () => {} }), delay: () => ({}) },
      Easing: { out: () => () => {}, cubic: () => {}, back: () => {} },
      NativeModules: {},
      NativeEventEmitter: class {
        constructor() {}
        addListener() { return { remove: () => {} }; }
        removeAllListeners() {}
      },
      DeviceEventEmitter: {
        addListener: () => ({ remove: () => {} }),
        removeAllListeners: () => {},
        emit: () => {},
      },
      PermissionsAndroid: {
        PERMISSIONS: {
          RECORD_AUDIO: "android.permission.RECORD_AUDIO",
          READ_PHONE_STATE: "android.permission.READ_PHONE_STATE",
        },
        RESULTS: { GRANTED: "granted", DENIED: "denied" },
        requestMultiple: async () => ({}),
      },
      default: {},
    };
  }
  return origLoad.call(this, r, p, ...a);
};

// Register .ts and .tsx handler
const compileTs = function (m, fn) {
  const src = fs.readFileSync(fn, "utf8");
  const out = ts.transpileModule(src, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      jsx: 2, // ReactNative
    },
  }).outputText;
  m._compile(out, fn);
};
require.extensions[".ts"] = compileTs;
require.extensions[".tsx"] = compileTs;

// Run each test file passed as argument
const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: node run_tests.js <file.ts> [file2.ts ...]");
  process.exit(1);
}

let allPassed = true;
for (const f of files) {
  const abs = path.resolve(f);
  console.log("\n\n" + "=".repeat(65));
  console.log("RUNNING: " + f);
  console.log("=".repeat(65) + "\n");
  try {
    require(abs);
  } catch (e) {
    console.error("FATAL ERROR in " + f + ":", e.message);
    allPassed = false;
  }
}
