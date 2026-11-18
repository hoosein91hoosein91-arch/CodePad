// Static SPA build for the Android (Capacitor) app. No server, auth disabled.
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  resolve: {
    tsconfigPaths: true,
    alias: {
      stream: fileURLToPath(new URL("./src/labshell/shims/stream.ts", import.meta.url)),
    },
  },
  plugins: [
    tailwindcss(),
    tanstackStart({ spa: { enabled: true, prerender: { outputPath: "/index.html" } } }),
    viteReact(),
  ],
});
