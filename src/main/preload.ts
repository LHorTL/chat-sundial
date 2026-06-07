import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("chatSundial", {
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  platform: process.platform,
  onebot: {
    action: (request: { url: string; headers: Record<string, string>; body: string }) =>
      ipcRenderer.invoke("onebot:action", request)
  },
  snowluma: {
    status: () => ipcRenderer.invoke("snowluma:status"),
    logs: () => ipcRenderer.invoke("snowluma:logs"),
    installLatest: () => ipcRenderer.invoke("snowluma:install-latest"),
    installBundled: () => ipcRenderer.invoke("snowluma:install-bundled"),
    uninstall: () => ipcRenderer.invoke("snowluma:uninstall"),
    start: (mode?: "hot" | "cold") => ipcRenderer.invoke("snowluma:start", mode),
    stop: () => ipcRenderer.invoke("snowluma:stop"),
    restart: () => ipcRenderer.invoke("snowluma:restart"),
    listAccounts: () => ipcRenderer.invoke("snowluma:list-accounts"),
    selectAccount: (uin: string) => ipcRenderer.invoke("snowluma:select-account", uin),
    openInstallFolder: () => ipcRenderer.invoke("snowluma:open-install-folder"),
    openDownloadUrl: () => ipcRenderer.invoke("snowluma:open-download-url"),
    openQqDownloadUrl: () => ipcRenderer.invoke("snowluma:open-qq-download-url"),
    openWebUi: () => ipcRenderer.invoke("snowluma:open-webui")
  },
  window: {
    minimize: () => ipcRenderer.send("window:minimize"),
    maximize: () => ipcRenderer.send("window:maximize"),
    close: () => ipcRenderer.send("window:close")
  }
});
