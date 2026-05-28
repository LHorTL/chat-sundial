import type { GlobalTaskRegistration, GlobalTaskStatus } from "../../../components/TaskCenter";
import {
  getDateInputValue,
  getTimeInputValue,
  type DocumentFillRuleDraft,
  type DocumentRunLog,
  type DocumentSubmitMode
} from "./documentAutomation";

export const DOCUMENT_TASKS_STORAGE_KEY = "chat-sundial:document-submit-tasks";
const LEGACY_DOCUMENT_SETTINGS_STORAGE_KEY = "chat-sundial:document-submit-settings";

export type DocumentViewStatus = "idle" | "loading" | "ready" | "running" | "success" | "error" | "stopped";

export interface DocumentSubmitTask {
  id: string;
  name: string;
  url: string;
  mode: DocumentSubmitMode;
  date: string;
  time: string;
  offsetMs: number;
  pollingIntervalMs: number;
  confirmAfterSubmit: boolean;
  fillRules: DocumentFillRuleDraft[];
  status: DocumentViewStatus;
  message: string;
  logs: DocumentRunLog[];
  updatedAt: number;
}

export type DocumentSettings = Pick<
  DocumentSubmitTask,
  "url" | "mode" | "date" | "time" | "offsetMs" | "pollingIntervalMs" | "confirmAfterSubmit" | "fillRules"
>;

export function buildDocumentTaskRegistration(task: DocumentSubmitTask): GlobalTaskRegistration {
  const isScheduledMode = task.mode === "scheduled-confirm";

  return {
    id: `docs-submit-${task.id}`,
    section: "docs",
    kind: "docs-submit",
    title: task.name.trim() || modeLabel(task.mode),
    status: documentTaskStatus(task.status),
    statusLabel: documentStatusLabel(task.status),
    primary: task.message || documentTaskPrimary(task.mode),
    secondary: task.url.trim() || "未填写腾讯文档地址",
    meta: [
      modeLabel(task.mode).replace(/^文档/, ""),
      `${task.fillRules.filter((rule) => rule.enabled).length} 条填充规则`,
      task.confirmAfterSubmit && !isScheduledMode ? "提交后确认" : isScheduledMode ? "到点确认" : "不自动确认"
    ],
    logs: task.logs,
    updatedAt: latestTaskTime(task)
  };
}

export function createDefaultDocumentTask(index = 1, patch: Partial<DocumentSubmitTask> = {}): DocumentSubmitTask {
  const nextMinute = new Date(Date.now() + 60_000);
  const id = createDocumentTaskId();

  return {
    id,
    name: `文档任务 ${index}`,
    url: "",
    mode: "await-fill-submit",
    date: getDateInputValue(nextMinute),
    time: getTimeInputValue(nextMinute),
    offsetMs: 0,
    pollingIntervalMs: 50,
    confirmAfterSubmit: true,
    fillRules: [createDefaultFillRule(1)],
    status: "idle",
    message: "等待配置并加载网页",
    logs: [],
    updatedAt: Date.now(),
    ...patch
  };
}

export function loadDocumentTasks(): DocumentSubmitTask[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(DOCUMENT_TASKS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const tasks = parsed.map((item, index) => normalizeDocumentTask(item, index + 1)).filter(Boolean) as DocumentSubmitTask[];
        if (tasks.length > 0) {
          return tasks;
        }
      }
    }

    const legacyRaw = window.localStorage.getItem(LEGACY_DOCUMENT_SETTINGS_STORAGE_KEY);
    if (legacyRaw) {
      const legacy = normalizeLegacySettings(JSON.parse(legacyRaw) as Partial<DocumentSettings>);
      return [createDefaultDocumentTask(1, { ...legacy, name: "默认文档任务" })];
    }
  } catch {
    return [];
  }

  return [];
}

