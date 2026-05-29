import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDocumentTaskRegistration,
  createDefaultDocumentTask,
  DOCUMENT_TASKS_STORAGE_KEY,
  loadDocumentTasks,
  saveDocumentTasks
} from "@/sections/docs/lib/task/registration";

describe("document task registration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it("restores persisted document tasks as static idle tasks", () => {
    const restoredTasks = loadTasksFromStorage([
      createDefaultDocumentTask(1, { id: "running-task", status: "running", message: "任务运行中" }),
      createDefaultDocumentTask(2, { id: "loading-task", status: "loading", message: "网页加载中" }),
      createDefaultDocumentTask(3, { id: "success-task", status: "success", message: "提交任务已完成" }),
      createDefaultDocumentTask(4, { id: "error-task", status: "error", message: "提交时间不能早于当前时间" }),
      createDefaultDocumentTask(5, { id: "stopped-task", status: "stopped", message: "任务已停止" }),
      createDefaultDocumentTask(6, { id: "ready-task", status: "ready", message: "当前是填写页，检测到 2 个题目" })
    ]);

    expect(restoredTasks.find((task) => task.id === "running-task")).toMatchObject({
      status: "idle",
      message: "等待配置并加载网页",
      logs: []
    });
    expect(restoredTasks.find((task) => task.id === "loading-task")).toMatchObject({
      status: "idle",
      message: "等待配置并加载网页",
      logs: []
    });
    expect(restoredTasks.find((task) => task.id === "success-task")).toMatchObject({ status: "idle", message: "等待配置并加载网页", logs: [] });
    expect(restoredTasks.find((task) => task.id === "error-task")).toMatchObject({ status: "idle", message: "等待配置并加载网页", logs: [] });
    expect(restoredTasks.find((task) => task.id === "stopped-task")).toMatchObject({ status: "idle", message: "等待配置并加载网页", logs: [] });
    expect(restoredTasks.find((task) => task.id === "ready-task")).toMatchObject({ status: "idle", message: "等待配置并加载网页", logs: [] });
  });

  it("persists only durable document task configuration", () => {
    const persisted = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => persisted.get(key) ?? null,
        setItem: (key: string, value: string) => {
          persisted.set(key, value);
        }
      }
    });

    saveDocumentTasks([
      createDefaultDocumentTask(1, {
        id: "running-task",
        status: "running",
        message: "任务运行中",
        logs: [{ time: "2026-05-27T05:00:00.000Z", message: "任务开始" }]
      })
    ]);

    const raw = JSON.parse(persisted.get(DOCUMENT_TASKS_STORAGE_KEY) || "[]") as Array<Record<string, unknown>>;
    expect(raw[0]).toMatchObject({ id: "running-task", name: "文档任务 1" });
    expect(raw[0]).not.toHaveProperty("status");
    expect(raw[0]).not.toHaveProperty("message");
    expect(raw[0]).not.toHaveProperty("logs");
  });
});

/** 把给定任务数组写入测试 localStorage 后执行加载流程。 */
function loadTasksFromStorage(tasks: unknown[]) {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => key === DOCUMENT_TASKS_STORAGE_KEY ? JSON.stringify(tasks) : null,
      setItem: () => undefined
    }
  });

  return loadDocumentTasks();
}
