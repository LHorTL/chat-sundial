import { describe, expect, it } from "vitest";
import { buildDocumentRunRequest } from "@/sections/docs/lib/runtime/automation";

describe("document automation request builder", () => {
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
});
