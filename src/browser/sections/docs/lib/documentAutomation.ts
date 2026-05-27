export type DocumentSubmitMode = "scheduled-confirm" | "await-fill-submit";

export type DocumentQuestionType = "textArea" | "radio" | "checkBox";

export interface DocumentFillRuleDraft {
  id: string;
  enabled: boolean;
  questionNumber: number;
  type: DocumentQuestionType;
  value: string;
}

export interface DocumentFillRule {
  questionIndex: number;
  type: DocumentQuestionType;
  value: string | number | number[];
}

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

export function getDateInputValue(date = new Date()): string {
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate())
  ].join("-");
}

export function getTimeInputValue(date = new Date()): string {
  return [
    pad2(date.getHours()),
    pad2(date.getMinutes()),
    pad2(date.getSeconds())
  ].join(":");
}

export function parseDocumentTargetTime(date: string, time: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
    throw new Error("提交日期无效");
  }

  const match = time.trim().match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) {
    throw new Error("提交时间无效");
  }

  const [, hourText, minuteText, secondText] = match;
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (hour > 23 || minute > 59 || second > 59) {
    throw new Error("提交时间无效");
  }

  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(year, month - 1, day, hour, minute, second).getTime();
  if (!Number.isFinite(target)) {
    throw new Error("提交时间无效");
  }

  return target;
}

export function normalizeDocumentFillRules(rules: DocumentFillRuleDraft[]): DocumentFillRule[] {
  return rules
    .filter((rule) => rule.enabled)
    .map((rule) => {
      const questionIndex = normalizeQuestionIndex(rule.questionNumber);
      return {
        questionIndex,
        type: rule.type,
        value: normalizeRuleValue(rule)
      };
    });
}

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

export function validateDocumentRunStartTime(request: DocumentRunRequest, nowMs = Date.now()) {
  if (request.mode !== "scheduled-confirm") {
    return;
  }

  if (request.targetEpochMs + request.offsetMs < nowMs) {
    throw new Error("提交时间不能早于当前时间，请重新选择未来时间");
  }
}

export function buildDocumentRunScript(request: DocumentRunRequest): string {
  return `(${documentRunScriptSource})(${JSON.stringify(request)})`;
}

export function buildDocumentUpdateScript(request: DocumentRunRequest): string {
  return `(${documentUpdateScriptSource})(${JSON.stringify(request)})`;
}

export function buildDocumentPageCheckScript(): string {
  return `(${documentPageCheckScriptSource})(${documentPageSnapshotSource}, ${resolveDocumentPageState})`;
}

export function buildDocumentPageMonitorScript(): string {
  return `(${documentPageMonitorScriptSource})(${JSON.stringify(DOCUMENT_PAGE_MONITOR_EVENT)})`;
}

export function buildDocumentRequiredCheckScript(): string {
  return `(${documentRequiredCheckScriptSource})()`;
}

export function buildDocumentScanScript(): string {
  return `(${documentScanScriptSource})()`;
}

