import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1000
  },
  server: {
    port: 5173,
    proxy: {
      "/auth": {
        target: "http://localhost:3000",
        changeOrigin: true
      },
      "/readings": {
        target: "http://localhost:3000",
        changeOrigin: true
      },
      "/prediction": {
        target: "http://localhost:3000",
        changeOrigin: true
      }
    }
  }
});
