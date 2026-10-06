# 📱 Question Mind - Mobile App Guide

The Mobile version of Question Mind is a native Android application built using **React**, **Capacitor**, and **Chaquopy**. 
Unlike traditional apps, it embeds the *entire Python backend* directly onto the device, meaning it can run FastAPI, generate AI responses, and manage the database without needing a centralized web server!

---

## 🛠️ Prerequisites

1. **Node.js** & **npm** installed.
2. **Android Studio** installed (with Android SDK & Command Line Tools).
3. **USB Debugging** enabled on your physical Android phone, and connected to your PC via USB.

---

## 🚀 How to Run and Test

All mobile commands must be executed from inside the `mobile-app` directory:
```bash
cd mobile-app
```

### 1. Build the Frontend & Sync with Android
Any time you install new npm packages or capacitor plugins, you must sync them to the native Android project:
```bash
npx cap sync android
```

### 2. Run with Live Reload (Recommended for Development)
This is the fastest way to test the app. It deploys the APK to your connected phone, but serves the React frontend locally from your PC. This means any changes you make to `.tsx` files will instantly update on your phone screen!

```bash
npx cap run android --livereload
```
> **Note:** Your phone and PC must be on the same Wi-Fi network for Live Reload to work!

### 3. Build a Standalone Production APK
If you want to build a real standalone app that doesn't depend on your PC's local server:
```bash
npm run build
npx cap sync android
npx cap run android
```
*(Or you can open Android Studio and build a signed release APK from the `android/` directory).*

---

## 🏗️ Architecture details

- **Frontend (`src/`)**: Built with React, Vite, and TailwindCSS.
- **Backend (`android/app/src/main/python/`)**: The complete Python FastAPI backend is bundled directly into the app using Chaquopy.
- **The Bridge (`src/lib/chaquopyBridge.ts`)**: Replaces standard `axios` web requests. Instead of making HTTP calls to a server, the frontend calls a Java Bridge, which synchronously invokes the local Python `TestClient` and returns the data natively.
- **Offline Mode**: Powered by `@capacitor/network`. The app will immediately block access if the device loses internet connection, preventing database crashes.
- **Storage**: Uses pure-python `requests` to upload files directly to Google Drive, bypassing native filesystem limitations.

---

## 🔑 Environment Variables
The mobile app relies on the exact same `.env` credentials as the web backend. If you need to update the Database URL or API keys, modify the file located at:
`mobile-app/android/app/src/main/python/.env`