export function resolveDocumentPageState(snapshot: DocumentPageSnapshot): DocumentPageCheckResult {
  const isTencentFormPage = snapshot.href.startsWith("https://docs.qq.com/form/page/") || snapshot.pathname.startsWith("/form/page/");
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

function documentPageSnapshotSource(): DocumentPageSnapshot {
  const questionCount = document.querySelectorAll(".question-main-content").length;
  const submitButton = document.querySelector(".question-commit button") as HTMLElement | null;
  const bodyTextSample = (document.body?.textContent || "").trim().replace(/\s+/g, " ").slice(0, 180);

  return {
    href: window.location.href,
    hash: window.location.hash,
    pathname: window.location.pathname,
    questionCount,
    hasSubmitButton: Boolean(submitButton),
    bodyTextSample
  };
}

function documentPageCheckScriptSource(
  createSnapshot: () => DocumentPageSnapshot,
  resolveState: (snapshot: DocumentPageSnapshot) => DocumentPageCheckResult
): DocumentPageCheckResult {
  return resolveState(createSnapshot());
}

function documentPageMonitorScriptSource(eventName: string): boolean {
  const monitorKey = "__chatSundialDocumentPageMonitor";
  type PageMonitor = { dispose: () => void };
  const globalScope = window as unknown as Record<string, PageMonitor | undefined>;
  globalScope[monitorKey]?.dispose();

  const cleanup: Array<() => void> = [];
  let scheduled = false;
  const emit = () => {
    if (scheduled) {
      return;
    }

    scheduled = true;
    window.setTimeout(() => {
      scheduled = false;
      console.log(`${eventName} ${Date.now()} ${window.location.href}`);
    }, 120);
  };

  const wrapHistoryMethod = (name: "pushState" | "replaceState") => {
    const original = window.history[name];
    window.history[name] = function wrappedHistoryMethod(this: History, ...args: Parameters<typeof original>) {
      const result = original.apply(this, args);
      emit();
      return result;
    } as typeof original;
    cleanup.push(() => {
      window.history[name] = original;
    });
  };

  wrapHistoryMethod("pushState");
  wrapHistoryMethod("replaceState");

  const handleRouteChange = () => emit();
  window.addEventListener("hashchange", handleRouteChange);
  window.addEventListener("popstate", handleRouteChange);
  cleanup.push(() => {
    window.removeEventListener("hashchange", handleRouteChange);
    window.removeEventListener("popstate", handleRouteChange);
  });

  const root = document.documentElement || document.body;
  if (root) {
    const observer = new MutationObserver(emit);
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true
    });
    cleanup.push(() => observer.disconnect());
  }

  globalScope[monitorKey] = {
    dispose: () => {
      cleanup.splice(0).forEach((dispose) => dispose());
    }
  };
  emit();
  return true;
}

function documentRequiredCheckScriptSource(): DocumentRunResult {
  const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");
  const getQuestionTitle = (root: Element, index: number) => {
    const titleElement = root.querySelector(".question-title, .question-title-text, .question-main-title");
    const text = normalizeText(titleElement?.textContent || root.textContent || "");
    return text.replace(/^\\*?\\s*\\d+\\s*/, "").slice(0, 40) || `第 ${index + 1} 题`;
  };
  const getRequiredErrorText = (root: Element) => {
    const errorElement = root.querySelector(".question-content-error");
    return normalizeText(errorElement?.textContent || "");
  };
  const hasRequiredValidationError = (root: Element) => {
    const text = normalizeText(root.textContent || "");
    return text.includes("该问题为必填") ||
      getRequiredErrorText(root).includes("必填") ||
      Boolean(root.querySelector(".question-content.error, .form-simple-main.error, .question-content-error"));
  };
  const isRequiredQuestion = (root: Element) => {
    const text = normalizeText(root.textContent || "");
    return text.startsWith("*") ||
      /^\\*?\\s*\\d+\\s*\\*/.test(text) ||
      hasRequiredValidationError(root) ||
      Boolean(root.querySelector("[required], .required, .is-required, .question-required, .form-question-required"));
  };
  const hasSelectedChoice = (root: Element, selector: string) =>
    Array.from(root.querySelectorAll(selector)).some((node) => {
      const element = node as HTMLElement;
      const input = element.querySelector("input") as HTMLInputElement | null;
      const className = element.className.toString();
      return input?.checked ||
        element.getAttribute("aria-checked") === "true" ||
        className.includes("checked") ||
        className.includes("selected") ||
        className.includes("active");
    });
  const isAnswered = (root: Element) => {
    const textField = Array.from(root.querySelectorAll("textarea, input"))
      .find((node) => {
        const input = node as HTMLInputElement | HTMLTextAreaElement;
        return input.type !== "hidden" &&
          input.type !== "radio" &&
          input.type !== "checkbox" &&
          !input.disabled &&
          input.offsetParent !== null;
      }) as HTMLInputElement | HTMLTextAreaElement | undefined;
    if (textField) {
      return textField.value.trim().length > 0;
    }

    if (root.querySelector(".form-choice-radio-option")) {
      return hasSelectedChoice(root, ".form-choice-radio-option");
    }

    if (root.querySelector(".form-choice-checkbox-option")) {
      return hasSelectedChoice(root, ".form-choice-checkbox-option");
    }

    return true;
  };
  const collectMissing = () => Array.from(document.querySelectorAll(".question-main-content"))
    .map((root, index) => ({ root, index }))
    .filter(({ root }) => (hasRequiredValidationError(root) || isRequiredQuestion(root)) && !isAnswered(root))
    .map(({ root, index }) => `第 ${index + 1} 题${getQuestionTitle(root, index)}`);

  const missing = collectMissing();
  if (missing.length > 0) {
    return {
      ok: false,
      message: `定时提交前有未填写必填项：${missing.slice(0, 3).join("、")}${missing.length > 3 ? "等" : ""}`
    };
  }

  return {
    ok: true,
    message: "必填项已填写"
  };
}

