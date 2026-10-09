import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Built into ../dist/demo and served by the MCP server at /demo.
// In dev, /mcp is proxied to the local server so the page stays same-origin.
export default defineConfig({
  plugins: [react()],
  base: "/demo/",
  build: {
    outDir: "../dist/demo",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three/")) return "three";
          if (id.includes("@react-three") || id.includes("postprocessing")) return "r3f";
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: { "/mcp": "http://127.0.0.1:3333", "/health": "http://127.0.0.1:3333", "/auth": "http://127.0.0.1:3333", "/api": "http://127.0.0.1:3333" },
  },
});
