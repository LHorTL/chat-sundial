import { builtinModules } from "module";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react()
  ],
  base: "./",
  resolve: {
    alias: {
      "@": __dirname
    }
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: "modern-compiler",
        silenceDeprecations: [
          "legacy-js-api"
        ]
      }
    }
  },
  build: {
    outDir: "app/browser",
    emptyOutDir: true,
    rollupOptions: {
      external: [
        "electron",
        "path",
        ...builtinModules
      ]
    }
  }
});