function documentScanScriptSource(): DocumentRunResult {
  const questions = Array.from(document.querySelectorAll(".question-main-content")).map((node, index) => {
    const root = node as HTMLElement;
    const textArea = root.getElementsByTagName("textarea")[0];
    const radioOptions = Array.from(root.querySelectorAll(".form-choice-radio-option"));
    const checkboxOptions = Array.from(root.querySelectorAll(".form-choice-checkbox-option"));
    const titleElement = root.querySelector(".question-title, .question-title-text, .question-main-title");
    const title = (titleElement?.textContent || root.textContent || `第 ${index + 1} 题`).trim().replace(/\s+/g, " ").slice(0, 80);
    const type: DocumentQuestionType = textArea ? "textArea" : radioOptions.length > 0 ? "radio" : "checkBox";
    const optionNodes = type === "radio" ? radioOptions : checkboxOptions;

    return {
      questionNumber: index + 1,
      type,
      title,
      optionCount: optionNodes.length,
      options: optionNodes.map((option) => (option.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80))
    };
  });

  return {
    ok: true,
    message: `扫描到 ${questions.length} 个题目`,
    questions
  };
}

function documentRunScriptSource(request: DocumentRunRequest): Promise<DocumentRunResult> {
  const stateKey = "__chatSundialAutoSubmit";
  const logs: DocumentRunLog[] = [];
  const state = { stopped: false, request, revision: 0 };
  (window as unknown as Record<string, typeof state>)[stateKey] = state;

  const log = (message: string) => {
    logs.push({
      time: new Date().toISOString(),
      message
    });
  };

  const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const ensureActive = () => {
    if (state.stopped) {
      throw new Error("任务已停止");
    }
  };

  const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");
  const isVisible = (element: Element | null) => {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      rect.width > 0 &&
      rect.height > 0;
  };
  const getSubmitButton = () => document.querySelector(".question-commit button") as HTMLElement | null;
  const getConfirmDialogRoots = () => Array.from(document.querySelectorAll(
      ".dui-dragger, .dui-modal, .dui-dialog, [role='dialog'], [class*='modal'], [class*='dialog']"
    )).filter((node) => isVisible(node) && /确认提交/.test(normalizeText(node.textContent || "")));
  const getConfirmButton = () => {
    const modalRoots = getConfirmDialogRoots();

    for (const root of modalRoots) {
      const buttons = Array.from(root.querySelectorAll(".dui-button-type-primary, button, [role='button']"))
        .filter(isVisible) as HTMLElement[];
      const confirmButton = buttons.find((button) => normalizeText(button.textContent || "") === "确认") ??
        buttons.find((button) => normalizeText(button.textContent || "").includes("确认")) ??
        buttons.find((button) => button.className.toString().includes("primary"));

      if (confirmButton) {
        return confirmButton;
      }
    }

    return null;
  };
  const hasConfirmDialog = () => getConfirmDialogRoots().length > 0;
  const isSubmittedPage = () => !getSubmitButton() && /已提交|提交成功/.test(normalizeText(document.body?.textContent || ""));
  const isCollectNotStarted = (button: HTMLElement | null) => (button?.textContent || "").trim() === "收集暂未开始";
  const clickConfirmButton = (button: HTMLElement) => {
    button.click();
    log("已点击二次确认按钮");
  };

  const setNativeValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const ownDescriptor = Object.getOwnPropertyDescriptor(element, "value");
    const prototype = Object.getPrototypeOf(element) as HTMLInputElement | HTMLTextAreaElement;
    const prototypeDescriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    const setter = ownDescriptor?.set && ownDescriptor.set !== prototypeDescriptor?.set ? prototypeDescriptor?.set : ownDescriptor?.set;

    if (setter) {
      setter.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const waitUntilTargetTime = async () => {
    for (;;) {
      ensureActive();
      const currentRequest = state.request;
      if (Date.now() >= currentRequest.targetEpochMs + currentRequest.offsetMs) {
        break;
      }
      await sleep(currentRequest.pollingIntervalMs);
    }
    log("已到达目标提交时间");
  };

  const waitUntilOpen = async () => {
    for (;;) {
      ensureActive();
      const button = getSubmitButton();
      if (button && !isCollectNotStarted(button)) {
        log("提交按钮已可用");
        return button;
      }
      await sleep(state.request.pollingIntervalMs);
    }
  };

  const fillQuestion = (rule: DocumentFillRule) => {
    const root = document.querySelectorAll(".question-main-content")[rule.questionIndex] as HTMLElement | undefined;
    if (!root) {
      throw new Error(`第 ${rule.questionIndex + 1} 题不存在`);
    }

    if (rule.type === "textArea") {
      const target = root.getElementsByTagName("textarea")[0];
      if (!target) {
        throw new Error(`第 ${rule.questionIndex + 1} 题未找到文本框`);
      }
      setNativeValue(target, String(rule.value));
      log(`第 ${rule.questionIndex + 1} 题文本已填充`);
      return;
    }

    if (rule.type === "radio") {
      const options = root.querySelectorAll(".form-choice-radio-option");
      const index = Number(rule.value);
      const target = options[index] as HTMLElement | undefined;
      if (!target) {
        throw new Error(`第 ${rule.questionIndex + 1} 题单选项 ${index} 不存在`);
      }
      target.click();
      log(`第 ${rule.questionIndex + 1} 题单选已选择 ${index}`);
      return;
    }

    const options = root.querySelectorAll(".form-choice-checkbox-option");
    (rule.value as number[]).forEach((index) => {
      const target = options[index] as HTMLElement | undefined;
      if (!target) {
        throw new Error(`第 ${rule.questionIndex + 1} 题多选项 ${index} 不存在`);
      }
      target.click();
    });
    log(`第 ${rule.questionIndex + 1} 题多选已选择 ${(rule.value as number[]).join(", ")}`);
  };

  const fillAll = () => {
    state.request.fillRules.forEach(fillQuestion);
  };

  const clickSubmit = () => {
    if (hasConfirmDialog()) {
      throw new Error("已存在二次确认弹窗，已取消重复点击提交");
    }

    if (isSubmittedPage()) {
      throw new Error("页面已经显示已提交，已取消重复点击提交");
    }

    const button = getSubmitButton();
    if (!button) {
      throw new Error("未找到提交按钮");
    }
    button.click();
    log("已点击提交按钮");
  };

  const waitForConfirmButton = async (timeoutMs: number) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      ensureActive();
      const button = getConfirmButton();
      if (button) {
        return button;
      }
      await sleep(state.request.pollingIntervalMs);
    }

    return null;
  };

  const clickConfirm = async () => {
    if (!state.request.confirmAfterSubmit) {
      log("已跳过二次确认");
      return;
    }

    const button = await waitForConfirmButton(8000);
    if (button) {
      clickConfirmButton(button);
      await waitUntilConfirmDialogGone(3000);
      return;
    }

    throw new Error("未找到二次确认按钮");
  };

  const submitAndConfirm = async () => {
    clickSubmit();
    await clickConfirm();
  };

  const clickConfirmWithSubmitRetry = async () => {
    if (!state.request.confirmAfterSubmit) {
      log("已跳过二次确认");
      return;
    }

    const existingButton = getConfirmButton();
    if (existingButton) {
      clickConfirmButton(existingButton);
      await waitUntilConfirmDialogGone(3000);
      return;
    }

    if (hasConfirmDialog()) {
      throw new Error("检测到二次确认弹窗，但未找到确认按钮，已取消重复点击提交");
    }

    if (isSubmittedPage()) {
      log("页面已显示提交完成，跳过重复提交");
      return;
    }

    log("到点后未检测到二次确认弹窗，重新点击提交按钮");
    await submitAndConfirm();
  };

  const waitUntilConfirmDialogGone = async (timeoutMs: number) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      ensureActive();
      if (!hasConfirmDialog()) {
        return;
      }
      await sleep(state.request.pollingIntervalMs);
    }

    throw new Error("二次确认弹窗未关闭，请检查是否重复打开了确认弹窗");
  };

  const run = async () => {
    log("任务开始");
    if (state.request.mode === "scheduled-confirm") {
      clickSubmit();
      await waitUntilTargetTime();
      await clickConfirmWithSubmitRetry();
      return;
    }

    if (state.request.mode === "await-fill-submit") {
      await waitUntilOpen();
      fillAll();
      await submitAndConfirm();
      return;
    }

    fillAll();
    await submitAndConfirm();
  };

  return run()
    .then(() => ({
      ok: true,
      message: "提交任务已完成",
      logs
    }))
    .catch((error) => ({
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      logs
    }));
}

