// Metro bundler config.
//
// Only addition to Expo's default config: registers `.onnx` as a binary
// asset extension, so `require("../../assets/models/fraud_real.onnx")` in
// recipient-risk-service.ts resolves to a bundled asset (Metro's default
// assetExts list covers images/fonts/audio/video, not ML model formats).
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push("onnx");

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && moduleName === "onnxruntime-react-native") {
    return {
      filePath: path.resolve(__dirname, "src/shims/onnxruntime-web-shim.js"),
      type: "sourceFile",
    };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

