#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

fail=0

# Ban os_log with Authorization / Bearer / apiKey / allHTTPHeaderFields
if grep -rE "os_log.*[Aa]uthorization|os_log.*[Bb]earer|os_log.*[Aa]pi[Kk]ey|os_log.*allHTTPHeaderFields" apps/macos/ 2>/dev/null; then
  echo "os_log leak"; fail=1
fi

# Ban print() with Authorization / Bearer / apiKey / allHTTPHeaderFields
if grep -rE "print\(.*[Aa]uthorization|print\(.*[Bb]earer|print\(.*[Aa]pi[Kk]ey|print\(.*allHTTPHeaderFields" apps/macos/ 2>/dev/null; then
  echo "print leak"; fail=1
fi

# Ban console.log/error/warn/info/debug with Authorization / Bearer / apiKey
if grep -rE "console\.(log|error|warn|info|debug).*[Aa]uthorization|console\.(log|error|warn|info|debug).*[Bb]earer|console\.(log|error|warn|info|debug).*[Aa]pi[Kk]ey" apps/desktop/src/ 2>/dev/null; then
  echo "console.log leak"; fail=1
fi

# Ban real key literals committed to repo (excluding Tests + fixtures dirs)
if git ls-files apps/macos apps/desktop | xargs grep -lE "(sk-[A-Za-z0-9]{20,}|ark-[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9_-]{20,})" 2>/dev/null | grep -v Tests | grep -v fixtures; then
  echo "key literal in non-test file"; fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "check-no-key-leak: OK"
fi
exit $fail
