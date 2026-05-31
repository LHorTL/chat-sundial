import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GlobalTaskRegistration } from "@/lib/globalTask";
import type { DocumentFillRuleDraft } from "../../lib/runtime/automation";
import {
  buildDocumentTaskRegistration,
  createDefaultDocumentTask,
  createDefaultFillRule,
  createDocumentTaskId,
  loadDocumentTasks,
  saveDocumentTasks,
  type DocumentSubmitTask
} from "../../lib/task/registration";
import {
  isPageDetectionStatusLocked,
  isPassiveWebviewStatusLocked,
  toDocumentSidebarTask,
  type DocumentSidebarTask
} from "../../lib/task/viewModel";

interface UseDocumentTasksOptions {
  createRequest: number;
  selectedTaskId?: string;
  onActiveTaskChange?: (taskId: string) => void;
  onSidebarTasksChange?: (tasks: DocumentSidebarTask[]) => void;
  onTaskSnapshotChange?: (tasks: GlobalTaskRegistration[]) => void;
}

/** 管理文档任务集合、草稿任务、持久化和纯任务编辑动作。 */
export function useDocumentTasks({
  createRequest,
  selectedTaskId,
  onActiveTaskChange,
  onSidebarTasksChange,
  onTaskSnapshotChange
}: UseDocumentTasksOptions) {
  const initialTasks = useMemo(() => loadDocumentTasks(), []);
  const [tasks, setTasks] = useState<DocumentSubmitTask[]>(initialTasks);
  const [activeTaskId, setActiveTaskId] = useState(() => initialTasks[0]?.id ?? "");
  const [draftTask, setDraftTask] = useState<DocumentSubmitTask>(() => createDefaultDocumentTask(initialTasks.length + 1));
  const createRequestRef = useRef(createRequest);
  const activeTask = useMemo(
    () => activeTaskId ? tasks.find((task) => task.id === activeTaskId) ?? tasks[0] : draftTask,
    [activeTaskId, draftTask, tasks]
  );
  const isActiveTaskSaved = Boolean(activeTask && tasks.some((task) => task.id === activeTask.id));
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

  const createTaskDraft = useCallback(() => {
    const task = createDefaultDocumentTask(tasks.length + 1);
    setDraftTask(task);
    setActiveTaskId("");
    onActiveTaskChange?.("");
  }, [onActiveTaskChange, tasks.length]);

  useEffect(() => {
    if (createRequestRef.current === createRequest) {
      return;
    }

    createRequestRef.current = createRequest;
    createTaskDraft();
  }, [createRequest, createTaskDraft]);

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

  const saveTask = useCallback((task: DocumentSubmitTask) => {
    const alreadySaved = tasks.some((item) => item.id === task.id);
    saveTaskSnapshot(task);
    patchTask(task.id, { message: "任务已保存" });
    appendLog(task.id, alreadySaved ? "任务配置已保存" : "任务已保存到列表");
  }, [appendLog, patchTask, saveTaskSnapshot, tasks]);

  const duplicateTask = useCallback((source: DocumentSubmitTask) => {
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
  }, []);

  const removeTask = useCallback(async (id: string) => {
    const isSavedTask = tasks.some((task) => task.id === id);
    if (!isSavedTask) {
      const nextActiveTaskId = tasks[0]?.id ?? "";
      setDraftTask(createDefaultDocumentTask(tasks.length + 1));
      setActiveTaskId(nextActiveTaskId);
      onActiveTaskChange?.(nextActiveTaskId);
      return;
    }

    setTasks((current) => current.filter((task) => task.id !== id));
    const nextActiveTaskId = activeTaskId === id ? tasks.find((task) => task.id !== id)?.id ?? "" : activeTaskId;
    if (!nextActiveTaskId) {
      setDraftTask(createDefaultDocumentTask(Math.max(1, tasks.length)));
    }
    setActiveTaskId(nextActiveTaskId);
    onActiveTaskChange?.(nextActiveTaskId);
  }, [activeTaskId, onActiveTaskChange, tasks]);

  const resetTask = useCallback((task: DocumentSubmitTask) => {
    patchTask(task.id, { status: "ready", message: "任务已重置" });
    appendLog(task.id, "任务已重置");
  }, [appendLog, patchTask]);

  const updateRule = useCallback((taskId: string, ruleId: string, patch: Partial<DocumentFillRuleDraft>) => {
    const task = activeTask?.id === taskId ? activeTask : tasks.find((item) => item.id === taskId);
    if (!task) {
      return;
    }

    patchTask(taskId, {
      fillRules: task.fillRules.map((rule) => rule.id === ruleId ? { ...rule, ...patch } : rule)
    });
  }, [activeTask, patchTask, tasks]);

  const addRule = useCallback((task: DocumentSubmitTask) => {
    patchTask(task.id, {
      fillRules: [...task.fillRules, createDefaultFillRule(task.fillRules.length + 1)]
    });
  }, [patchTask]);

  const removeRule = useCallback((task: DocumentSubmitTask, ruleId: string) => {
    patchTask(task.id, {
      fillRules: task.fillRules.filter((rule) => rule.id !== ruleId)
    });
  }, [patchTask]);

  return {
    tasks,
    activeTask,
    activeTaskId,
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
  };
}
