import { app, BrowserWindow, ipcMain, nativeTheme } from "electron";
import path from "path";

const { VITE_DEV_SERVER_HOST, VITE_DEV_SERVER_PORT } = process.env;

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 920,
    minHeight: 620,
    title: "ChatSundial",
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
      const raw = text ? JSON.parse(text) : null;

      return {
        ok: response.ok && (raw?.status == null || raw.status === "ok"),
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
