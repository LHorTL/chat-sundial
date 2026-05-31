import type { GlobalTaskRegistration, GlobalTaskStatus } from "@/lib/globalTask";
import { readJson, writeJson } from "@/lib/storage";
import {
  getDateInputValue,
  getTimeInputValue,
  type DocumentFillRuleDraft,
  type DocumentRunLog,
  type DocumentSubmitMode
} from "../runtime/automation";

export const DOCUMENT_TASKS_STORAGE_KEY = "chat-sundial:document-submit-tasks";

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

export type DocumentTaskPersistedRecord = Pick<
  DocumentSubmitTask,
  "url" | "mode" | "date" | "time" | "offsetMs" | "pollingIntervalMs" | "confirmAfterSubmit" | "fillRules"
> & Partial<Pick<DocumentSubmitTask, "id" | "name" | "updatedAt">>;

/** 把文档任务转换为全局任务中心可展示的注册项。 */
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

/** 创建一个带默认时间和默认填充规则的新文档任务。 */
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

/** 从持久化记录中恢复文档任务，启动时只恢复长期配置，不恢复运行态。 */
export function loadDocumentTasks(): DocumentSubmitTask[] {
  const rawTasks = readJson<unknown[]>(DOCUMENT_TASKS_STORAGE_KEY, []);
  if (!Array.isArray(rawTasks)) {
    return [];
  }

  return rawTasks.map((item, index) => normalizeDocumentTask(item, index + 1)).filter(Boolean) as DocumentSubmitTask[];
}

/** 保存文档任务长期配置，避免把运行中、加载中和错误提示持久化为下一次启动状态。 */
export function saveDocumentTasks(tasks: DocumentSubmitTask[]) {
  writeJson(DOCUMENT_TASKS_STORAGE_KEY, tasks.map(toPersistedDocumentTask));
}

/** 归一化提交模式，未知值回退到开放后填充提交。 */
export function normalizeSubmitMode(value: unknown): DocumentSubmitMode {
  if (value === "scheduled-confirm" || value === "await-fill-submit") {
    return value;
  }

  return "await-fill-submit";
}

/** 创建单条默认填充规则。 */
export function createDefaultFillRule(questionNumber: number): DocumentFillRuleDraft {
  return {
    id: createDocumentTaskId(),
    enabled: true,
    questionNumber,
    type: "textArea",
    value: ""
  };
}

/** 创建文档任务和填充规则通用的随机 id。 */
export function createDocumentTaskId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** 把运行时任务压缩成可长期保存的配置记录。 */
function toPersistedDocumentTask(task: DocumentSubmitTask): DocumentTaskPersistedRecord {
  return {
    id: task.id,
    name: task.name,
    url: task.url,
    mode: task.mode,
    date: task.date,
    time: task.time,
    offsetMs: task.offsetMs,
    pollingIntervalMs: task.pollingIntervalMs,
    confirmAfterSubmit: task.confirmAfterSubmit,
    fillRules: task.fillRules,
    updatedAt: task.updatedAt
  };
}

/** 把未知持久化记录恢复成运行时文档任务。 */
function normalizeDocumentTask(value: unknown, index: number): DocumentSubmitTask | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const task = value as Partial<DocumentSubmitTask>;
  const fallback = createDefaultDocumentTask(index);

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
    status: "idle",
    message: "等待配置并加载网页",
    logs: [],
    updatedAt: Number.isFinite(task.updatedAt) ? Number(task.updatedAt) : fallback.updatedAt
  };
}

/** 把文档任务运行态映射到全局任务中心状态。 */
function documentTaskStatus(status: DocumentViewStatus): GlobalTaskStatus {
  if (status === "running") return "running";
  if (status === "loading") return "waiting";
  if (status === "success" || status === "ready") return "success";
  if (status === "error") return "error";
  if (status === "stopped") return "stopped";
  return "idle";
}

/** 把文档任务运行态转换为中文状态标签。 */
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

/** 把文档提交模式转换为全局任务中心标题文案。 */
function modeLabel(mode: DocumentSubmitMode) {
  if (mode === "scheduled-confirm") return "文档到点确认提交";
  return "文档开放后填充提交";
}

/** 根据提交模式生成全局任务中心默认主描述。 */
function documentTaskPrimary(mode: DocumentSubmitMode) {
  if (mode === "scheduled-confirm") return "等待到点确认提交";
  return "等待收集开放后填充并提交";
}

/** 获取文档任务最近更新时间，优先使用日志时间。 */
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
