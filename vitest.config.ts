import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src/browser", import.meta.url))
    }
  },
  test: {
    css: false,
    server: {
      deps: {
        inline: ["@fangxinyan/lumina"]
      }
    }
  }
});
