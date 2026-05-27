import { describe, expect, it } from "vitest";
import { buildDocumentTaskRegistration, createDefaultDocumentTask, loadDocumentTasks } from "./documentTaskRegistration";

describe("document task registration", () => {
  it("does not synthesize a saved task before the user saves or starts one", () => {
    expect(loadDocumentTasks()).toEqual([]);
  });

  it("creates new document tasks with an empty url by default", () => {
    expect(createDefaultDocumentTask(1).url).toBe("");
  });

  it("maps current document settings into a global task item", () => {
    const sourceTask = {
      ...createDefaultDocumentTask(1),
      id: "docs-demo",
      name: "报名收集表",
      url: "https://docs.qq.com/form/page/demo#/fill-detail",
      mode: "scheduled-confirm" as const,
      confirmAfterSubmit: false,
      status: "running" as const,
      message: "",
      logs: [{ time: "2026-05-27T05:00:00.000Z", message: "任务开始" }],
      fillRules: [
        { id: "a", enabled: true, questionNumber: 1, type: "textArea" as const, value: "测试" },
        { id: "b", enabled: false, questionNumber: 2, type: "radio" as const, value: "0" }
      ]
    };

    const task = buildDocumentTaskRegistration(sourceTask);

    expect(task).toMatchObject({
      id: "docs-submit-docs-demo",
      section: "docs",
      kind: "docs-submit",
      title: "报名收集表",
      status: "running",
      statusLabel: "运行中",
      primary: "等待到点确认提交",
      secondary: "https://docs.qq.com/form/page/demo#/fill-detail",
      meta: ["到点确认提交", "1 条填充规则", "到点确认"]
    });
    expect(task.updatedAt).toBe(new Date("2026-05-27T05:00:00.000Z").getTime());
  });

  it("keeps loading and running document tasks visually distinct", () => {
    const loadingTask = buildDocumentTaskRegistration({
      ...createDefaultDocumentTask(1),
      status: "loading",
      message: "网页加载中"
    });
    const runningTask = buildDocumentTaskRegistration({
      ...createDefaultDocumentTask(1),
      status: "running",
      message: "任务运行中"
    });

    expect(loadingTask).toMatchObject({ status: "waiting", statusLabel: "加载中" });
    expect(runningTask).toMatchObject({ status: "running", statusLabel: "运行中" });
  });
});
