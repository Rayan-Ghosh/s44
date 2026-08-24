# Avaran Mobile Application (`apps/mobile`)

Avaran is a real-time, privacy-preserving UPI and digital wallet fraud-protection application built with React Native and Expo.

## Features

- **95% Neutral Monochrome Visual System**: Apple-grade restraint, editorial typography, quiet semantic green/amber/red accents.
- **Biometric Security Layer**: Hardware-backed biometric authentication (Face ID, Touch ID, Fingerprint, Device Passcode) on launch and background resume.
- **Real-Time 4-Signal Fusion**: Explains transaction risk across behavioral, device, transaction history, and live voice patterns.
- **Call & Social Engineering Shield**: Acoustic and linguistic NLP scam interception during active voice calls.
- **UI Thread Block Watchdog**: 250ms heartbeat monitoring that catches thread freezes and recovers responsiveness gracefully.
- **App Health Diagnostics**: Real-time event loop lag (ms) and render frame rate (FPS) metrics.
- **Global Error Boundary**: Intercepts unhandled React runtime exceptions without full-app crashes.

## Getting Started

### Prerequisites
- Node.js >= 18
- npm or yarn

### Installation
```bash
cd apps/mobile
npm install
```

### Running the App
```bash
# Start Expo development server
npx expo start

# Run on Web
npx expo start --web

# Run on Android
npx expo start --android

# Run on iOS
npx expo start --ios

# Run TypeScript typecheck
npm run typecheck
```
