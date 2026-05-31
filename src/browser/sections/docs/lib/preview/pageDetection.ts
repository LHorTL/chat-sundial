import type { DocumentRunResult } from "../runtime/automation";

export type DocumentPageKind = "form" | "result" | "loading" | "not-form";

export interface DocumentPageSnapshot {
  href: string;
  hash: string;
  pathname: string;
  questionCount: number;
  hasSubmitButton: boolean;
  bodyTextSample: string;
}

export interface DocumentPageCheckResult extends DocumentRunResult {
  pageKind: DocumentPageKind;
  url: string;
  questionCount: number;
  hasSubmitButton: boolean;
}

export const DOCUMENT_PAGE_MONITOR_EVENT = "__CHAT_SUNDIAL_DOCUMENT_PAGE_CHANGED__";

/** 根据腾讯文档页面快照判断当前可操作状态。 */
export function resolveDocumentPageState(snapshot: DocumentPageSnapshot): DocumentPageCheckResult {
  let isTencentFormPage = false;
  try {
    const url = new URL(snapshot.href);
    isTencentFormPage = url.protocol === "https:" &&
      url.hostname === "docs.qq.com" &&
      url.pathname.startsWith("/form/page/");
  } catch {
    isTencentFormPage = false;
  }
  const isFillEntryRoute = snapshot.hash === "#/fill" || snapshot.hash.startsWith("#/fill?");
  const isResultRoute = snapshot.hash.startsWith("#/result") || /统计|结果|你已提交|已提交\d*份|再填一份|修改我的结果/.test(snapshot.bodyTextSample);

  if (!isTencentFormPage) {
    return {
      ok: false,
      message: "当前不是腾讯收集表页面，请先加载 docs.qq.com/form/page/ 开头的地址",
      pageKind: "not-form",
      url: snapshot.href,
      questionCount: snapshot.questionCount,
      hasSubmitButton: snapshot.hasSubmitButton
    };
  }

  if (snapshot.questionCount > 0 && snapshot.hasSubmitButton) {
    return {
      ok: true,
      message: `当前是填写页，检测到 ${snapshot.questionCount} 个题目`,
      pageKind: "form",
      url: snapshot.href,
      questionCount: snapshot.questionCount,
      hasSubmitButton: snapshot.hasSubmitButton
    };
  }

  if (isFillEntryRoute && snapshot.questionCount > 0) {
    return {
      ok: false,
      message: "填写页正在渲染，尚未检测到提交按钮，请稍等",
      pageKind: "loading",
      url: snapshot.href,
      questionCount: snapshot.questionCount,
      hasSubmitButton: snapshot.hasSubmitButton
    };
  }

  if (isResultRoute) {
    return {
      ok: false,
      message: "当前在结果/统计页，请在腾讯文档顶部切换到“填写”后再开始任务",
      pageKind: "result",
      url: snapshot.href,
      questionCount: snapshot.questionCount,
      hasSubmitButton: snapshot.hasSubmitButton
    };
  }

  return {
    ok: false,
    message: "还没有检测到填写题目和提交按钮，请等待页面加载完成或切换到“填写”页",
    pageKind: "loading",
    url: snapshot.href,
    questionCount: snapshot.questionCount,
    hasSubmitButton: snapshot.hasSubmitButton
  };
}
