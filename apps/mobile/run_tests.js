const ts = require("typescript");
const fs = require("fs");
const path = require("path");
const Module = require("module");

// Stub native/expo modules that can't run in Node
const STUBS = [
  "react-native", "react", "expo-camera", "expo-contacts",
  "@expo/vector-icons", "expo", "expo-modules-core"
];

const origLoad = Module._load;
Module._load = function (r, p, ...a) {
  if (STUBS.some((s) => r === s || r.startsWith(s + "/"))) {
    return {
      StyleSheet: { create: (x) => x },
      Platform: { OS: "web" },
      Animated: { Value: class { interpolate() {} }, timing: () => ({ start: () => {} }), sequence: () => ({ start: () => {} }), delay: () => ({}) },
      Easing: { out: () => () => {}, cubic: () => {}, back: () => {} },
      default: {},
    };
  }
  return origLoad.call(this, r, p, ...a);
};

// Register .ts handler
require.extensions[".ts"] = function (m, fn) {
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
