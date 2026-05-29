import { useCallback } from "react";
import {
  buildDocumentRunRequest,
  buildDocumentRunScript,
  buildDocumentScanScript,
  buildDocumentUpdateScript,
  type DocumentRunResult,
  validateDocumentRunStartTime
} from "../../lib/runtime/automation";
import type { DocumentSubmitTask } from "../../lib/task/registration";
import { createRuleFromQuestion, normalizeDocumentScriptResult, shouldLoadConfiguredDocument } from "../../lib/task/viewModel";
import { getWebviewUrl } from "../../lib/preview/webviewRuntime";

interface UseDocumentTaskRunnerOptions {
  canUseElectronView: boolean;
  updateTaskState: (id: string, updater: (task: DocumentSubmitTask) => DocumentSubmitTask) => void;
  patchTask: (id: string, patch: Partial<DocumentSubmitTask>) => void;
  appendLog: (id: string, nextMessage: string) => void;
  saveTaskSnapshot: (task: DocumentSubmitTask) => DocumentSubmitTask;
  removeTask: (id: string) => Promise<void>;
  deleteWebviewRef: (taskId: string) => void;
  getTaskWebview: (taskId: string) => WebviewTagElement;
  waitForTaskWebview: (taskId: string) => Promise<WebviewTagElement>;
  loadWebviewUrl: (taskId: string, url: string) => Promise<{ ok: boolean; message?: string }>;
  markDocumentPageState: (taskId: string, fallbackUrl?: string, retry?: boolean) => Promise<{ ok: boolean; message: string }>;
}

