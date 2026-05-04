import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// jsdom — useTurnStats relies on `window.setInterval` and React-DOM
// rendering via @testing-library/react. node env would crash both.
// `tsconfigPaths` keeps `@/lib/...` import paths working without
// duplicating the alias here.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: false,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
