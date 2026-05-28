import { app } from "electron";
import path from "path";

/** 根据当前平台和打包状态返回窗口图标路径。 */
export function getWindowIconPath() {
  if (process.platform === "darwin") {
    return app.isPackaged
      ? path.join(process.resourcesPath, "icon.png")
      : path.resolve(process.cwd(), "build/icon.png");
  }

  return app.isPackaged
    ? path.join(process.resourcesPath, "icon.ico")
    : path.resolve(process.cwd(), "build/icon.ico");
}

/** 在 macOS Dock 上设置应用图标，非 macOS 环境保持空操作。 */
export function configureDockIcon() {
  if (process.platform !== "darwin") {
    return;
  }

  app.dock?.setIcon(getWindowIconPath());
}