/** 管理文档任务的加载、启动、停止、更新和扫描动作，集中处理 webview 脚本副作用。 */
export function useDocumentTaskRunner({
  canUseElectronView,
  updateTaskState,
  patchTask,
  appendLog,
  saveTaskSnapshot,
  removeTask,
  deleteWebviewRef,
  getTaskWebview,
  waitForTaskWebview,
  loadWebviewUrl,
  markDocumentPageState
}: UseDocumentTaskRunnerOptions) {
  /** 把页面脚本执行结果写回任务状态，并保留最近的运行日志。 */
  const applyScriptResult = useCallback((id: string, result: DocumentRunResult) => {
    updateTaskState(id, (task) => {
      const logs = result.logs?.length ? [...task.logs, ...result.logs].slice(-80) : task.logs;
      if (task.status === "stopped") {
        return {
          ...task,
          logs,
          updatedAt: Date.now()
        };
      }

      return {
        ...task,
        status: result.ok ? "success" : "error",
        message: result.message,
        logs,
        fillRules: result.questions ? result.questions.map(createRuleFromQuestion) : task.fillRules,
        updatedAt: Date.now()
      };
    });
  }, [updateTaskState]);

  /** 启动任务前确认当前页面是腾讯收集表填写页。 */
  const ensureDocumentFillPage = useCallback(async (taskId: string) => {
    const result = await markDocumentPageState(taskId);
    if (!result.ok) {
      patchTask(taskId, { status: "error", message: result.message });
      return false;
    }

    return true;
  }, [markDocumentPageState, patchTask]);

  /** 根据任务配置生成注入脚本需要的运行请求。 */
  const buildTaskRunRequest = useCallback((task: DocumentSubmitTask) => buildDocumentRunRequest({
    mode: task.mode,
    date: task.date,
    time: task.time,
    offsetMs: task.offsetMs,
    pollingIntervalMs: Math.max(20, task.pollingIntervalMs),
    confirmAfterSubmit: task.mode === "scheduled-confirm" ? true : task.confirmAfterSubmit,
    fillRules: task.fillRules
  }), []);

  /** 删除任务时同步释放该任务的 webview 引用。 */
  const removeDocumentTask = useCallback(async (id: string) => {
    deleteWebviewRef(id);
    await removeTask(id);
  }, [deleteWebviewRef, removeTask]);

  /** 加载任务配置的文档网页，并在加载后立即检测页面状态。 */
  const loadDocument = useCallback(async (task: DocumentSubmitTask) => {
    if (!canUseElectronView) {
      patchTask(task.id, { status: "error", message: "请在 Electron 应用中加载腾讯文档" });
      return;
    }

    if (!task.url.trim()) {
      patchTask(task.id, { status: "error", message: "请先填写腾讯文档地址" });
      return;
    }

    patchTask(task.id, { status: "loading", message: "网页加载中" });
    const result = await loadWebviewUrl(task.id, task.url);
    if (!result.ok) {
      patchTask(task.id, { status: "error", message: result.message || "网页加载失败" });
      return;
    }

    await markDocumentPageState(task.id, task.url);
  }, [canUseElectronView, loadWebviewUrl, markDocumentPageState, patchTask]);

  /** 刷新任务对应的 webview 页面。 */
  const reloadDocument = useCallback(async (task: DocumentSubmitTask) => {
    getTaskWebview(task.id).reload();
    patchTask(task.id, { status: "loading", message: "网页重新加载中" });
  }, [getTaskWebview, patchTask]);

  /** 停止运行中的自动提交脚本，并将任务标记为已停止。 */
  const stopTask = useCallback(async (task: DocumentSubmitTask) => {
    const webview = getTaskWebview(task.id);
    webview.stop();
    await webview.executeJavaScript(
      "window.__chatSundialAutoSubmit && (window.__chatSundialAutoSubmit.stopped = true)",
      false
    ).catch(() => undefined);
    patchTask(task.id, { status: "stopped", message: "任务已停止" });
    appendLog(task.id, "任务已停止");
  }, [appendLog, getTaskWebview, patchTask]);

  /** 启动自动提交任务，必要时先加载配置文档并检测表单页。 */
  const startTask = useCallback(async (task: DocumentSubmitTask) => {
    if (!canUseElectronView) {
      patchTask(task.id, { status: "error", message: "请在 Electron 应用中运行任务" });
      return;
    }

    if (task.status === "running") {
      patchTask(task.id, { status: "running", message: "任务已经在运行中" });
      return;
    }

    try {
      if (!task.url.trim()) {
        patchTask(task.id, { status: "error", message: "请先填写腾讯文档地址" });
        return;
      }

      saveTaskSnapshot(task);
      const request = buildTaskRunRequest(task);
      validateDocumentRunStartTime(request);

      const webview = await waitForTaskWebview(task.id);
      const currentUrl = getWebviewUrl(webview);
      if (shouldLoadConfiguredDocument(currentUrl, task.url)) {
        patchTask(task.id, { status: "loading", message: "网页加载中" });
        const loadResult = await loadWebviewUrl(task.id, task.url);
        if (!loadResult.ok) {
          patchTask(task.id, { status: "error", message: loadResult.message || "网页加载失败" });
          return;
        }
      }

      if (!await ensureDocumentFillPage(task.id)) {
        return;
      }

      patchTask(task.id, { status: "running", message: "任务运行中" });
      appendLog(task.id, "任务开始");
      const result = await webview.executeJavaScript(buildDocumentRunScript(request), true);
      applyScriptResult(task.id, normalizeDocumentScriptResult(result));
    } catch (error) {
      patchTask(task.id, { status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }, [
    appendLog,
    applyScriptResult,
    buildTaskRunRequest,
    canUseElectronView,
    ensureDocumentFillPage,
    loadWebviewUrl,
    patchTask,
    saveTaskSnapshot,
    waitForTaskWebview
  ]);

  /** 将最新任务配置推送给正在运行的页面脚本。 */
  const updateRunningTask = useCallback(async (task: DocumentSubmitTask) => {
    if (!canUseElectronView) {
      patchTask(task.id, { status: "error", message: "请在 Electron 应用中更新运行配置" });
      return;
    }

    if (task.status !== "running") {
      patchTask(task.id, { message: "任务未运行，无需更新" });
      return;
    }

    try {
      const request = buildTaskRunRequest(task);
      validateDocumentRunStartTime(request);
      const result = await getTaskWebview(task.id).executeJavaScript(buildDocumentUpdateScript(request), true);
      const normalized = normalizeDocumentScriptResult(result);
      updateTaskState(task.id, (current) => ({
        ...current,
        status: normalized.ok ? "running" : "error",
        message: normalized.message,
        logs: normalized.logs?.length ? [...current.logs, ...normalized.logs].slice(-80) : current.logs,
        updatedAt: Date.now()
      }));
    } catch (error) {
      patchTask(task.id, { status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }, [buildTaskRunRequest, canUseElectronView, getTaskWebview, patchTask, updateTaskState]);

  /** 扫描当前表单页题目并生成默认填充规则。 */
  const scanQuestions = useCallback(async (task: DocumentSubmitTask) => {
    if (!canUseElectronView) {
      patchTask(task.id, { status: "error", message: "请在 Electron 应用中扫描题目" });
      return;
    }

    patchTask(task.id, { status: "running", message: "正在扫描题目" });
    try {
      if (!await ensureDocumentFillPage(task.id)) {
        return;
      }

      const result = await getTaskWebview(task.id).executeJavaScript(buildDocumentScanScript(), true);
      applyScriptResult(task.id, normalizeDocumentScriptResult(result));
    } catch (error) {
      patchTask(task.id, { status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }, [applyScriptResult, canUseElectronView, ensureDocumentFillPage, getTaskWebview, patchTask]);

  return {
    loadDocument,
    reloadDocument,
    stopTask,
    startTask,
    updateRunningTask,
    scanQuestions,
    removeDocumentTask
  };
}
