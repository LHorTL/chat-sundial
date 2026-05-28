import {
  normalizeDocumentFillRules,
  type DocumentFillRule,
  type DocumentFillRuleDraft,
  type DocumentQuestionType
} from "./documentFillRules";
import { parseDocumentTargetTime } from "./documentTime";

export type { DocumentFillRule, DocumentFillRuleDraft, DocumentQuestionType };
export * from "./documentTime";
export * from "./documentFillRules";
export * from "./documentPageDetection";
export * from "./documentInjectedScripts";

export type DocumentSubmitMode = "scheduled-confirm" | "await-fill-submit";

export interface DocumentRunConfig {
  mode: DocumentSubmitMode;
  date: string;
  time: string;
  offsetMs: number;
  pollingIntervalMs: number;
  confirmAfterSubmit: boolean;
  fillRules: DocumentFillRuleDraft[];
}

export interface DocumentRunRequest {
  mode: DocumentSubmitMode;
  targetEpochMs: number;
  offsetMs: number;
  pollingIntervalMs: number;
  confirmAfterSubmit: boolean;
  fillRules: DocumentFillRule[];
}

export interface ScannedDocumentQuestion {
  questionNumber: number;
  type: DocumentQuestionType;
  title: string;
  optionCount: number;
  options: string[];
}

export interface DocumentRunLog {
  time: string;
  message: string;
}

export interface DocumentRunResult {
  ok: boolean;
  message: string;
  detail?: unknown;
  logs?: DocumentRunLog[];
  questions?: ScannedDocumentQuestion[];
}

/** 把任务配置转换成自动提交脚本的运行请求。 */
export function buildDocumentRunRequest(config: DocumentRunConfig): DocumentRunRequest {
  const isScheduledConfirm = config.mode === "scheduled-confirm";

  return {
    mode: config.mode,
    targetEpochMs: isScheduledConfirm ? parseDocumentTargetTime(config.date, config.time) : 0,
    offsetMs: isScheduledConfirm ? normalizeInteger(config.offsetMs, 0) : 0,
    pollingIntervalMs: Math.max(20, normalizeInteger(config.pollingIntervalMs, 50)),
    confirmAfterSubmit: isScheduledConfirm ? true : config.confirmAfterSubmit,
    fillRules: isScheduledConfirm ? [] : normalizeDocumentFillRules(config.fillRules)
  };
}

/** 归一化整数配置，非法时回退到默认值。 */
function normalizeInteger(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}
