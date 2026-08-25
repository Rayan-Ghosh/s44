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

---

## Download and Install Android APK

1. **Download `AVARAN.apk`** from GitHub ([`releases/AVARAN.apk`](../../releases/AVARAN.apk)).
2. **Transfer / download** it to your Android phone.
3. **Open the APK** file from your downloads or file manager.
4. **Allow installation from unknown sources** if Android prompts for permission.
5. **Install AVARAN**.
6. **Open the app** directly without needing Metro, Expo Go, or any development server.

---

## API Configuration for Evaluators

The AVARAN APK is designed to work both with a live FastAPI backend and in offline fallback mode:

### 1. Running against the Local FastAPI Server
To connect the mobile app to your locally running FastAPI backend:
1. Start the FastAPI backend:
   ```bash
   # From repository root
   .venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir apps/api
   # Or using Node runner:
   node server.js --seed
   ```
2. **Android Emulator**:
   - The compiled APK automatically routes network calls to `http://10.0.2.2:8000` when running inside the standard Android emulator (the emulator loopback gateway for host machine `127.0.0.1:8000`). No extra configuration needed.
3. **Physical Android Device on Local Wi-Fi**:
   - Set `EXPO_PUBLIC_API_URL=http://<YOUR_COMPUTER_IP>:8000` in `apps/mobile/.env` (or pass it during build/development).
   - Ensure your computer and Android phone are on the same Wi-Fi network and port `8000` is open on your firewall.

### 2. Verified Endpoints & Flows
- **Authentication**: `POST /api/v1/auth/login` and `POST /api/v1/auth/signup`
- **Payment Overview**: `GET /api/v1/users/{userId}/overview`
- **Transactions List**: `GET /api/v1/users/{userId}/transactions`
- **Live Risk Scoring**: `POST /api/v1/risk/evaluate`
- **Payment Actions**: `POST /api/v1/transactions/{id}/confirm`, `/cancel`, `/report`
- **Graceful Offline Fallback**: If the API server is unreachable, the app automatically switches to offline security protection mode without crashing.
