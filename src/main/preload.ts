import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("chatSundial", {
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  platform: process.platform,
  onebot: {
    action: (request: { url: string; headers: Record<string, string>; body: string }) =>
      ipcRenderer.invoke("onebot:action", request)
  },
  window: {
    minimize: () => ipcRenderer.send("window:minimize"),
    maximize: () => ipcRenderer.send("window:maximize"),
    close: () => ipcRenderer.send("window:close")
  }
});
