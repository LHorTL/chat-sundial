import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Input,
  InputNumber,
  Radio,
  Select,
  Tag,
  TimePicker,
  Typography,
  type TagTone
} from "@fangxinyan/lumina";
import {
  buildDocumentPageCheckScript,
  buildDocumentPageMonitorScript,
  buildDocumentRequiredCheckScript,
  buildDocumentRunRequest,
  buildDocumentRunScript,
  buildDocumentScanScript,
  buildDocumentUpdateScript,
  DOCUMENT_PAGE_MONITOR_EVENT,
  normalizeDocumentFillRules,
  type DocumentFillRuleDraft,
  type DocumentQuestionType,
  type DocumentRunLog,
  type DocumentPageCheckResult,
  type DocumentSubmitMode,
  type DocumentRunResult,
  type ScannedDocumentQuestion,
  validateDocumentRunStartTime
} from "../lib/documentAutomation";
import {
  buildDocumentTaskRegistration,
  createDefaultDocumentTask,
  createDefaultFillRule,
  createDocumentTaskId,
  loadDocumentTasks,
  saveDocumentTasks,
  type DocumentSubmitTask,
  type DocumentViewStatus
} from "../lib/documentTaskRegistration";
import type { GlobalTaskRegistration } from "../../../components/TaskCenter";

const modeOptions = [
  { value: "scheduled-confirm", label: "到点确认提交" },
  { value: "await-fill-submit", label: "开放后填充提交" }
] satisfies Array<{ value: DocumentSubmitMode; label: string }>;

const questionTypeOptions = [
  { value: "textArea", label: "文本框" },
  { value: "radio", label: "单选" },
  { value: "checkBox", label: "多选" }
] satisfies Array<{ value: DocumentQuestionType; label: string }>;

interface DocumentSubmitPageProps {
  createRequest?: number;
  selectedTaskId?: string;
  actionRequest?: DocumentTaskActionRequest | null;
  onActiveTaskChange?: (taskId: string) => void;
  onSidebarTasksChange?: (tasks: DocumentSidebarTask[]) => void;
  onTaskSnapshotChange?: (tasks: GlobalTaskRegistration[]) => void;
}

export type DocumentTaskAction = "start" | "update" | "reload" | "reset" | "duplicate" | "openDevTools" | "stop" | "remove";

export interface DocumentTaskActionRequest {
  taskId: string;
  action: DocumentTaskAction;
  nonce: number;
}

interface DocumentSidebarTask {
  id: string;
  name: string;
  status: DocumentViewStatus;
  statusLabel: string;
}

const DOCUMENT_WEBVIEW_PARTITION = "persist:chat-sundial-docs";
const DOCUMENT_WEBVIEW_PREFERENCES = "contextIsolation=yes,nodeIntegration=no,sandbox=yes,backgroundThrottling=no";

