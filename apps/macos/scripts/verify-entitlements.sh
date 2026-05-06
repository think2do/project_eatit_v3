#!/usr/bin/env bash
#
# verify-entitlements.sh — Eatit Build Phase post-build script
#
# Validates the SOURCE entitlements file (deterministic, runs in any phase):
#   1. com.apple.security.app-sandbox = true (constraints §A0.1)
#   2. None of constraint §A0.2 banned keys present
# Optional bonus: if a signed .app exists in BUILT_PRODUCTS_DIR, also
# cross-check the embedded entitlements via codesign --entitlements :-
# (soft check; missing signature → warning, not fail).
#
set -euo pipefail

SRC_ENT="${SRCROOT:-$(cd "$(dirname "$0")/.." && pwd)}/Eatit/Eatit.entitlements"

if [[ ! -f "$SRC_ENT" ]]; then
    echo "FATAL: source entitlements not found: $SRC_ENT" >&2
    exit 1
fi

# === source-file static assertions (always run) ===

# Required: com.apple.security.app-sandbox = true
# Use PlistBuddy for reliable boolean extraction (key and value are on separate lines)
SANDBOX_VAL="$(/usr/libexec/PlistBuddy -c "Print com.apple.security.app-sandbox" "$SRC_ENT" 2>/dev/null || true)"
if [[ "$SANDBOX_VAL" != "true" ]]; then
    echo "FATAL: app-sandbox entitlement missing or not <true/> in $SRC_ENT" >&2
    cat "$SRC_ENT" >&2
    exit 1
fi

# Banned keys (constraints §A0.2)
BANNED=(
    "network.server"
    "disable-library-validation"
    "allow-unsigned-executable-memory"
    "allow-jit"
    "allow-dyld-environment-variables"
)
for key in "${BANNED[@]}"; do
    if grep -q "$key" "$SRC_ENT"; then
        echo "FATAL: banned entitlement key '$key' found in $SRC_ENT (constraints §A0.2)" >&2
        exit 1
    fi
done

echo "✅ source entitlements verified: app-sandbox=true, no banned keys"

# === optional bonus: signed-bundle cross-check ===

APP_PATH="${BUILT_PRODUCTS_DIR:-}/${PRODUCT_NAME:-Eatit}.app"
if [[ -d "$APP_PATH" ]]; then
    SIGNED_ENT="$(codesign -d --entitlements :- "$APP_PATH" 2>/dev/null || true)"
    if [[ -n "$SIGNED_ENT" ]]; then
        # Write to a temp file so PlistBuddy can parse it
        SIGNED_ENT_TMP="$(mktemp /tmp/eatit-signed-ent.XXXXXX.plist)"
        printf '%s' "$SIGNED_ENT" > "$SIGNED_ENT_TMP"
        SIGNED_SANDBOX="$(/usr/libexec/PlistBuddy -c "Print com.apple.security.app-sandbox" "$SIGNED_ENT_TMP" 2>/dev/null || true)"
        rm -f "$SIGNED_ENT_TMP"
        if [[ "$SIGNED_SANDBOX" == "true" ]]; then
            echo "✅ signed-bundle entitlements verified: app-sandbox=true"
        else
            echo "WARN: signed bundle missing app-sandbox=true — check signing config" >&2
        fi
        for key in "${BANNED[@]}"; do
            if printf '%s' "$SIGNED_ENT" | grep -q "$key"; then
                echo "FATAL: banned entitlement '$key' in signed bundle" >&2
                exit 1
            fi
        done
    else
        echo "(signed bundle not yet codesigned at this build phase — skipping cross-check)"
    fi
fi

# 写 stamp 文件让 Xcode dependency analysis 知道 outputFiles 已落地。
# 不写 → "entitlements modified during build" 误报。
if [[ -n "${DERIVED_FILE_DIR:-}" ]]; then
    mkdir -p "$DERIVED_FILE_DIR"
    touch "$DERIVED_FILE_DIR/verify-entitlements.stamp"
fi

exit 0
