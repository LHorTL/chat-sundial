import { describe, expect, it } from "vitest";
import {
  buildDocumentPageCheckScript,
  buildDocumentPageMonitorScript,
  buildDocumentRequiredCheckScript,
  buildDocumentRunRequest,
  buildDocumentRunScript,
  buildDocumentUpdateScript,
  DOCUMENT_PAGE_MONITOR_EVENT,
  normalizeDocumentFillRules,
  parseDocumentTargetTime,
  resolveDocumentPageState,
  shouldToggleChoiceOption,
  validateDocumentRunStartTime
} from "./documentAutomation";

describe("document automation helpers", () => {
  it("converts enabled UI fill rows into zero-based script rules", () => {
    expect(
      normalizeDocumentFillRules([
        { id: "a", enabled: true, questionNumber: 1, type: "textArea", value: "测试输入" },
        { id: "b", enabled: true, questionNumber: 2, type: "radio", value: "1" },
        { id: "c", enabled: true, questionNumber: 3, type: "checkBox", value: "0, 2" },
        { id: "d", enabled: false, questionNumber: 4, type: "textArea", value: "跳过" }
      ])
    ).toEqual([
      { questionIndex: 0, type: "textArea", value: "测试输入" },
      { questionIndex: 1, type: "radio", value: 1 },
      { questionIndex: 2, type: "checkBox", value: [0, 2] }
    ]);
  });

  it("accepts JSON-style checkbox values and rejects invalid option indexes", () => {
    expect(
      normalizeDocumentFillRules([
        { id: "c", enabled: true, questionNumber: 3, type: "checkBox", value: "[0,1]" }
      ])
    ).toEqual([{ questionIndex: 2, type: "checkBox", value: [0, 1] }]);

    expect(() =>
      normalizeDocumentFillRules([
        { id: "bad", enabled: true, questionNumber: 1, type: "radio", value: "-1" }
      ])
    ).toThrow("选项序号必须是非负整数");
  });

  it("only toggles checkbox options whose current state differs from the configured answer", () => {
    const targetIndexes = [0, 2];

    expect(shouldToggleChoiceOption(true, 0, targetIndexes)).toBe(false);
    expect(shouldToggleChoiceOption(false, 0, targetIndexes)).toBe(true);
    expect(shouldToggleChoiceOption(true, 1, targetIndexes)).toBe(true);
    expect(shouldToggleChoiceOption(false, 1, targetIndexes)).toBe(false);
  });

  it("parses target date and time with second precision", () => {
    expect(parseDocumentTargetTime("2026-05-27", "14:11:00")).toBe(new Date(2026, 4, 27, 14, 11, 0).getTime());
    expect(() => parseDocumentTargetTime("2026-05-27", "14:61:00")).toThrow("提交时间无效");
  });

  it("rejects calendar dates that JavaScript would silently normalize", () => {
    expect(() => parseDocumentTargetTime("2026-02-31", "14:11:00")).toThrow("提交日期无效");
    expect(() => parseDocumentTargetTime("2026-04-31", "14:11:00")).toThrow("提交日期无效");
  });

  it("rejects scheduled submit times earlier than now", () => {
    const request = buildDocumentRunRequest({
      mode: "scheduled-confirm",
      date: "2026-05-27",
      time: "14:11:00",
      offsetMs: 0,
      pollingIntervalMs: 50,
      confirmAfterSubmit: true,
      fillRules: []
    });

    expect(() => validateDocumentRunStartTime(request, new Date(2026, 4, 27, 14, 11, 1).getTime())).toThrow("提交时间不能早于当前时间");
    expect(() => validateDocumentRunStartTime(request, new Date(2026, 4, 27, 14, 10, 59).getTime())).not.toThrow();
  });

  it("maps UI config into a script run request", () => {
    const request = buildDocumentRunRequest({
      mode: "await-fill-submit",
      date: "",
      time: "",
      offsetMs: 120,
      pollingIntervalMs: 10,
      confirmAfterSubmit: true,
      fillRules: [
        { id: "a", enabled: true, questionNumber: 1, type: "textArea", value: "测试输入" }
      ]
    });

    expect(request).toMatchObject({
      mode: "await-fill-submit",
      targetEpochMs: 0,
      offsetMs: 0,
      pollingIntervalMs: 20,
      confirmAfterSubmit: true,
      fillRules: [{ questionIndex: 0, type: "textArea", value: "测试输入" }]
    });
  });

  it("keeps scheduled confirmation date-only and ignores fill rows", () => {
    const request = buildDocumentRunRequest({
      mode: "scheduled-confirm",
      date: "2026-05-27",
      time: "14:11:00",
      offsetMs: 120,
      pollingIntervalMs: 50,
      confirmAfterSubmit: false,
      fillRules: [
        { id: "a", enabled: true, questionNumber: 1, type: "textArea", value: "测试输入" }
      ]
    });

    expect(request).toMatchObject({
      mode: "scheduled-confirm",
      targetEpochMs: new Date(2026, 4, 27, 14, 11, 0).getTime(),
      offsetMs: 120,
      confirmAfterSubmit: true,
      fillRules: []
    });
  });

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

  it("does not expose a manual-test submit mode", () => {
    const request = buildDocumentRunRequest({
      mode: "await-fill-submit",
      date: "",
      time: "",
      offsetMs: 0,
      pollingIntervalMs: 50,
      confirmAfterSubmit: false,
      fillRules: []
    });

    expect(request.mode).not.toBe("manual-test");
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

  it("detects creator result pages and asks the user to switch to the fill page", () => {
    const result = resolveDocumentPageState({
      href: "https://docs.qq.com/form/page/DRVJjUlVsTkpoaG9K#/result",
      hash: "#/result",
      pathname: "/form/page/DRVJjUlVsTkpoaG9K",
      questionCount: 0,
      hasSubmitButton: false,
      bodyTextSample: "填写 统计 设置 你已提交62份"
    });

    expect(result).toMatchObject({
      ok: false,
      pageKind: "result"
    });
    expect(result.message).toContain("切换到“填写”");
  });

  it("trusts the actual fill form DOM even when Tencent keeps the result route", () => {
    const result = resolveDocumentPageState({
      href: "https://docs.qq.com/form/page/DRVJjUlVsTkpoaG9K#/result",
      hash: "#/result",
      pathname: "/form/page/DRVJjUlVsTkpoaG9K",
      questionCount: 2,
      hasSubmitButton: true,
      bodyTextSample: "填写 测试输入 提交"
    });

    expect(result).toMatchObject({
      ok: true,
      pageKind: "form",
      message: "当前是填写页，检测到 2 个题目"
    });
  });

  it("detects submitted fill-detail pages that still render question content", () => {
    const result = resolveDocumentPageState({
      href: "https://docs.qq.com/form/page/DRVJjUlVsTkpoaG9K#/fill-detail",
      hash: "#/fill-detail",
      pathname: "/form/page/DRVJjUlVsTkpoaG9K",
      questionCount: 2,
      hasSubmitButton: false,
      bodyTextSample: "测试 分享填写统计设置你已提交63份测试01测试输入再填一份修改我的结果"
    });

    expect(result).toMatchObject({
      ok: false,
      pageKind: "result"
    });
    expect(result.message).toContain("切换到“填写”");
  });

  it("keeps a fill route without a submit button in loading state before judging it as result", () => {
    const result = resolveDocumentPageState({
      href: "https://docs.qq.com/form/page/DRVJjUlVsTkpoaG9K#/fill",
      hash: "#/fill",
      pathname: "/form/page/DRVJjUlVsTkpoaG9K",
      questionCount: 2,
      hasSubmitButton: false,
      bodyTextSample: "测试 分享填写统计设置你已提交63份测试01测试输入"
    });

    expect(result).toMatchObject({
      ok: false,
      pageKind: "loading"
    });
  });

  it("serializes a page check script with Tencent form selectors", () => {
    const script = buildDocumentPageCheckScript();

    expect(script).toContain(".question-main-content");
    expect(script).toContain(".question-commit button");
    expect(script).toContain("#/result");
  });

  it("serializes a required field check script for scheduled confirmation", () => {
    const script = buildDocumentRequiredCheckScript();

    expect(script).toContain(".question-main-content");
    expect(script).toContain("未填写必填项");
    expect(script).toContain("input");
    expect(script).toContain("textarea");
    expect(script).toContain("input.type !== \"radio\"");
    expect(script).toContain("input.type !== \"checkbox\"");
    expect(script).toContain(".question-content-error");
    expect(script).toContain(".question-content.error");
    expect(script).toContain("该问题为必填");
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
});
