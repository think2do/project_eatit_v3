#!/bin/bash
set -euo pipefail

# Skip if running from Xcode preview / SwiftUI canvas
if [[ "${ENABLE_PREVIEWS:-NO}" == "YES" ]]; then
  echo "Skipping vite sync in preview mode"
  exit 0
fi

cd "${SRCROOT}/../desktop"

# Enable corepack if not already active
corepack enable >/dev/null 2>&1 || true

# Install deps (idempotent)
corepack pnpm install --frozen-lockfile

# Build with macOS target
EATIT_BUILD_TARGET=macos corepack pnpm build

# Re-create .gitkeep (vite's emptyOutDir wipes it; we want git to keep
# tracking the directory even when no build artefact is committed).
touch "${SRCROOT}/Eatit/Resources/web/.gitkeep"

echo "Synced vite build to ${SRCROOT}/Eatit/Resources/web/"
