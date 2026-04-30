#!/bin/bash
# M0.2 — design-system grep sweep.
#
# Scans apps/desktop/src/ for two violation patterns:
#   1. Default Tailwind palette utility classes (bg-red-500 / text-blue-200
#      / border-gray-300 / etc.). The Tailwind palette itself is
#      narrowed to {transparent, current, inherit, border} in
#      tailwind.config.ts, so these utilities would not even compile —
#      this grep catches them at lint stage with a clearer message.
#   2. Six-character hex colour literals in TS/TSX (e.g. "#1F6B3A").
#      Three-char shorthand (#fff / #000) is intentionally below the
#      regex threshold; literal "white" / "black" remain the allowed
#      escape hatch (D2 exception).
#
# Pair with eslint.config.js's `no-restricted-syntax` rule (AST-level)
# and the M0.2 Tailwind palette override.
set -e
cd "$(dirname "$0")/.."

VIOLATIONS=$(grep -rE 'bg-(red|green|blue|yellow|orange|amber|lime|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|gray|slate|zinc|neutral|stone)-[0-9]+|text-(red|green|blue|yellow|orange|amber|lime|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|gray|slate|zinc|neutral|stone)-[0-9]+' src/ --include='*.ts' --include='*.tsx' --include='*.css' || true)

if [ -n "$VIOLATIONS" ]; then
  echo "❌ Tailwind default palette detected:"
  echo "$VIOLATIONS"
  exit 1
fi

HEX_VIOLATIONS=$(grep -rE '"#[0-9A-Fa-f]{6}"' src/ --include='*.ts' --include='*.tsx' | grep -vE '"#fff[0-9A-Fa-f]{0,3}"|"#000[0-9A-Fa-f]{0,3}"' || true)

if [ -n "$HEX_VIOLATIONS" ]; then
  echo "❌ Hard-coded hex color detected (excluding white/black):"
  echo "$HEX_VIOLATIONS"
  exit 1
fi

echo "✅ Design tokens clean"
