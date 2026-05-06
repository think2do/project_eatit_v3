import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  clearScreen: false,
  base: process.env.EATIT_BUILD_TARGET === "macos" ? "eatit://app/" : "/",
  build: {
    outDir: "../macos/Eatit/Resources/web",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      // @langchain/langgraph imports node:async_hooks at module-load time;
      // browser/WKWebView has no AsyncLocalStorage. Stub it so the production
      // bundle builds. Degrades trace-context propagation but graph exec OK.
      "node:async_hooks": fileURLToPath(new URL("./src/shims/async-hooks.ts", import.meta.url)),
      "async_hooks": fileURLToPath(new URL("./src/shims/async-hooks.ts", import.meta.url)),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
