import { describe, expect, it } from "vitest";
import { buildDocumentRunRequest } from "@/sections/docs/lib/runtime/automation";
import { parseDocumentTargetTime, validateDocumentRunStartTime } from "@/sections/docs/lib/task/time";

describe("document time helpers", () => {
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
});
