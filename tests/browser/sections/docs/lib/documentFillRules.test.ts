import { describe, expect, it } from "vitest";
import { normalizeDocumentFillRules, shouldToggleChoiceOption } from "@/sections/docs/lib/documentFillRules";

describe("document fill rule helpers", () => {
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
});
