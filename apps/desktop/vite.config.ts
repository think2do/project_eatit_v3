import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  clearScreen: false,
  base: process.env.EATIT_BUILD_TARGET === "macos" ? "eatit://app/" : "/",
  build: {
    outDir: "../macos/Eatit/Resources/web",
    emptyOutDir: true,
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
