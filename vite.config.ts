import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  // The client serves themes from /local/<id>/ or /marketplace/<id>/, so every asset path stays relative
  base: "./",
  build: {
    target: "chrome130",
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  server: { port: 5173, strictPort: true },
});