export function saveDocumentTasks(tasks: DocumentSubmitTask[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(DOCUMENT_TASKS_STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // Local persistence should not block the submit workflow.
  }
}

export function normalizeSubmitMode(value: unknown): DocumentSubmitMode {
  if (value === "scheduled-confirm" || value === "await-fill-submit") {
    return value;
  }

  return "await-fill-submit";
}

export function createDefaultFillRule(questionNumber: number): DocumentFillRuleDraft {
  return {
    id: createDocumentTaskId(),
    enabled: true,
    questionNumber,
    type: "textArea",
    value: ""
  };
}

export function createDocumentTaskId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeDocumentTask(value: unknown, index: number): DocumentSubmitTask | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const task = value as Partial<DocumentSubmitTask>;
  const fallback = createDefaultDocumentTask(index);
  const restoredState = normalizeRestoredViewState(task.status);

  return {
    ...fallback,
    ...task,
    id: typeof task.id === "string" && task.id.trim() ? task.id : fallback.id,
    name: typeof task.name === "string" && task.name.trim() ? task.name : fallback.name,
    url: typeof task.url === "string" ? task.url : fallback.url,
    mode: normalizeSubmitMode(task.mode),
    date: typeof task.date === "string" ? task.date : fallback.date,
    time: typeof task.time === "string" ? task.time : fallback.time,
    offsetMs: Number.isFinite(task.offsetMs) ? Number(task.offsetMs) : fallback.offsetMs,
    pollingIntervalMs: Number.isFinite(task.pollingIntervalMs) ? Number(task.pollingIntervalMs) : fallback.pollingIntervalMs,
    confirmAfterSubmit: typeof task.confirmAfterSubmit === "boolean" ? task.confirmAfterSubmit : fallback.confirmAfterSubmit,
    fillRules: Array.isArray(task.fillRules) && task.fillRules.length ? task.fillRules : fallback.fillRules,
    status: restoredState.status,
    message: restoredState.message ?? (typeof task.message === "string" ? task.message : fallback.message),
    logs: Array.isArray(task.logs) ? task.logs.slice(-80) : [],
    updatedAt: Number.isFinite(task.updatedAt) ? Number(task.updatedAt) : fallback.updatedAt
  };
}

function normalizeLegacySettings(settings: Partial<DocumentSettings>): DocumentSettings {
  const fallback = createDefaultDocumentTask(1);

  return {
    url: typeof settings.url === "string" ? settings.url : fallback.url,
    mode: normalizeSubmitMode(settings.mode),
    date: typeof settings.date === "string" ? settings.date : fallback.date,
    time: typeof settings.time === "string" ? settings.time : fallback.time,
    offsetMs: Number.isFinite(settings.offsetMs) ? Number(settings.offsetMs) : fallback.offsetMs,
    pollingIntervalMs: Number.isFinite(settings.pollingIntervalMs) ? Number(settings.pollingIntervalMs) : fallback.pollingIntervalMs,
    confirmAfterSubmit: typeof settings.confirmAfterSubmit === "boolean" ? settings.confirmAfterSubmit : fallback.confirmAfterSubmit,
    fillRules: Array.isArray(settings.fillRules) && settings.fillRules.length ? settings.fillRules : fallback.fillRules
  };
}

function normalizeViewStatus(value: unknown): DocumentViewStatus {
  if (value === "loading" || value === "ready" || value === "running" || value === "success" || value === "error" || value === "stopped") {
    return value;
  }

  return "idle";
}

function normalizeRestoredViewState(value: unknown): { status: DocumentViewStatus; message?: string } {
  if (value === "running") {
    return {
      status: "stopped",
      message: "应用重启后任务已停止，点击开始任务可重新运行"
    };
  }

  if (value === "loading") {
    return {
      status: "idle",
      message: "上次网页加载已中断，请重新加载或开始任务"
    };
  }

  return { status: normalizeViewStatus(value) };
}

function documentTaskStatus(status: DocumentViewStatus): GlobalTaskStatus {
  if (status === "running") return "running";
  if (status === "loading") return "waiting";
  if (status === "success" || status === "ready") return "success";
  if (status === "error") return "error";
  if (status === "stopped") return "stopped";
  return "idle";
}

function documentStatusLabel(status: DocumentViewStatus) {
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

function modeLabel(mode: DocumentSubmitMode) {
  if (mode === "scheduled-confirm") return "文档到点确认提交";
  return "文档开放后填充提交";
}

function documentTaskPrimary(mode: DocumentSubmitMode) {
  if (mode === "scheduled-confirm") return "等待到点确认提交";
  return "等待收集开放后填充并提交";
}

function latestTaskTime(task: DocumentSubmitTask) {
  const latest = task.logs[task.logs.length - 1]?.time;
  if (latest) {
    const value = Date.parse(latest);
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return task.updatedAt;
}
