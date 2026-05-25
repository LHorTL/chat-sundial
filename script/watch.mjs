import { createServer, build } from "vite";
import { spawn } from "child_process";
import electron from "electron";

let electronChild = null;

function stopElectron() {
  if (!electronChild) {
    return;
  }

  electronChild.removeAllListeners();
  electronChild.kill();
  electronChild = null;
}

async function mainWatch(server) {
  const address = server.httpServer.address();
  const host = address.family === "IPv6" ? "localhost" : address.address;
  const env = {
    ...process.env,
    VITE_DEV_SERVER_HOST: host,
    VITE_DEV_SERVER_PORT: String(address.port),
  };

  return build({
    configFile: "src/main/vite.config.ts",
    mode: "development",
    plugins: [
      {
        name: "restart-electron",
        writeBundle: () => {
          stopElectron();
          electronChild = spawn(electron, ["."], {
            detached: false,
            env,
            stdio: "inherit",
          });
        },
      },
    ],
    build: {
      watch: {},
    },
  });
}

const server = await createServer({
  configFile: "src/browser/vite.config.ts",
});

await server.listen();
server.printUrls();
await mainWatch(server);

process.on("SIGINT", () => {
  stopElectron();
  process.exit(0);
});
