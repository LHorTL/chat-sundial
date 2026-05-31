import { useEffect, useRef } from "react";
import { PageHeading } from "@/components/page";
import type { GlobalTaskRegistration } from "@/lib/globalTask";
import { DocumentPreviewPanel } from "../components/preview/Panel";
import { DocumentTaskConfigCard } from "../components/config/TaskConfigCard";
import { useDocumentTaskRunner } from "../hooks/task/useRunner";
import { useDocumentTasks } from "../hooks/task/useTasks";
import { useDocumentWebviews } from "../hooks/preview/useWebviews";
import { canUseDocumentWebview } from "../lib/preview/webviewRuntime";
import {
  getDocumentBlockingNotice,
  isDocumentUrlLocked,
  shouldLoadConfiguredDocument,
  type DocumentSidebarTask
} from "../lib/task/viewModel";

export { isDocumentUrlLocked, shouldLoadConfiguredDocument } from "../lib/task/viewModel";

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

/** 编排文档自助提交页面，连接任务状态、webview 运行层和配置展示组件。 */
export function DocumentSubmitPage({
  createRequest = 0,
  selectedTaskId,
  actionRequest,
  onActiveTaskChange,
  onSidebarTasksChange,
  onTaskSnapshotChange
}: DocumentSubmitPageProps = {}) {
  const actionRequestRef = useRef(0);
  const {
    tasks,
    activeTask,
    isActiveTaskSaved,
    webviewTasks,
    setActiveTaskId,
    updateTaskState,
    patchTask,
    appendLog,
    patchPassiveWebviewState,
    patchDocumentPageState,
    saveTaskSnapshot,
    saveTask,
    duplicateTask,
    removeTask,
    resetTask,
    updateRule,
    addRule,
    removeRule
  } = useDocumentTasks({
    createRequest,
    selectedTaskId,
    onActiveTaskChange,
    onSidebarTasksChange,
    onTaskSnapshotChange
  });
  const canUseElectronView = canUseDocumentWebview();
  const {
    setWebviewRef,
    deleteWebviewRef,
    getTaskWebview,
    waitForTaskWebview,
    loadWebviewUrl,
    markDocumentPageState
  } = useDocumentWebviews({
    canUseElectronView,
    webviewTasks,
    patchDocumentPageState
  });
  const isScheduledMode = activeTask?.mode === "scheduled-confirm";
  const isTaskRunning = isDocumentUrlLocked(activeTask?.status);
  const runner = useDocumentTaskRunner({
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
  });

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
      void runner.startTask(task);
    }
    if (actionRequest.action === "update") {
      void runner.updateRunningTask(task);
    }
    if (actionRequest.action === "reload") {
      void runner.reloadDocument(task);
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
      void runner.stopTask(task);
    }
    if (actionRequest.action === "remove") {
      void runner.removeDocumentTask(task.id);
    }
  }, [actionRequest, duplicateTask, getTaskWebview, resetTask, runner, setActiveTaskId, tasks]);

  if (!activeTask) {
    return null;
  }

  const blockingNotice = getDocumentBlockingNotice(activeTask);

  return (
    <div className="page document-page">
      <PageHeading title="腾讯文档自助提交" description="多任务保存、并行加载和独立监控腾讯收集表。" />

      <div className="document-workbench document-workbench--detail">
        <div className="document-editor">
          <DocumentTaskConfigCard
            task={activeTask}
            isTaskRunning={isTaskRunning}
            isScheduledMode={isScheduledMode}
            isActiveTaskSaved={isActiveTaskSaved}
            canUseElectronView={canUseElectronView}
            blockingNotice={blockingNotice}
            onPatchTask={patchTask}
            onLoadDocument={(task) => void runner.loadDocument(task)}
            onScanQuestions={(task) => void runner.scanQuestions(task)}
            onAddRule={addRule}
            onUpdateRule={updateRule}
            onRemoveRule={removeRule}
            onRecheckPage={(taskId) => void markDocumentPageState(taskId)}
            onSaveTask={saveTask}
            onRemoveTask={(id) => void runner.removeDocumentTask(id)}
            onUpdateRunningTask={(task) => void runner.updateRunningTask(task)}
            onStopTask={(task) => void runner.stopTask(task)}
            onStartTask={(task) => void runner.startTask(task)}
          />

          <DocumentPreviewPanel
            activeTask={activeTask}
            webviewTasks={webviewTasks}
            canUseElectronView={canUseElectronView}
            onReady={setWebviewRef}
            onDispose={(taskId) => setWebviewRef(taskId, null)}
            onLoading={(taskId) => patchPassiveWebviewState(taskId, { status: "loading", message: "网页加载中" })}
            onReadyState={(taskId, url) => void markDocumentPageState(taskId, url)}
            onPageChanged={(taskId, url) => void markDocumentPageState(taskId, url, false)}
            onError={(taskId, message) => patchPassiveWebviewState(taskId, { status: "error", message })}
            onTitle={(taskId, title) => appendLog(taskId, `页面标题：${title}`)}
          />
        </div>
      </div>
    </div>
  );
}
