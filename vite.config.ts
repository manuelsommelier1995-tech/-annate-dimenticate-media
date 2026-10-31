import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base relativo: l'app funziona anche su GitHub Pages o aperta da una sottocartella
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { chunkSizeWarningLimit: 1500 },
});
