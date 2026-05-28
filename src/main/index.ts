import { app, BrowserWindow, ipcMain } from "electron";
import { configureDockIcon } from "./icon";
import { registerOneBotIpc } from "./onebotIpc";
import { createMainWindow } from "./window";

let mainWindow: BrowserWindow | null = null;

/** 创建并记录主窗口，窗口关闭后清理引用。 */
function openMainWindow() {
  mainWindow = createMainWindow();
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/** 注册应用基础 IPC，包括版本号读取和自定义窗口控制。 */
function registerAppIpc() {
  ipcMain.handle("app:get-version", () => app.getVersion());

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
}

registerAppIpc();
registerOneBotIpc();

app.whenReady().then(() => {
  configureDockIcon();
  openMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      openMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