export function DocumentSubmitPage({
  createRequest = 0,
  selectedTaskId,
  actionRequest,
  onActiveTaskChange,
  onSidebarTasksChange,
  onTaskSnapshotChange
}: DocumentSubmitPageProps = {}) {
  const initialTasks = useMemo(() => loadDocumentTasks(), []);
  const [tasks, setTasks] = useState<DocumentSubmitTask[]>(initialTasks);
  const [activeTaskId, setActiveTaskId] = useState(() => initialTasks[0]?.id ?? "");
  const [draftTask, setDraftTask] = useState<DocumentSubmitTask>(() => createDefaultDocumentTask(initialTasks.length + 1));
  const createRequestRef = useRef(createRequest);
  const actionRequestRef = useRef(0);
  const webviewRefs = useRef(new Map<string, WebviewTagElement>());
  const pageMonitorInFlightRef = useRef(new Set<string>());
  const activeTask = useMemo(
    () => activeTaskId ? tasks.find((task) => task.id === activeTaskId) ?? tasks[0] : draftTask,
    [activeTaskId, draftTask, tasks]
  );
  const canUseElectronView = canUseDocumentWebview();
  const isScheduledMode = activeTask?.mode === "scheduled-confirm";
  const isActiveTaskSaved = Boolean(activeTask && tasks.some((task) => task.id === activeTask.id));
  const isTaskRunning = isDocumentUrlLocked(activeTask?.status);
  const webviewTasks = useMemo(
    () => activeTask ? [activeTask, ...tasks.filter((task) => task.id !== activeTask.id)] : tasks,
    [activeTask, tasks]
  );

  useEffect(() => {
    saveDocumentTasks(tasks);
    onSidebarTasksChange?.(tasks.map(toDocumentSidebarTask));
    onTaskSnapshotChange?.(tasks.map(buildDocumentTaskRegistration));
  }, [onSidebarTasksChange, onTaskSnapshotChange, tasks]);

  useEffect(() => {
    if (selectedTaskId && selectedTaskId !== activeTaskId && tasks.some((task) => task.id === selectedTaskId)) {
      setActiveTaskId(selectedTaskId);
    }
  }, [activeTaskId, selectedTaskId, tasks]);

  useEffect(() => {
    onActiveTaskChange?.(activeTaskId);
  }, [activeTaskId, onActiveTaskChange]);

  const updateTaskState = useCallback((id: string, updater: (task: DocumentSubmitTask) => DocumentSubmitTask) => {
    setTasks((current) => {
      let matched = false;
      const next = current.map((task) => {
        if (task.id !== id) {
          return task;
        }

        matched = true;
        return updater(task);
      });

      return matched ? next : current;
    });

    setDraftTask((current) => current.id === id ? updater(current) : current);
  }, []);

  const patchTask = useCallback((id: string, patch: Partial<DocumentSubmitTask>) => {
    updateTaskState(id, (task) => ({
      ...task,
      ...patch,
      updatedAt: Date.now()
    }));
  }, [updateTaskState]);

  const appendLog = useCallback((id: string, nextMessage: string) => {
    const log = {
      time: new Date().toISOString(),
      message: nextMessage
    };
    updateTaskState(id, (task) => ({
      ...task,
      logs: [...task.logs, log].slice(-80),
      updatedAt: Date.now()
    }));
  }, [updateTaskState]);

  const patchPassiveWebviewState = useCallback((id: string, patch: Partial<DocumentSubmitTask>) => {
    updateTaskState(id, (task) => {
      if (isPassiveWebviewStatusLocked(task.status)) {
        return patch.url ? { ...task, url: patch.url, updatedAt: Date.now() } : task;
      }

      return {
        ...task,
        ...patch,
        updatedAt: Date.now()
      };
    });
  }, [updateTaskState]);

  const patchDocumentPageState = useCallback((id: string, patch: Partial<DocumentSubmitTask>) => {
    updateTaskState(id, (task) => {
      if (isPageDetectionStatusLocked(task)) {
        return patch.url ? { ...task, url: patch.url, updatedAt: Date.now() } : task;
      }

      return {
        ...task,
        ...patch,
        updatedAt: Date.now()
      };
    });
  }, [updateTaskState]);

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

  const setWebviewRef = useCallback((taskId: string, webview: WebviewTagElement | null) => {
    if (webview) {
      webviewRefs.current.set(taskId, webview);
      return;
    }

    webviewRefs.current.delete(taskId);
  }, []);

  const getTaskWebview = useCallback((taskId: string) => {
    const webview = webviewRefs.current.get(taskId);
    if (!webview) {
      throw new Error("网页预览尚未就绪");
    }

    return webview;
  }, []);

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

  const checkDocumentPage = useCallback(async (taskId: string) => {
    const result = await getTaskWebview(taskId).executeJavaScript(buildDocumentPageCheckScript(), true);
    return normalizeDocumentPageCheckResult(result);
  }, [getTaskWebview]);

  const checkDocumentPageWithRetry = useCallback(async (taskId: string) => {
    let lastResult = await checkDocumentPage(taskId);
    for (let index = 0; index < 20 && shouldRetryDocumentPageCheck(lastResult); index += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 300));
      lastResult = await checkDocumentPage(taskId);
    }

    return lastResult;
  }, [checkDocumentPage]);

  const markDocumentPageState = useCallback(async (taskId: string, fallbackUrl = "", retry = true) => {
    try {
      const webview = webviewRefs.current.get(taskId);
      if (webview) {
        void installDocumentPageMonitor(webview);
      }
      const result = retry ? await checkDocumentPageWithRetry(taskId) : await checkDocumentPage(taskId);
      patchDocumentPageState(taskId, {
        status: result.ok ? "ready" : "error",
        message: result.message,
        url: result.url || fallbackUrl
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      patchDocumentPageState(taskId, { status: "error", message, url: fallbackUrl });
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

  const ensureDocumentFillPage = useCallback(async (taskId: string) => {
    const result = await checkDocumentPageWithRetry(taskId);
    if (!result.ok) {
      patchTask(taskId, { status: "error", message: result.message, url: result.url });
      return false;
    }

    patchTask(taskId, { url: result.url });
    return true;
  }, [checkDocumentPageWithRetry, patchTask]);

  const ensureScheduledRequiredFields = useCallback(async (task: DocumentSubmitTask) => {
    if (task.mode !== "scheduled-confirm") {
      return true;
    }

    const result = await getTaskWebview(task.id).executeJavaScript(buildDocumentRequiredCheckScript(), true);
    const normalized = normalizeDocumentScriptResult(result);
    if (!normalized.ok) {
      patchTask(task.id, { status: "error", message: normalized.message });
      return false;
    }

    return true;
  }, [getTaskWebview, patchTask]);

  const createTaskDraft = useCallback(() => {
    const task = createDefaultDocumentTask(tasks.length + 1);
    setDraftTask(task);
    setActiveTaskId("");
    onActiveTaskChange?.("");
  }, [onActiveTaskChange, tasks.length]);

  const saveTaskSnapshot = useCallback((task: DocumentSubmitTask) => {
    const snapshot = {
      ...task,
      updatedAt: Date.now()
    };

    setTasks((current) =>
      current.some((item) => item.id === snapshot.id)
        ? current.map((item) => item.id === snapshot.id ? snapshot : item)
        : [snapshot, ...current]
    );
    setActiveTaskId(snapshot.id);
    onActiveTaskChange?.(snapshot.id);
    return snapshot;
  }, [onActiveTaskChange]);

  const saveTask = (task: DocumentSubmitTask) => {
    const alreadySaved = tasks.some((item) => item.id === task.id);
    saveTaskSnapshot(task);
    patchTask(task.id, { message: "任务已保存" });
    appendLog(task.id, alreadySaved ? "任务配置已保存" : "任务已保存到列表");
  };

  const buildTaskRunRequest = (task: DocumentSubmitTask) => buildDocumentRunRequest({
    mode: task.mode,
    date: task.date,
    time: task.time,
    offsetMs: task.offsetMs,
    pollingIntervalMs: Math.max(20, task.pollingIntervalMs),
    confirmAfterSubmit: task.mode === "scheduled-confirm" ? true : task.confirmAfterSubmit,
    fillRules: task.fillRules
  });

  useEffect(() => {
    if (createRequestRef.current === createRequest) {
      return;
    }

    createRequestRef.current = createRequest;
    createTaskDraft();
  }, [createRequest, createTaskDraft]);

  const duplicateTask = (source: DocumentSubmitTask) => {
    const task: DocumentSubmitTask = {
      ...source,
      id: createDocumentTaskId(),
      name: `${source.name} 副本`,
      status: "idle",
      message: "等待配置并加载网页",
      logs: [],
      updatedAt: Date.now()
    };
    setTasks((current) => [task, ...current]);
    setActiveTaskId(task.id);
  };

  const removeTask = async (id: string) => {
    const isSavedTask = tasks.some((task) => task.id === id);
    if (!isSavedTask) {
      const nextActiveTaskId = tasks[0]?.id ?? "";
      setDraftTask(createDefaultDocumentTask(tasks.length + 1));
      setActiveTaskId(nextActiveTaskId);
      onActiveTaskChange?.(nextActiveTaskId);
      return;
    }

    setTasks((current) => current.filter((task) => task.id !== id));
    webviewRefs.current.delete(id);
    const nextActiveTaskId = activeTaskId === id ? tasks.find((task) => task.id !== id)?.id ?? "" : activeTaskId;
    if (!nextActiveTaskId) {
      setDraftTask(createDefaultDocumentTask(Math.max(1, tasks.length)));
    }
    setActiveTaskId(nextActiveTaskId);
    onActiveTaskChange?.(nextActiveTaskId);
  };

  const loadDocument = async (task: DocumentSubmitTask) => {
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
  };

  const reloadDocument = async (task: DocumentSubmitTask) => {
    getTaskWebview(task.id).reload();
    patchTask(task.id, { status: "loading", message: "网页重新加载中" });
  };

  const stopTask = async (task: DocumentSubmitTask) => {
    const webview = getTaskWebview(task.id);
    webview.stop();
    await webview.executeJavaScript(
      "window.__chatSundialAutoSubmit && (window.__chatSundialAutoSubmit.stopped = true)",
      false
    ).catch(() => undefined);
    patchTask(task.id, { status: "stopped", message: "任务已停止" });
    appendLog(task.id, "任务已停止");
  };

  const startTask = async (task: DocumentSubmitTask) => {
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

      if (!await ensureScheduledRequiredFields(task)) {
        return;
      }

      patchTask(task.id, { status: "running", message: "任务运行中" });
      appendLog(task.id, "任务开始");
      const result = await webview.executeJavaScript(buildDocumentRunScript(request), true);
      applyScriptResult(task.id, normalizeDocumentScriptResult(result));
    } catch (error) {
      patchTask(task.id, { status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };

  const updateRunningTask = async (task: DocumentSubmitTask) => {
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
  };

  const scanQuestions = async (task: DocumentSubmitTask) => {
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
  };

  const resetTask = (task: DocumentSubmitTask) => {
    patchTask(task.id, { status: "ready", message: "任务已重置" });
    appendLog(task.id, "任务已重置");
  };

  const updateRule = (taskId: string, ruleId: string, patch: Partial<DocumentFillRuleDraft>) => {
    const task = activeTask?.id === taskId ? activeTask : tasks.find((item) => item.id === taskId);
    if (!task) {
      return;
    }

    patchTask(taskId, {
      fillRules: task.fillRules.map((rule) => rule.id === ruleId ? { ...rule, ...patch } : rule)
    });
  };

  const addRule = (task: DocumentSubmitTask) => {
    patchTask(task.id, {
      fillRules: [...task.fillRules, createDefaultFillRule(task.fillRules.length + 1)]
    });
  };

  const removeRule = (task: DocumentSubmitTask, ruleId: string) => {
    patchTask(task.id, {
      fillRules: task.fillRules.filter((rule) => rule.id !== ruleId)
    });
  };

  useEffect(() => {
    if (!actionRequest || actionRequestRef.current === actionRequest.nonce) {
      return;
    }

    actionRequestRef.current = actionRequest.nonce;
    const task = tasks.find((item) => item.id === actionRequest.taskId);
    if (!task) {
      return;
    }

    setActiveTaskId(task.id);

    if (actionRequest.action === "start") {
      void startTask(task);
    }
    if (actionRequest.action === "update") {
      void updateRunningTask(task);
    }
    if (actionRequest.action === "reload") {
      void reloadDocument(task);
    }
    if (actionRequest.action === "reset") {
      resetTask(task);
    }
    if (actionRequest.action === "duplicate") {
      duplicateTask(task);
    }
    if (actionRequest.action === "openDevTools") {
      getTaskWebview(task.id).openDevTools();
    }
    if (actionRequest.action === "stop") {
      void stopTask(task);
    }
    if (actionRequest.action === "remove") {
      void removeTask(task.id);
    }
  }, [actionRequest, getTaskWebview, tasks]);

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

  if (!activeTask) {
    return null;
  }

  const previewStatus = getDocumentPreviewStatus(activeTask);
  const blockingNotice = getDocumentBlockingNotice(activeTask);

  return (
    <div className="page document-page">
      <PageHeading title="腾讯文档自助提交" description="多任务保存、并行加载和独立监控腾讯收集表。" />

      <div className="document-workbench document-workbench--detail">
        <div className="document-editor">
          <Card title="任务配置" bodyLayout="stack" className="document-config-card">
            <div className="document-config-grid">
              <Field label="任务名称">
                <Input value={activeTask.name} onValueChange={(name) => patchTask(activeTask.id, { name })} allowClear />
              </Field>
              <Field label="提交模式">
                <Radio.Group
                  value={activeTask.mode}
                  onChange={(value) => {
                    if (isTaskRunning) {
                      return;
                    }

                    patchTask(activeTask.id, { mode: value as DocumentSubmitMode });
                  }}
                  options={modeOptions.map((option) => ({ ...option, disabled: isTaskRunning }))}
                  variant="segmented"
                  size="sm"
                  className={isTaskRunning ? "document-mode-switch is-locked" : "document-mode-switch"}
                />
              </Field>
            </div>

            <Field label="腾讯文档地址">
              <Input
                value={activeTask.url}
                onValueChange={(url) => {
                  if (isTaskRunning) {
                    return;
                  }

                  patchTask(activeTask.id, { url });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (isTaskRunning) {
                      return;
                    }

                    void loadDocument(activeTask);
                  }
                }}
                placeholder="输入腾讯文档地址后自动加载，按 Enter 可立即加载"
                disabled={isTaskRunning}
                allowClear
              />
            </Field>

            {isScheduledMode ? (
              <div className="document-mode-panel">
                <div className="form-grid">
                  <Field label="提交日期">
                    <DatePicker
                      value={parseDocumentDateValue(activeTask.date)}
                      onChange={(_date, dateString) => patchTask(activeTask.id, { date: dateString || activeTask.date })}
                      format="YYYY-MM-DD"
                      allowClear={false}
                      popupClassName="document-floating-panel"
                    />
                  </Field>
                  <Field label="提交时间">
                    <TimePicker
                      value={activeTask.time}
                      onChange={(time) => patchTask(activeTask.id, { time: time || "00:00:00" })}
                      format="HH:mm:ss"
                      showSecond
                      allowClear={false}
                      popupClassName="document-floating-panel"
                    />
                  </Field>
                </div>
              </div>
            ) : (
              <div className="document-mode-panel">
                <div className="document-section-header">
                  <Typography.Text strong>填充内容</Typography.Text>
                  <div className="document-card-actions">
                    <Button size="sm" icon="search" onClick={() => scanQuestions(activeTask)} disabled={!canUseElectronView}>扫描题目</Button>
                    <Button size="sm" icon="plus" onClick={() => addRule(activeTask)}>添加</Button>
                  </div>
                </div>
                <FillRuleTable
                  task={activeTask}
                  onUpdateRule={updateRule}
                  onRemoveRule={removeRule}
                />
                <div className="document-submit-options">
                  <Checkbox
                    checked={activeTask.confirmAfterSubmit}
                    onChange={(confirmAfterSubmit) => patchTask(activeTask.id, { confirmAfterSubmit })}
                    label="提交后点击二次确认"
                  />
                </div>
              </div>
            )}

            {blockingNotice && (
              <Alert
                className="document-blocking-alert"
                tone="danger"
                title={blockingNotice.title}
                icon="alert"
                action={
                  canUseElectronView ? (
                    <Button size="sm" variant="danger" icon="search" onClick={() => markDocumentPageState(activeTask.id)}>
                      重新检测
                    </Button>
                  ) : null
                }
              >
                {blockingNotice.message}
              </Alert>
            )}

            <div className="document-command-bar">
              {!isActiveTaskSaved && <Button icon="check" onClick={() => saveTask(activeTask)}>保存任务</Button>}
              {!isActiveTaskSaved && <Button icon="trash" variant="ghost" onClick={() => removeTask(activeTask.id)}>放弃草稿</Button>}
              {isTaskRunning && <Button icon="sync" onClick={() => updateRunningTask(activeTask)} disabled={!canUseElectronView}>更新运行配置</Button>}
              <Button
                variant={isTaskRunning ? "danger" : "primary"}
                icon={isTaskRunning ? "pause" : "play"}
                onClick={() => isTaskRunning ? stopTask(activeTask) : startTask(activeTask)}
                disabled={!canUseElectronView}
              >
                {isTaskRunning ? "停止任务" : "开始任务"}
              </Button>
            </div>
          </Card>

          <div className="document-preview-column">
            <section className="document-view-panel" aria-label="网页预览">
              <div className="document-view-header">
                <div className="document-view-title">
                  <Typography.Text strong>网页预览</Typography.Text>
                  <Typography.Text type="secondary">{activeTask.name}</Typography.Text>
                  <Typography.Text type="secondary" className="document-view-status-text">
                    {previewStatus.description}
                  </Typography.Text>
                </div>
                <div className="document-view-status">
                  <Tag tone={previewStatus.tone} dot>{previewStatus.label}</Tag>
                  <Tag tone={activeTask.status === "running" ? "warning" : "neutral"} dot>{modeText(activeTask.mode)}</Tag>
                </div>
              </div>
              <div className="document-webview-slot">
                {canUseElectronView ? (
                  webviewTasks.map((task) => (
                    <DocumentTaskWebview
                      task={task}
                      active={task.id === activeTask.id}
                      onReady={(webview) => setWebviewRef(task.id, webview)}
                      onDispose={() => setWebviewRef(task.id, null)}
                      onLoading={() => patchPassiveWebviewState(task.id, { status: "loading", message: "网页加载中" })}
                      onReadyState={(url) => void markDocumentPageState(task.id, url || task.url)}
                      onPageChanged={(url) => void markDocumentPageState(task.id, url || task.url, false)}
                      onError={(message) => patchPassiveWebviewState(task.id, { status: "error", message })}
                      onTitle={(title) => appendLog(task.id, `页面标题：${title}`)}
                      key={task.id}
                    />
                  ))
                ) : (
                  <div className="empty-text">请在 Electron 应用中查看腾讯文档网页</div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function toDocumentSidebarTask(task: DocumentSubmitTask): DocumentSidebarTask {
  return {
    id: task.id,
    name: task.name,
    status: task.status,
    statusLabel: statusLabel(task.status)
  };
}

function DocumentTaskWebview({
  task,
  active,
  onReady,
  onDispose,
  onLoading,
  onReadyState,
  onPageChanged,
  onError,
  onTitle
}: {
  task: DocumentSubmitTask;
  active: boolean;
  onReady: (webview: WebviewTagElement) => void;
  onDispose: () => void;
  onLoading: () => void;
  onReadyState: (url: string) => void;
  onPageChanged: (url: string) => void;
  onError: (message: string) => void;
  onTitle: (title: string) => void;
}) {
  const ref = useRef<WebviewTagElement | null>(null);

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

      void installDocumentPageMonitor(webview);
      onReadyState(url);
    };
    const handleFail = (event: Event) => {
      const detail = event as WebviewEvent;
      if (detail.errorCode === -3) {
        return;
      }

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
  }, [onDispose, onError, onLoading, onPageChanged, onReady, onReadyState, onTitle]);

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
      if (!shouldLoadConfiguredDocument(currentUrl, targetUrl)) {
        return;
      }

      onLoading();
      const loading = webview.loadURL(targetUrl);
      if (loading && typeof loading.then === "function") {
        loading.catch((error) => {
          if (!isNavigationAbort(error)) {
            onError(error instanceof Error ? error.message : String(error));
          }
        });
      }
    }, 100);

    return () => window.clearTimeout(timer);
  }, [active, onError, onLoading, task.status, task.url]);

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

function FillRuleTable({
  task,
  onUpdateRule,
  onRemoveRule
}: {
  task: DocumentSubmitTask;
  onUpdateRule: (taskId: string, ruleId: string, patch: Partial<DocumentFillRuleDraft>) => void;
  onRemoveRule: (task: DocumentSubmitTask, ruleId: string) => void;
}) {
  return (
    <div className="fill-rule-table-wrap">
      <table className="fill-rule-table">
        <thead>
          <tr>
            <th>启用</th>
            <th>题号</th>
            <th>类型</th>
            <th>值</th>
            <th aria-label="操作" />
          </tr>
        </thead>
        <tbody>
          {task.fillRules.map((rule) => (
            <tr key={rule.id}>
              <td>
                <Checkbox checked={rule.enabled} onChange={(enabled) => onUpdateRule(task.id, rule.id, { enabled })} />
              </td>
              <td>
                <InputNumber
                  min={1}
                  value={rule.questionNumber}
                  onChange={(questionNumber) => onUpdateRule(task.id, rule.id, { questionNumber: questionNumber ?? 1 })}
                  controls={false}
                />
              </td>
              <td>
                <Select
                  value={rule.type}
                  onChange={(value) => onUpdateRule(task.id, rule.id, { type: value as DocumentQuestionType, value: defaultValueForType(value as DocumentQuestionType) })}
                  options={questionTypeOptions}
                  popupClassName="document-floating-panel"
                />
              </td>
              <td>
                <Input
                  value={rule.value}
                  onValueChange={(value) => onUpdateRule(task.id, rule.id, { value })}
                  placeholder={placeholderForType(rule.type)}
                  allowClear
                />
              </td>
              <td>
                <Button size="sm" variant="ghost" icon="trash" onClick={() => onRemoveRule(task, rule.id)}>删除</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PageHeading({ title, description }: { title: string; description: string }) {
  return (
    <header className="page-heading">
      <Typography.Title level={2}>{title}</Typography.Title>
      <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>
    </header>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <span>{label}</span>
      {children}
    </div>
  );
}

function getDocumentPreviewStatus(task: DocumentSubmitTask): { label: string; tone: TagTone; description: string } {
  const readableMessage = getReadableTaskMessage(task.message);

  if (task.status === "loading") {
    return { label: "正在打开", tone: "info", description: "正在加载腾讯文档网页，请稍等。" };
  }

  if (task.status === "ready") {
    return {
      label: "已就绪",
      tone: "success",
      description: getReadyDescription(task)
    };
  }

  if (task.status === "running") {
    return {
      label: "运行中",
      tone: "warning",
      description: task.mode === "scheduled-confirm"
        ? "任务已启动，正在等待目标时间后确认提交。"
        : "任务已启动，正在等待收集开放后填充并提交。"
    };
  }

  if (task.status === "success") {
    if (readableMessage.startsWith("扫描到")) {
      return { label: "扫描完成", tone: "success", description: `${readableMessage}，可继续调整填充内容。` };
    }

    return { label: "已完成", tone: "success", description: readableMessage || "任务执行完成，已按配置完成提交流程。" };
  }

  if (task.status === "error") {
    return { label: "需要处理", tone: "danger", description: readableMessage || "任务执行失败，请检查网页状态和配置。" };
  }

  if (task.status === "stopped") {
    return { label: "已停止", tone: "neutral", description: "任务已停止，点击开始任务可重新运行。" };
  }

  return {
    label: "未加载",
    tone: "neutral",
    description: task.url.trim() ? "按 Enter 加载腾讯文档，或点击开始任务自动加载。" : "先填写腾讯文档地址。"
  };
}

function getDocumentBlockingNotice(task: DocumentSubmitTask): { title: string; message: string } | null {
  const message = getReadableTaskMessage(task.message);
  if (task.status !== "error" || !message) {
    return null;
  }

  if (message.includes("提交时间不能早于当前时间")) {
    return {
      title: "需要处理",
      message
    };
  }

  if (message.includes("未填写必填项")) {
    return {
      title: "需要处理",
      message
    };
  }

  if (message.includes("结果/统计页") || message.includes("填写页")) {
    return {
      title: "需要处理",
      message
    };
  }

  return {
    title: "需要处理",
    message
  };
}

function getReadyDescription(task: DocumentSubmitTask) {
  if (task.mode === "scheduled-confirm") {
    return "网页已打开，开始后会先点击提交，再按设置时间确认。";
  }

  return "网页已打开，开始后会等待开放、填充内容并提交。";
}

function getReadableTaskMessage(message: string) {
  const value = message.trim();
  if (!value || value === "probe script skipped" || value === "网页已就绪" || value === "任务已重置") {
    return "";
  }

  return value;
}

function statusLabel(status: DocumentViewStatus) {
  const label: Record<DocumentViewStatus, string> = {
    idle: "未加载",
    loading: "加载中",
    ready: "已就绪",
    running: "运行中",
    success: "已完成",
    error: "错误",
    stopped: "已停止"
  };
  return label[status];
}

export function isDocumentUrlLocked(status: DocumentViewStatus | undefined) {
  return status === "running";
}

function isPassiveWebviewStatusLocked(status: DocumentViewStatus) {
  return status === "running" || status === "success" || status === "error" || status === "stopped";
}

function isPageDetectionStatusLocked(task: DocumentSubmitTask) {
  if (task.status === "running" || task.status === "success" || task.status === "stopped") {
    return true;
  }

  return task.status === "error" && !isPageDetectionMessage(task.message);
}

function isRealtimePageMonitorStatus(task: DocumentSubmitTask) {
  return task.status === "loading" ||
    task.status === "ready" ||
    (task.status === "error" && isPageDetectionMessage(task.message));
}

function isPageDetectionMessage(message: string) {
  return message.includes("当前不是腾讯收集表页面") ||
    message.includes("填写页正在渲染") ||
    message.includes("当前在结果/统计页") ||
    message.includes("还没有检测到填写题目和提交按钮") ||
    message.includes("网页加载中") ||
    message.includes("网页重新加载中");
}

function createRuleFromQuestion(question: ScannedDocumentQuestion): DocumentFillRuleDraft {
  return {
    id: createDocumentTaskId(),
    enabled: true,
    questionNumber: question.questionNumber,
    type: question.type,
    value: defaultValueForType(question.type)
  };
}

function defaultValueForType(type: DocumentQuestionType) {
  if (type === "textArea") {
    return "";
  }

  return type === "radio" ? "0" : "0,1";
}

function placeholderForType(type: DocumentQuestionType) {
  if (type === "textArea") {
    return "测试输入";
  }

  return type === "radio" ? "例如 1" : "例如 0,1";
}

function modeText(mode: DocumentSubmitMode) {
  if (mode === "scheduled-confirm") {
    return "到点确认";
  }

  return "开放填充";
}

function parseDocumentDateValue(value: string): Date | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function canUseDocumentWebview() {
  if (typeof window === "undefined") {
    return false;
  }

  return Boolean(window.chatSundial);
}

function waitForWebviewDomReady(webview: WebviewTagElement) {
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

function getWebviewUrl(webview: WebviewTagElement) {
  try {
    return webview.getURL();
  } catch {
    return webview.src || "";
  }
}

function installDocumentPageMonitor(webview: WebviewTagElement) {
  if (webview.dataset.pageMonitorInstalled === "true") {
    return Promise.resolve(undefined);
  }

  return webview.executeJavaScript(buildDocumentPageMonitorScript(), false)
    .then(() => {
      webview.dataset.pageMonitorInstalled = "true";
    })
    .catch(() => undefined);
}

function normalizeTencentDocsUrl(value: string) {
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

function isTencentDocsRuntimeUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "docs.qq.com";
  } catch {
    return false;
  }
}

function normalizeDocumentScriptResult(value: unknown): DocumentRunResult {
  if (value && typeof value === "object" && "ok" in value) {
    return value as DocumentRunResult;
  }

  return {
    ok: true,
    message: "脚本执行完成",
    detail: value
  };
}

function normalizeDocumentPageCheckResult(value: unknown): DocumentPageCheckResult {
  if (value && typeof value === "object" && "pageKind" in value && "ok" in value) {
    return value as DocumentPageCheckResult;
  }

  return {
    ok: false,
    message: "无法识别当前腾讯文档页面，请确认已经切换到“填写”页",
    pageKind: "loading",
    url: "",
    questionCount: 0,
    hasSubmitButton: false
  };
}

function shouldRetryDocumentPageCheck(result: DocumentPageCheckResult) {
  if (result.pageKind === "loading") {
    return true;
  }

  if (result.pageKind !== "result") {
    return false;
  }

  try {
    return !new URL(result.url).hash.startsWith("#/result");
  } catch {
    return false;
  }
}

function isNavigationAbort(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("ERR_ABORTED") || message.includes("(-3)");
}
