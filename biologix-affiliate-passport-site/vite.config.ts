import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/passport/",
  plugins: [react()],
  build: {
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
  },
});
