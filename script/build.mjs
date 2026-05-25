import { build } from "vite";

await build({ configFile: "src/main/vite.config.ts" });
await build({ configFile: "src/browser/vite.config.ts" });
