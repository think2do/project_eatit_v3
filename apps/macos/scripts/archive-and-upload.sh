#!/usr/bin/env bash
#
# archive-and-upload.sh — Eatit v3.4 macOS App Store TestFlight upload
#
# Prerequisites (one-time, by human):
#   1. Apple Developer Program enrollment ($99/yr)
#   2. App Store Connect: create App ID com.eatit.desktop + Eatit App record
#   3. Install Apple Distribution cert (.p12) into login keychain
#   4. App-specific password generated at appleid.apple.com → Sign-In and Security
#      Stored: security add-generic-password -s AC_PASSWORD -a "$APPLE_ID" -w '<app-pwd>'
#   5. export APPLE_ID="<your-apple-id-email>"
#
# Usage: ./scripts/archive-and-upload.sh
#
# Output: build/Eatit.xcarchive + build/Eatit.pkg + TestFlight upload

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "${PROJECT_DIR}"

if [[ -z "${APPLE_ID:-}" ]]; then
  echo "ERROR: APPLE_ID env var not set. See script header for setup." >&2
  exit 1
fi

# Verify keychain has AC_PASSWORD
if ! security find-generic-password -s AC_PASSWORD -a "${APPLE_ID}" >/dev/null 2>&1; then
  echo "ERROR: keychain item AC_PASSWORD not found for account ${APPLE_ID}" >&2
  echo "       Run: security add-generic-password -s AC_PASSWORD -a \"\$APPLE_ID\" -w '<app-specific-pwd>'" >&2
  exit 1
fi

# Step 1: Archive (override Developer ID → Apple Distribution at command line,
# project.yml keeps Developer ID for local dev xcodebuild build)
echo "==> Archiving Eatit (Apple Distribution signing)..."
xcodebuild -scheme Eatit \
    -configuration Release \
    -destination "platform=macOS" \
    -archivePath build/Eatit.xcarchive \
    DEVELOPMENT_TEAM=469QTH6TU2 \
    CODE_SIGN_STYLE=Manual \
    CODE_SIGN_IDENTITY="Apple Distribution" \
    -allowProvisioningUpdates \
    archive

# Step 2: Export to .pkg
echo "==> Exporting to .pkg..."
xcodebuild -exportArchive \
    -archivePath build/Eatit.xcarchive \
    -exportOptionsPlist ExportOptions-AppStore.plist \
    -exportPath build/

if [[ ! -f build/Eatit.pkg ]]; then
  echo "ERROR: build/Eatit.pkg not produced" >&2
  exit 1
fi

PKG_SIZE=$(ls -lh build/Eatit.pkg | awk '{print $5}')
echo "==> Eatit.pkg: ${PKG_SIZE}"

# Step 3: Upload to App Store Connect
echo "==> Uploading to App Store Connect..."
xcrun altool --upload-app \
    --type macos \
    --file build/Eatit.pkg \
    --username "${APPLE_ID}" \
    --password "@keychain:AC_PASSWORD"

echo "==> Upload complete. Check App Store Connect → TestFlight in 5-10 min."
