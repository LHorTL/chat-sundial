import {
  shouldToggleChoiceOption,
  type DocumentFillRule
} from "./documentFillRules";
import type {
  DocumentRunLog,
  DocumentRunRequest,
  DocumentRunResult
} from "./documentAutomation";

/** 序列化完整自动提交脚本，用于注入腾讯文档 webview。 */
export function buildDocumentRunScript(request: DocumentRunRequest): string {
  return `(${documentRunScriptSource})(${JSON.stringify(request)}, ${isChoiceOptionSelectedSource}, ${shouldToggleChoiceOption})`;
}

/** 序列化运行中配置更新脚本，用于只更新当前任务参数。 */
export function buildDocumentUpdateScript(request: DocumentRunRequest): string {
  return `(${documentUpdateScriptSource})(${JSON.stringify(request)})`;
}

/** 判断腾讯文档选项节点当前是否处于选中状态。 */
function isChoiceOptionSelectedSource(option: Element) {
  const element = option as HTMLElement;
  const input = element.querySelector("input") as HTMLInputElement | null;
  const className = element.className.toString();
  return Boolean(input?.checked) ||
    element.getAttribute("aria-checked") === "true" ||
    className.includes("checked") ||
    className.includes("selected") ||
    className.includes("active");
}

/** 自动提交脚本主体，负责定时、填充、提交和二次确认。 */
function documentRunScriptSource(
  request: DocumentRunRequest,
  isChoiceOptionSelected: (option: Element) => boolean,
  shouldToggleChoiceOption: (isSelected: boolean, index: number, targetIndexes: number[]) => boolean
): Promise<DocumentRunResult> {
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

    const options = Array.from(root.querySelectorAll(".form-choice-checkbox-option")) as HTMLElement[];
    const targetIndexes = rule.value as number[];
    targetIndexes.forEach((index) => {
      const target = options[index];
      if (!target) {
        throw new Error(`第 ${rule.questionIndex + 1} 题多选项 ${index} 不存在`);
      }
    });

    options.forEach((option, index) => {
      const selected = isChoiceOptionSelected(option);
      if (shouldToggleChoiceOption(selected, index, targetIndexes)) {
        option.click();
      }
    });
    log(`第 ${rule.questionIndex + 1} 题多选已选择 ${targetIndexes.join(", ")}`);
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

/** 运行中配置更新脚本主体，替换可变配置并保持原运行模式。 */
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
