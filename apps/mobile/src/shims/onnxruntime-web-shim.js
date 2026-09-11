/**
 * Web fallback shim for onnxruntime-react-native.
 *
 * onnxruntime-react-native requires native Android/iOS compilation.
 * In a web browser environment, this shim provides stub classes so
 * that bundling succeeds, and callers' try/catch blocks catch the
 * unsupported state and fall back cleanly as designed.
 */

export class InferenceSession {
  static async create() {
    throw new Error("onnxruntime-react-native is not supported in web mode; falling back gracefully.");
  }
}

export class Tensor {
  constructor() {
    throw new Error("onnxruntime-react-native is not supported in web mode.");
  }
}

export default {
  InferenceSession,
  Tensor,
};
