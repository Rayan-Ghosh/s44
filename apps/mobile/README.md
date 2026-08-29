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

The AVARAN mobile application uses a production-safe, multi-tier API configuration mechanism. It automatically connects to the appropriate backend without hardcoding or requiring code modifications.

### Backend Startup
Start the FastAPI server from the repository root:
```bash
# Direct uvicorn execution:
.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir apps/api

# Or using the Node runner with seed data:
node server.js --seed
```

---

### Supported Deployment Environments

#### 1. Android Emulator (Local Host)
- **Base URL**: `http://10.0.2.2:8000`
- **Setup**: Zero configuration required. The APK automatically resolves `10.0.2.2:8000` (the standard Android virtual router loopback to your host computer's `127.0.0.1:8000`).

#### 2. Physical Android Phone (Same Wi-Fi Network)
- **Base URL**: `http://<YOUR_COMPUTER_IP>:8000` (e.g. `http://192.168.1.50:8000`)
- **Setup**:
  1. Find your computer's local Wi-Fi IP:
     - **Windows**: Run `ipconfig` (look for *IPv4 Address* under Wireless LAN adapter, e.g. `192.168.1.50`)
     - **macOS/Linux**: Run `ifconfig` or `ip a`
  2. Set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env`:
     ```env
     EXPO_PUBLIC_API_URL=http://192.168.1.50:8000
     ```
  3. Ensure your phone and PC are connected to the same Wi-Fi network and your firewall allows incoming connections on port `8000`.

#### 3. Public Cloud / HTTPS API
- **Base URL**: `https://api.yourdomain.com` (or Railway, Render, ngrok, Cloudflare Tunnel)
- **Setup**:
  Set `EXPO_PUBLIC_API_URL` to your live HTTPS endpoint:
  ```env
  EXPO_PUBLIC_API_URL=https://api.yourdomain.com
  ```
  The APK will securely communicate over TLS with zero local networking requirements.

---

### Checking Active Server Configuration in App
- In the app, navigate to **Profile** &rarr; **SUPPORT & LEGAL** &rarr; **Server Endpoint**.
- Tapping **Server Endpoint** displays the active runtime base URL and connectivity guidelines.

---

### Verified Endpoints & Capabilities
- **Authentication**: `POST /api/v1/auth/login` and `POST /api/v1/auth/signup`
- **Monthly Overview & Metrics**: `GET /api/v1/users/{userId}/overview`
- **Transaction History & Risk Breakdown**: `GET /api/v1/users/{userId}/transactions`
- **Live Multi-Signal ML Risk Scoring**: `POST /api/v1/risk/evaluate`
- **Payment Actions**: `POST /api/v1/transactions/{id}/confirm`, `/cancel`, `/report`
- **Graceful Offline Fallback**: If the server is unreachable or offline, the app displays local security status without crashing.
