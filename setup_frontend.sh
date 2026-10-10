#!/bin/bash
set -e

echo "========================================================"
echo "  Campus Connect - React Native Frontend Setup (Unix)"
echo "========================================================"

# 1. Check Node.js & npm
if ! command -v node &> /dev/null || ! command -v npm &> /dev/null; then
    echo "Error: Node.js / npm is not installed or not in PATH."
    echo "Please install Node.js (v18 or v20 LTS) from https://nodejs.org"
    exit 1
fi

echo "[1/3] Detected Node.js $(node -v) and npm $(npm -v)"

# 2. Check & Copy .env
cd "$(dirname "$0")/mobile"

if [ ! -f ".env" ] && [ -f ".env.example" ]; then
    cp .env.example .env
    echo "[2/3] Created mobile/.env from template."
else
    echo "[2/3] mobile/.env configuration detected."
fi

# 3. Install Dependencies
echo "[3/3] Installing mobile dependencies in mobile/..."
npm install

echo ""
echo "========================================================"
echo "  Campus Connect Mobile App Ready!"
echo "  Starting Expo Development Server..."
echo "========================================================"
echo ""
echo "Tips:"
echo "  • Press 'a' for Android Emulator"
echo "  • Press 'i' for iOS Simulator (macOS only)"
echo "  • Press 'w' for Web Browser"
echo "  • Scan QR code using Expo Go app on physical phone"
echo ""

npx expo start
