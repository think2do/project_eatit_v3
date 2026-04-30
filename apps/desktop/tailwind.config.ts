import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

/**
 * Tailwind palette is intentionally narrow (M0.2).
 *
 * `theme.colors` is OVERRIDDEN (not extended) so the default palette
 * (bg-red-500 / text-blue-200 / border-gray-300 / bg-white / bg-black /
 * etc.) is unavailable. All visual colours must flow through the design
 * tokens declared in `src/index.css` (`var(--brand)`, `var(--ink-900)`,
 * etc.) — either via the shared `.btn` / `.card` / `.tag` / etc.
 * classes (`@layer components`) or via `style={{ color: "var(--…)" }}`.
 *
 * The only colour kept here is `border`, because `src/index.css` uses
 * `* { @apply border-border }` and Tailwind needs a `border` palette
 * entry to generate the corresponding `border-color` utility. The CSS
 * var `--border` survives in `:root` for the same reason (M0.1f kept
 * it deliberately).
 *
 * Two further protections live alongside this file:
 *   - `eslint.config.js`'s `no-restricted-syntax` rule catches default
 *     palette utility strings + 6-char hex literals at lint time.
 *   - `scripts/lint-design-tokens.sh` (run via
 *     `corepack pnpm lint:design-tokens` and the CI `frontend` job)
 *     greps `src/` for the same patterns as a belt-and-braces check.
 */
const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      inherit: "inherit",
      border: "hsl(var(--border))",
    },
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
