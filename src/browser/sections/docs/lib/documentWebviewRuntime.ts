import { buildDocumentPageMonitorScript, DOCUMENT_PAGE_MONITOR_EVENT } from "./documentAutomation";

export { DOCUMENT_PAGE_MONITOR_EVENT };

/** 判断当前运行环境是否支持 Electron webview 和 preload bridge。 */
export function canUseDocumentWebview() {
  if (typeof window === "undefined") {
    return false;
  }

  return Boolean(window.chatSundial);
}

/** 等待 webview DOM 初始化完成，避免过早执行脚本。 */
export function waitForWebviewDomReady(webview: WebviewTagElement) {
  if (webview.dataset.domReady === "true") {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      webview.removeEventListener("dom-ready", handleReady);
      reject(new Error("网页预览初始化超时"));
    }, 3000);
    const handleReady = () => {
      window.clearTimeout(timer);
      webview.dataset.domReady = "true";
      webview.removeEventListener("dom-ready", handleReady);
      resolve();
    };

    webview.addEventListener("dom-ready", handleReady);
  });
}

/** 安全读取 webview 当前 URL。 */
export function getWebviewUrl(webview: WebviewTagElement) {
  try {
    return webview.getURL();
  } catch {
    return webview.src || "";
  }
}

/** 安装腾讯文档页内路由/内容监听脚本，重复安装会被跳过。 */
export function installDocumentPageMonitor(webview: WebviewTagElement) {
  if (webview.dataset.pageMonitorInstalled === "true") {
    return Promise.resolve(undefined);
  }

  return webview.executeJavaScript(buildDocumentPageMonitorScript(), false)
    .then(() => {
      webview.dataset.pageMonitorInstalled = "true";
    })
    .catch(() => undefined);
}
