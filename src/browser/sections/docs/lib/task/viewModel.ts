import type {
  DocumentFillRuleDraft,
  DocumentPageCheckResult,
  DocumentQuestionType,
  DocumentRunResult,
  DocumentSubmitMode,
  ScannedDocumentQuestion
} from "../runtime/automation";
import { createDocumentTaskId } from "./registration";

export * from "../preview/statusViewModel";
export * from "./urlViewModel";

export const modeOptions = [
  { value: "scheduled-confirm", label: "到点确认提交" },
  { value: "await-fill-submit", label: "开放后填充提交" }
] satisfies Array<{ value: DocumentSubmitMode; label: string }>;

export const questionTypeOptions = [
  { value: "textArea", label: "文本框" },
  { value: "radio", label: "单选" },
  { value: "checkBox", label: "多选" }
] satisfies Array<{ value: DocumentQuestionType; label: string }>;

/** 把扫描到的题目转换为默认填充规则。 */
export function createRuleFromQuestion(question: ScannedDocumentQuestion): DocumentFillRuleDraft {
  return {
    id: createDocumentTaskId(),
    enabled: true,
    questionNumber: question.questionNumber,
    type: question.type,
    value: defaultValueForType(question.type)
  };
}

/** 根据题型生成默认填充值。 */
export function defaultValueForType(type: DocumentQuestionType) {
  if (type === "textArea") {
    return "";
  }

  return type === "radio" ? "0" : "0,1";
}

/** 根据题型生成填充值输入框占位文案。 */
export function placeholderForType(type: DocumentQuestionType) {
  if (type === "textArea") {
    return "测试输入";
  }

  return type === "radio" ? "例如 1" : "例如 0,1";
}

/** 把日期输入字符串解析为 Date，并拒绝 2026-02-31 这类溢出日期。 */
export function parseDocumentDateValue(value: string): Date | null {
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

/** 归一化文档自动化脚本返回值。 */
export function normalizeDocumentScriptResult(value: unknown): DocumentRunResult {
  if (value && typeof value === "object" && "ok" in value) {
    return value as DocumentRunResult;
  }

  return {
    ok: true,
    message: "脚本执行完成",
    detail: value
  };
}

/** 归一化文档页面检测脚本返回值。 */
export function normalizeDocumentPageCheckResult(value: unknown): DocumentPageCheckResult {
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
