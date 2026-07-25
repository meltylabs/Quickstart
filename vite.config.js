import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import vinext from "vinext";

export default defineConfig({
  publicDir: "biologix-strategy-board",
  plugins: [
    vinext(),
    cloudflare()
  ]
});
