import { useCallback, useEffect, useRef } from "react";
import { buildDocumentPageCheckScript, type DocumentPageCheckResult } from "../lib/documentAutomation";
import type { DocumentSubmitTask } from "../lib/documentTaskRegistration";
import {
  getWebviewUrl,
  installDocumentPageMonitor,
  waitForWebviewDomReady
} from "../lib/documentWebviewRuntime";
import {
  isNavigationAbort,
  isRealtimePageMonitorStatus,
  isTencentDocsRuntimeUrl,
  buildDocumentPageStatePatch,
  normalizeDocumentPageCheckResult,
  normalizeTencentDocsUrl,
  shouldRetryDocumentPageCheck
} from "../lib/documentViewModel";

interface UseDocumentWebviewsOptions {
  canUseElectronView: boolean;
  webviewTasks: DocumentSubmitTask[];
  patchDocumentPageState: (id: string, patch: Partial<DocumentSubmitTask>) => void;
}

/** 管理文档任务 webview 实例、网页加载、页面检测和实时路由监听。 */
export function useDocumentWebviews({
  canUseElectronView,
  webviewTasks,
  patchDocumentPageState
}: UseDocumentWebviewsOptions) {
  const webviewRefs = useRef(new Map<string, WebviewTagElement>());
  const pageMonitorInFlightRef = useRef(new Set<string>());

  /** 维护任务 id 到 webview 实例的映射，供脚本执行和页面检测使用。 */
  const setWebviewRef = useCallback((taskId: string, webview: WebviewTagElement | null) => {
    if (webview) {
      webviewRefs.current.set(taskId, webview);
      return;
    }

    webviewRefs.current.delete(taskId);
  }, []);

  /** 删除指定任务的 webview 引用，通常在任务删除时调用。 */
  const deleteWebviewRef = useCallback((taskId: string) => {
    webviewRefs.current.delete(taskId);
  }, []);

  /** 读取指定任务的 webview，不存在时抛出可展示给用户的错误。 */
  const getTaskWebview = useCallback((taskId: string) => {
    const webview = webviewRefs.current.get(taskId);
    if (!webview) {
      throw new Error("网页预览尚未就绪");
    }

    return webview;
  }, []);

  /** 等待指定任务的 webview 挂载并完成 dom-ready，避免刚保存任务就启动时取不到实例。 */
  const waitForTaskWebview = useCallback(async (taskId: string) => {
    const immediate = webviewRefs.current.get(taskId);
    if (immediate) {
      await waitForWebviewDomReady(immediate);
      return immediate;
    }

    for (let index = 0; index < 40; index += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 25));
      const webview = webviewRefs.current.get(taskId);
      if (webview) {
        await waitForWebviewDomReady(webview);
        return webview;
      }
    }

    throw new Error("网页预览尚未就绪");
  }, []);

  /** 加载任务配置的腾讯文档地址，并把 Electron 导航事件统一转换为成功/失败结果。 */
  const loadWebviewUrl = useCallback(async (taskId: string, url: string) => {
    const normalizedUrl = normalizeTencentDocsUrl(url);
    if (!normalizedUrl) {
      return { ok: false, message: "只支持加载 https://docs.qq.com/ 开头的腾讯文档地址" };
    }

    const webview = await waitForTaskWebview(taskId);
    return new Promise<{ ok: boolean; message?: string }>((resolve) => {
      let settled = false;
      let timer = 0;
      const settle = (result: { ok: boolean; message?: string }) => {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timer);
        webview.removeEventListener("did-stop-loading", handleReady);
        webview.removeEventListener("did-finish-load", handleReady);
        webview.removeEventListener("did-fail-load", handleFail);
        resolve(result);
      };
      const handleReady = () => settle({ ok: true });
      const handleFail = (event: Event) => {
        const detail = event as WebviewEvent;
        if (detail.errorCode === -3) {
          return;
        }

        settle({ ok: false, message: detail.errorDescription || "网页加载失败" });
      };

      webview.addEventListener("did-stop-loading", handleReady);
      webview.addEventListener("did-finish-load", handleReady);
      webview.addEventListener("did-fail-load", handleFail);
      timer = window.setTimeout(() => settle({ ok: true }), 30_000);

      try {
        const loading = webview.loadURL(normalizedUrl);
        if (loading && typeof loading.then === "function") {
          loading.then(() => settle({ ok: true })).catch((error) => {
            if (isNavigationAbort(error)) {
              return;
            }

            settle({ ok: false, message: error instanceof Error ? error.message : String(error) });
          });
        }
      } catch (error) {
        settle({ ok: false, message: error instanceof Error ? error.message : String(error) });
      }
    });
  }, [waitForTaskWebview]);

  /** 在 webview 内执行页面类型检测脚本，判断当前是否位于可填写表单页。 */
  const checkDocumentPage = useCallback(async (taskId: string) => {
    const result = await getTaskWebview(taskId).executeJavaScript(buildDocumentPageCheckScript(), true);
    return normalizeDocumentPageCheckResult(result);
  }, [getTaskWebview]);

  /** 对正在渲染的腾讯文档页面做短重试，降低刚切换标签时的误判。 */
  const checkDocumentPageWithRetry = useCallback(async (taskId: string) => {
    let lastResult = await checkDocumentPage(taskId);
    for (let index = 0; index < 20 && shouldRetryDocumentPageCheck(lastResult); index += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 300));
      lastResult = await checkDocumentPage(taskId);
    }

    return lastResult;
  }, [checkDocumentPage]);

  /** 把页面检测结果同步到任务状态，同时安装页内路由监听脚本。 */
  const markDocumentPageState = useCallback(async (taskId: string, fallbackUrl = "", retry = true) => {
    try {
      const webview = webviewRefs.current.get(taskId);
      if (webview) {
        void installDocumentPageMonitor(webview);
      }
      const result = retry ? await checkDocumentPageWithRetry(taskId) : await checkDocumentPage(taskId);
      patchDocumentPageState(taskId, buildDocumentPageStatePatch(result));
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      patchDocumentPageState(taskId, { status: "error", message });
      return {
        ok: false,
        message,
        pageKind: "loading",
        url: fallbackUrl,
        questionCount: 0,
        hasSubmitButton: false
      } satisfies DocumentPageCheckResult;
    }
  }, [checkDocumentPage, checkDocumentPageWithRetry, patchDocumentPageState]);

  useEffect(() => {
    if (!canUseElectronView) {
      return;
    }

    const timer = window.setInterval(() => {
      webviewTasks.forEach((task) => {
        if (!isRealtimePageMonitorStatus(task) || pageMonitorInFlightRef.current.has(task.id)) {
          return;
        }

        const webview = webviewRefs.current.get(task.id);
        if (!webview) {
          return;
        }

        const currentUrl = getWebviewUrl(webview);
        if (!isTencentDocsRuntimeUrl(currentUrl)) {
          return;
        }

        pageMonitorInFlightRef.current.add(task.id);
        void markDocumentPageState(task.id, currentUrl, false).finally(() => {
          pageMonitorInFlightRef.current.delete(task.id);
        });
      });
    }, 6000);

    return () => window.clearInterval(timer);
  }, [canUseElectronView, markDocumentPageState, webviewTasks]);

  return {
    setWebviewRef,
    deleteWebviewRef,
    getTaskWebview,
    waitForTaskWebview,
    loadWebviewUrl,
    markDocumentPageState
  };
}
