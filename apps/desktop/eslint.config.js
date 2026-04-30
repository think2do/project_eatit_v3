import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["dist", "src-tauri", "node_modules"],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended, prettier],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: "latest",
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // M0.2 — design-system guardrails. AST-level catch for the most
      // common slip-ups: default Tailwind palette utility classes
      // (`bg-blue-600`, `text-rose-200`, …) and 6-char hex literals.
      // White / black are allowed via the string literals "white" and
      // "black" (D2 exception); short hex like "#fff" is below the
      // 6-char floor and is not flagged here. See also
      // scripts/lint-design-tokens.sh for the grep-level sweep.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Literal[value=/^(bg|text|border|ring|fill|stroke)-(red|green|blue|yellow|orange|amber|lime|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|gray|slate|zinc|neutral|stone)-\\d+$/]",
          message:
            "禁用 Tailwind 默认色板,请用 design token (var(--brand) 等) 或 .btn / .card 等共享类",
        },
        {
          selector: "Literal[value=/^#[0-9A-Fa-f]{6}$/]",
          message:
            "禁用十六进制色值,请用 var(--xxx) token (white/black 用字面量 \"white\"/\"black\")",
        },
      ],
    },
  },
);
