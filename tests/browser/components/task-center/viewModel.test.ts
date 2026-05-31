import { describe, expect, it } from "vitest";
import {
  getDockSide,
  getTaskCenterPanelStyle,
  isAttentionTask,
  normalizeDock,
  TASK_CENTER_BOTTOM_GUARD,
  TASK_CENTER_BUTTON_SIZE,
  TASK_CENTER_TOP_GUARD
} from "@/components/task-center/viewModel";

describe("TaskCenterViewModel", () => {
  it("chooses the nearest horizontal dock side", () => {
    expect(getDockSide(120, 1000)).toBe("left");
    expect(getDockSide(720, 1000)).toBe("right");
  });

  it("clamps dock y between top and bottom guards", () => {
    const viewport = { width: 1000, height: 800 };

    expect(normalizeDock({ side: "left", y: -100 }, viewport)).toEqual({
      side: "left",
      y: TASK_CENTER_TOP_GUARD
    });
    expect(normalizeDock({ side: "right", y: 9999 }, viewport)).toEqual({
      side: "right",
      y: viewport.height - TASK_CENTER_BUTTON_SIZE - TASK_CENTER_BOTTOM_GUARD
    });
  });

  it("keeps the panel inside the viewport", () => {
    const viewport = { width: 1000, height: 640 };
    const topPanel = getTaskCenterPanelStyle({ side: "left", y: 70 }, viewport);
    const bottomPanel = getTaskCenterPanelStyle({ side: "right", y: 560 }, viewport);

    expect(topPanel).toMatchObject({ left: 52 });
    expect(topPanel.top).toBeGreaterThanOrEqual(TASK_CENTER_TOP_GUARD);
    expect(Number(topPanel.top) + Number(topPanel.maxHeight)).toBeLessThanOrEqual(viewport.height - TASK_CENTER_BOTTOM_GUARD);
    expect(bottomPanel).toMatchObject({ right: 52 });
    expect(bottomPanel.top).toBeGreaterThanOrEqual(TASK_CENTER_TOP_GUARD);
    expect(Number(bottomPanel.top) + Number(bottomPanel.maxHeight)).toBeLessThanOrEqual(viewport.height - TASK_CENTER_BOTTOM_GUARD);
  });

  it("marks only waiting, running and error tasks as attention tasks", () => {
    expect(isAttentionTask({ status: "waiting" })).toBe(true);
    expect(isAttentionTask({ status: "running" })).toBe(true);
    expect(isAttentionTask({ status: "error" })).toBe(true);
    expect(isAttentionTask({ status: "success" })).toBe(false);
    expect(isAttentionTask({ status: "stopped" })).toBe(false);
    expect(isAttentionTask({ status: "idle" })).toBe(false);
  });
});