function documentUpdateScriptSource(request: DocumentRunRequest): DocumentRunResult {
  const stateKey = "__chatSundialAutoSubmit";
  type AutomationState = {
    stopped: boolean;
    request: DocumentRunRequest;
    revision?: number;
  };
  const state = (window as unknown as Record<string, AutomationState | undefined>)[stateKey];
  const log = {
    time: new Date().toISOString(),
    message: "运行配置已更新"
  };

  if (!state || state.stopped) {
    return {
      ok: false,
      message: "没有正在运行的任务",
      logs: [log]
    };
  }

  state.request = {
    ...request,
    mode: state.request.mode
  };
  state.revision = (state.revision ?? 0) + 1;

  return {
    ok: true,
    message: "运行配置已更新",
    logs: [log]
  };
}

function normalizeQuestionIndex(questionNumber: number): number {
  const value = Number(questionNumber);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("题号必须是正整数");
  }
  return value - 1;
}

function normalizeRuleValue(rule: DocumentFillRuleDraft): string | number | number[] {
  if (rule.type === "textArea") {
    return rule.value;
  }

  if (rule.type === "radio") {
    return normalizeOptionIndex(rule.value);
  }

  const indexes = parseCheckboxIndexes(rule.value);
  if (indexes.length === 0) {
    throw new Error("多选至少需要一个选项序号");
  }
  return indexes;
}

function parseCheckboxIndexes(value: string): number[] {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("多选值必须是序号数组");
    }
    return parsed.map((item) => normalizeOptionIndex(String(item)));
  }

  return trimmed.split(",").map((item) => normalizeOptionIndex(item));
}

function normalizeOptionIndex(value: string): number {
  const index = Number(value.trim());
  if (!Number.isInteger(index) || index < 0) {
    throw new Error("选项序号必须是非负整数");
  }
  return index;
}

function normalizeInteger(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
