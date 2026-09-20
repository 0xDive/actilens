import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const env = (
  globalThis as unknown as {
    process: { env: Record<string, string | undefined> };
  }
).process.env;
const host = env.TAURI_DEV_HOST;
const platform = env.TAURI_ENV_PLATFORM;
const debug = Boolean(env.TAURI_ENV_DEBUG);

export default defineConfig(async () => ({
  plugins: [react()],

  // Tauri serves the bundled frontend from its own app protocol. Relative asset
  // URLs work consistently across Windows WebView2, macOS WebKit and Linux.
  base: "./",

  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_ENV_*"],

  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },

  build: {
    // Match Tauri's documented browser targets instead of relying on Vite's
    // moving default target, which can emit syntax unsupported by older WebView2.
    target: platform === "windows" ? "chrome105" : "safari13",
    minify: !debug,
    sourcemap: debug,
  },
}));
