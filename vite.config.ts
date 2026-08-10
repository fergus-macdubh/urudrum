import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the built bundle works inside a Capacitor WebView later.
  base: "./",
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: "es2022",
    outDir: "dist",
  },
});
