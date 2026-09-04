// Metro bundler config.
//
// Only addition to Expo's default config: registers `.onnx` as a binary
// asset extension, so `require("../../assets/models/fraud_real.onnx")` in
// recipient-risk-service.ts resolves to a bundled asset (Metro's default
// assetExts list covers images/fonts/audio/video, not ML model formats).
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push("onnx");

module.exports = config;
