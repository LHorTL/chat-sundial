export const DOCUMENT_PENDING_LOAD_TIMEOUT_MS = 8000;

/** 标准化腾讯文档地址，只允许 https://docs.qq.com/。 */
export function normalizeTencentDocsUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "https:" || url.hostname !== "docs.qq.com") {
      return "";
    }

    return url.toString();
  } catch {
    return "";
  }
}

/** 判断当前 webview 是否需要加载用户配置的新文档。 */
export function shouldLoadConfiguredDocument(currentUrl: string, configuredUrl: string) {
  const normalizedConfiguredUrl = normalizeTencentDocsUrl(configuredUrl);
  if (!normalizedConfiguredUrl) {
    return true;
  }

  try {
    const current = new URL(currentUrl);
    const configured = new URL(normalizedConfiguredUrl);
    return current.protocol !== configured.protocol ||
      current.hostname !== configured.hostname ||
      current.pathname !== configured.pathname;
  } catch {
    return true;
  }
}

/** 判断是否应该发起文档加载，避免同一目标 URL 在加载中被重复 loadURL。 */
export function shouldRequestConfiguredDocumentLoad(currentUrl: string, configuredUrl: string, pendingUrl: string) {
  const normalizedConfiguredUrl = normalizeTencentDocsUrl(configuredUrl);
  if (!normalizedConfiguredUrl) {
    return false;
  }

  if (
    normalizeTencentDocsUrl(pendingUrl) === normalizedConfiguredUrl &&
    shouldLoadConfiguredDocument(currentUrl, normalizedConfiguredUrl)
  ) {
    return false;
  }

  return shouldLoadConfiguredDocument(currentUrl, normalizedConfiguredUrl);
}

/** 判断地址是否是腾讯文档运行页。 */
export function isTencentDocsRuntimeUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "docs.qq.com";
  } catch {
    return false;
  }
}

/** 判断 webview 加载错误是否只是导航中断。 */
export function isNavigationAbort(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("ERR_ABORTED") || message.includes("(-3)");
}

/** 判断一次自动加载请求是否已经超过保护窗口，可以清理 pending 并允许重试。 */
export function isPendingDocumentLoadExpired(pendingStartedAt: number, nowMs = Date.now()) {
  return pendingStartedAt > 0 && nowMs - pendingStartedAt >= DOCUMENT_PENDING_LOAD_TIMEOUT_MS;
}
