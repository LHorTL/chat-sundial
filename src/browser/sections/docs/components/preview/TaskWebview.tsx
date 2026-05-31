import { useCallback, useEffect, useRef, useState } from "react";
import type { DocumentSubmitTask } from "../../lib/task/registration";
import { DOCUMENT_PAGE_MONITOR_EVENT, getWebviewUrl, installDocumentPageMonitor } from "../../lib/preview/webviewRuntime";
import {
  DOCUMENT_PENDING_LOAD_TIMEOUT_MS,
  isNavigationAbort,
  isPendingDocumentLoadExpired,
  normalizeTencentDocsUrl,
  shouldRequestConfiguredDocumentLoad
} from "../../lib/task/viewModel";

const DOCUMENT_WEBVIEW_PARTITION = "persist:chat-sundial-docs";
const DOCUMENT_WEBVIEW_PREFERENCES = "contextIsolation=yes,nodeIntegration=no,sandbox=yes,backgroundThrottling=no";

interface DocumentTaskWebviewProps {
  task: DocumentSubmitTask;
  active: boolean;
  onReady: (webview: WebviewTagElement) => void;
  onDispose: () => void;
  onLoading: () => void;
  onReadyState: (url: string) => void;
  onPageChanged: (url: string) => void;
  onError: (message: string) => void;
  onTitle: (title: string) => void;
}

/** 渲染单个隐藏/显示切换的腾讯文档 webview，并转发加载与页内路由事件。 */
export function DocumentTaskWebview({
  task,
  active,
  onReady,
  onDispose,
  onLoading,
  onReadyState,
  onPageChanged,
  onError,
  onTitle
}: DocumentTaskWebviewProps) {
  const ref = useRef<WebviewTagElement | null>(null);
  const pendingLoadUrlRef = useRef("");
  const pendingLoadStartedAtRef = useRef(0);
  const pendingResetTimerRef = useRef(0);
  const [loadRetryNonce, setLoadRetryNonce] = useState(0);

  /** 清理自动加载 pending 标记，避免旧导航状态阻塞后续同地址加载。 */
  const clearPendingLoad = useCallback(() => {
    pendingLoadUrlRef.current = "";
    pendingLoadStartedAtRef.current = 0;
    if (pendingResetTimerRef.current) {
      window.clearTimeout(pendingResetTimerRef.current);
      pendingResetTimerRef.current = 0;
    }
  }, []);

  /** 为自动加载 pending 设置兜底重试，处理 ERR_ABORTED 后没有 ready 事件的情况。 */
  const schedulePendingLoadRetry = useCallback((targetUrl: string) => {
    if (pendingResetTimerRef.current) {
      window.clearTimeout(pendingResetTimerRef.current);
    }

    pendingResetTimerRef.current = window.setTimeout(() => {
      if (pendingLoadUrlRef.current !== targetUrl) {
        return;
      }

      if (!isPendingDocumentLoadExpired(pendingLoadStartedAtRef.current)) {
        return;
      }

      pendingLoadUrlRef.current = "";
      pendingLoadStartedAtRef.current = 0;
      pendingResetTimerRef.current = 0;
      setLoadRetryNonce((current) => current + 1);
    }, DOCUMENT_PENDING_LOAD_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    const webview = ref.current;
    if (!webview) {
      return;
    }

    const handleStartLoading = () => {
      delete webview.dataset.pageMonitorInstalled;
      const url = getWebviewUrl(webview);
      if (!url || url === "about:blank") {
        return;
      }

      onLoading();
    };
    const handleReady = () => {
      const url = getWebviewUrl(webview);
      if (!url || url === "about:blank") {
        return;
      }

      clearPendingLoad();
      void installDocumentPageMonitor(webview);
      onReadyState(url);
    };
    const handleFail = (event: Event) => {
      const detail = event as WebviewEvent;
      if (detail.errorCode === -3) {
        return;
      }

      clearPendingLoad();
      onError(detail.errorDescription || "网页加载失败");
    };
    const handleTitle = (event: Event) => {
      const detail = event as WebviewEvent;
      if (detail.title) {
        onTitle(detail.title);
      }
    };
    const handleConsoleMessage = (event: Event) => {
      const detail = event as WebviewEvent;
      if (!detail.message?.includes(DOCUMENT_PAGE_MONITOR_EVENT)) {
        return;
      }

      const url = getWebviewUrl(webview);
      if (!url || url === "about:blank") {
        return;
      }

      onPageChanged(url);
    };

    onReady(webview);
    webview.addEventListener("did-start-loading", handleStartLoading);
    const handleDomReady = () => {
      webview.dataset.domReady = "true";
      handleReady();
    };

    webview.addEventListener("did-stop-loading", handleReady);
    webview.addEventListener("did-finish-load", handleReady);
    webview.addEventListener("dom-ready", handleDomReady);
    webview.addEventListener("did-fail-load", handleFail);
    webview.addEventListener("page-title-updated", handleTitle);
    webview.addEventListener("console-message", handleConsoleMessage);

    return () => {
      webview.removeEventListener("did-start-loading", handleStartLoading);
      webview.removeEventListener("did-stop-loading", handleReady);
      webview.removeEventListener("did-finish-load", handleReady);
      webview.removeEventListener("dom-ready", handleDomReady);
      webview.removeEventListener("did-fail-load", handleFail);
      webview.removeEventListener("page-title-updated", handleTitle);
      webview.removeEventListener("console-message", handleConsoleMessage);
      onDispose();
    };
  }, [clearPendingLoad, onDispose, onError, onLoading, onPageChanged, onReady, onReadyState, onTitle]);

  useEffect(() => clearPendingLoad, [clearPendingLoad]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const webview = ref.current;
    const targetUrl = normalizeTencentDocsUrl(task.url);
    if (!webview || !targetUrl || task.status === "running") {
      return;
    }

    const timer = window.setTimeout(() => {
      const currentUrl = getWebviewUrl(webview);
      if (!shouldRequestConfiguredDocumentLoad(currentUrl, targetUrl, pendingLoadUrlRef.current)) {
        return;
      }

      pendingLoadUrlRef.current = targetUrl;
      pendingLoadStartedAtRef.current = Date.now();
      schedulePendingLoadRetry(targetUrl);
      if (task.status !== "loading") {
        onLoading();
      }
      const loading = webview.loadURL(targetUrl);
      if (loading && typeof loading.then === "function") {
        loading.catch((error) => {
          if (!isNavigationAbort(error)) {
            clearPendingLoad();
            onError(error instanceof Error ? error.message : String(error));
          }
        });
      }
    }, 100);

    return () => window.clearTimeout(timer);
  }, [active, clearPendingLoad, loadRetryNonce, onError, onLoading, schedulePendingLoadRetry, task.status, task.url]);

  return (
    <webview
      ref={ref}
      className={`document-webview ${active ? "active" : ""}`}
      src="about:blank"
      partition={DOCUMENT_WEBVIEW_PARTITION}
      webpreferences={DOCUMENT_WEBVIEW_PREFERENCES}
      data-task-id={task.id}
    />
  );
}
