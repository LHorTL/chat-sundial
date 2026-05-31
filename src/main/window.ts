import { app, BrowserWindow, nativeTheme } from "electron";
import path from "path";
import { getWindowIconPath } from "./icon";
import { configureWebviewPolicy } from "./webviewPolicy";

const { VITE_DEV_SERVER_HOST, VITE_DEV_SERVER_PORT } = process.env;

/** 创建主窗口并加载打包产物或本地 Vite 开发服务。 */
export function createMainWindow() {
  const mainWindow = new BrowserWindow({
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
      webviewTag: true,
      preload: path.resolve(__dirname, "./preload.cjs")
    }
  });

  configureWebviewPolicy(mainWindow);

  if (app.isPackaged) {
    mainWindow.loadFile(path.resolve(__dirname, "../browser/index.html"));
  } else {
    mainWindow.loadURL(`http://${VITE_DEV_SERVER_HOST}:${VITE_DEV_SERVER_PORT}/`);
  }

  nativeTheme.themeSource = "light";

  return mainWindow;
}
