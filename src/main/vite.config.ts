import { builtinModules } from "module";
import { defineConfig } from "vite";

export default defineConfig({
  root: __dirname,
  base: "./",
  build: {
    outDir: "../../app/main",
    emptyOutDir: true,
    minify: process.env.NODE_ENV === "production",
    lib: {
      entry: [
        "index.ts",
        "preload.ts"
      ],
      formats: [
        "cjs"
      ],
      fileName: () => "[name].cjs"
    },
    rollupOptions: {
      external: [
        "electron",
        "path",
        ...builtinModules
      ]
    }
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: "modern-compiler"
      }
    }
  }
});
