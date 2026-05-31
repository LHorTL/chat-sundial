import { BrowserWindow, shell } from "electron";

/** 为主窗口安装 webview 安全策略和外链处理规则。 */
export function configureWebviewPolicy(window: BrowserWindow) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url);
    }

    return { action: "deny" };
  });

  window.webContents.on("will-attach-webview", (_event, webPreferences) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.backgroundThrottling = false;
  });

  window.webContents.on("did-attach-webview", (_event, webContents) => {
    webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) {
        webContents.loadURL(url).catch(() => shell.openExternal(url));
      }

      return { action: "deny" };
    });
  });
}
