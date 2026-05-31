import { describe, expect, it } from "vitest";
import {
  buildDocumentPageCheckScript,
  buildDocumentPageMonitorScript,
  buildDocumentRunScript,
  buildDocumentScanScript,
  buildDocumentUpdateScript
} from "@/sections/docs/lib/runtime/injected";
import type { DocumentPageCheckResult, DocumentRunResult } from "@/sections/docs/lib/runtime/automation";
import { DOCUMENT_PAGE_MONITOR_EVENT } from "@/sections/docs/lib/preview/pageDetection";

describe("document injected scripts", () => {
  it("serializes a self-contained browser script with timestamp guard", () => {
    const script = buildDocumentRunScript({
      mode: "scheduled-confirm",
      targetEpochMs: new Date(2026, 4, 27, 14, 11, 0).getTime(),
      offsetMs: 0,
      pollingIntervalMs: 50,
      confirmAfterSubmit: true,
      fillRules: []
    });

    expect(script).toContain("Date.now() >= currentRequest.targetEpochMs + currentRequest.offsetMs");
    expect(script).toContain(".question-main-content");
    expect(script).toContain(".question-commit button");
    expect(script).toContain("clickConfirmWithSubmitRetry");
    expect(script).toContain("shouldToggleChoiceOption");
    expect(script).toContain("isChoiceOptionSelected");
    expect(script).toContain("submitAndConfirm");
    expect(script).toContain("到点后未检测到二次确认弹窗，重新点击提交按钮");
  });

  it("serializes a running-task update script that keeps the original submit mode", () => {
    const script = buildDocumentUpdateScript({
      mode: "await-fill-submit",
      targetEpochMs: 0,
      offsetMs: 0,
      pollingIntervalMs: 50,
      confirmAfterSubmit: true,
      fillRules: [{ questionIndex: 0, type: "textArea", value: "更新后的内容" }]
    });

    expect(script).toContain("__chatSundialAutoSubmit");
    expect(script).toContain("mode: state.request.mode");
    expect(script).toContain("运行配置已更新");
    expect(script).toContain("更新后的内容");
  });

  it("serializes a page check script with Tencent form selectors", () => {
    const script = buildDocumentPageCheckScript();

    expect(script).toContain(".question-main-content");
    expect(script).toContain(".question-commit button");
    expect(script).toContain("#/result");
    expect(script).not.toContain("isTencentDocsFormPage");
  });

  it("serializes a route and content monitor script for Tencent forms", () => {
    const script = buildDocumentPageMonitorScript();

    expect(script).toContain(DOCUMENT_PAGE_MONITOR_EVENT);
    expect(script).toContain("MutationObserver");
    expect(script).toContain("pushState");
    expect(script).toContain("replaceState");
    expect(script).toContain("hashchange");
    expect(script).toContain("popstate");
  });

  it("executes the serialized page check script without external helpers", () => {
    const result = runInjectedScript<DocumentPageCheckResult>(buildDocumentPageCheckScript(), {
      window: {
        location: {
          href: "https://docs.qq.com/form/page/DRVJjUlVsTkpoaG9K#/fill",
          hash: "#/fill",
          pathname: "/form/page/DRVJjUlVsTkpoaG9K"
        }
      },
      document: {
        body: { textContent: "测试表单" },
        querySelectorAll: (selector: string) => selector === ".question-main-content" ? [{}, {}] : [],
        querySelector: (selector: string) => selector === ".question-commit button" ? { textContent: "提交" } : null
      }
    });

    expect(result).toMatchObject({
      ok: true,
      pageKind: "form",
      questionCount: 2,
      hasSubmitButton: true
    });
  });

  it("executes the serialized scan script without external helpers", () => {
    const result = runInjectedScript<DocumentRunResult>(buildDocumentScanScript(), {
      document: {
        querySelectorAll: (selector: string) => selector === ".question-main-content"
          ? [
              createQuestionNode({
                title: "01 测试输入",
                textAreas: [{}],
                radioOptions: [],
                checkboxOptions: []
              }),
              createQuestionNode({
                title: "02 测试选择",
                textAreas: [],
                radioOptions: [{ textContent: "A" }, { textContent: "B" }],
                checkboxOptions: []
              })
            ]
          : []
      }
    });

    expect(result.ok).toBe(true);
    expect(result.questions).toMatchObject([
      { questionNumber: 1, type: "textArea", title: "01 测试输入", optionCount: 0 },
      { questionNumber: 2, type: "radio", title: "02 测试选择", optionCount: 2, options: ["A", "B"] }
    ]);
  });

  it("executes the serialized update script and keeps the running mode isolated", () => {
    const state = {
      stopped: false,
      request: {
        mode: "scheduled-confirm",
        targetEpochMs: 100,
        offsetMs: 0,
        pollingIntervalMs: 50,
        confirmAfterSubmit: true,
        fillRules: []
      },
      revision: 0
    };
    const result = runInjectedScript<DocumentRunResult>(buildDocumentUpdateScript({
      mode: "await-fill-submit",
      targetEpochMs: 0,
      offsetMs: 10,
      pollingIntervalMs: 80,
      confirmAfterSubmit: false,
      fillRules: [{ questionIndex: 0, type: "textArea", value: "新的内容" }]
    }), {
      window: { __chatSundialAutoSubmit: state }
    });

    expect(result).toMatchObject({ ok: true, message: "运行配置已更新" });
    expect(state.request).toMatchObject({
      mode: "scheduled-confirm",
      pollingIntervalMs: 80,
      fillRules: [{ questionIndex: 0, type: "textArea", value: "新的内容" }]
    });
    expect(state.revision).toBe(1);
  });
});

/** 在最小浏览器环境中执行序列化后的 webview 注入脚本，验证脚本不依赖模块作用域。 */
function runInjectedScript<T>(
  script: string,
  globals: {
    window?: Record<string, unknown>;
    document?: Record<string, unknown>;
    console?: Console;
    MutationObserver?: typeof MutationObserver;
  }
) {
  const execute = new Function(
    "window",
    "document",
    "URL",
    "MutationObserver",
    "console",
    `return ${script};`
  );

  return execute(
    globals.window ?? {},
    globals.document ?? {},
    URL,
    globals.MutationObserver,
    globals.console ?? console
  ) as T;
}

/** 创建最小题目节点，供扫描脚本测试识别文本框、单选和多选。 */
function createQuestionNode({
  title,
  textAreas,
  radioOptions,
  checkboxOptions
}: {
  title: string;
  textAreas: unknown[];
  radioOptions: Array<{ textContent: string }>;
  checkboxOptions: Array<{ textContent: string }>;
}) {
  return {
    textContent: title,
    getElementsByTagName: (tagName: string) => tagName === "textarea" ? textAreas : [],
    querySelector: (selector: string) => selector.includes("question-title") ? { textContent: title } : null,
    querySelectorAll: (selector: string) => {
      if (selector === ".form-choice-radio-option") {
        return radioOptions;
      }

      if (selector === ".form-choice-checkbox-option") {
        return checkboxOptions;
      }

      return [];
    }
  };
}
