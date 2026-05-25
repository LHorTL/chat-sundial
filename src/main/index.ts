import { app, BrowserWindow, ipcMain, nativeTheme } from "electron";
import path from "path";

const { VITE_DEV_SERVER_HOST, VITE_DEV_SERVER_PORT } = process.env;

let mainWindow: BrowserWindow | null = null;

function getWindowIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "icon.ico")
    : path.resolve(process.cwd(), "build/icon.ico");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1450,
    height: 770,
    minWidth: 920,
    minHeight: 620,
    title: "ChatSundial",
    icon: getWindowIconPath(),
    backgroundColor: "#f7efe2",
    frame: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.resolve(__dirname, "./preload.cjs")
    }
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.resolve(__dirname, "../browser/index.html"));
  } else {
    mainWindow.loadURL(`http://${VITE_DEV_SERVER_HOST}:${VITE_DEV_SERVER_PORT}/`);
  }

  nativeTheme.themeSource = "light";
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("app:get-version", () => app.getVersion());

ipcMain.handle(
  "onebot:action",
  async (
    _event,
    request: {
      url: string;
      headers: Record<string, string>;
      body: string;
    }
  ) => {
    try {
      const response = await fetch(request.url, {
        method: "POST",
        headers: request.headers,
        body: request.body
      });
      const text = await response.text();
      let raw: {
        status?: string;
        retcode?: number;
        data?: unknown;
        message?: string;
        wording?: string;
      } | null = null;

      if (text) {
        try {
          raw = JSON.parse(text) as typeof raw;
        } catch {
          return {
            ok: false,
            httpStatus: response.status,
            message: buildNonJsonOneBotMessage(text),
            rawText: text
          };
        }
      }

      return {
        ok: response.ok && (raw?.status == null || raw.status === "ok"),
        httpStatus: response.status,
        status: raw?.status,
        retcode: raw?.retcode,
        data: raw?.data,
        message: raw?.message,
        wording: raw?.wording,
        raw
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }
);

function buildNonJsonOneBotMessage(text: string) {
  const normalized = text.trim();
  if (/upgrade required/i.test(normalized)) {
    return "当前端口返回了 WebSocket 升级提示，不是 OneBot HTTP API 端口。请填写 HTTP 服务端口，或在 OneBot/NapCat 中开启 HTTP API。";
  }

  return normalized ? `OneBot 返回了非 JSON 响应：${normalized.slice(0, 120)}` : "OneBot 返回了空响应";
}

ipcMain.on("window:minimize", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.on("window:maximize", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    return;
  }

  if (window.isMaximized()) {
    window.unmaximize();
    return;
  }

  window.maximize();
});

ipcMain.on("window:close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});
