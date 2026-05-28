import type { CSSProperties } from "react";
import type { GlobalTaskKind, GlobalTaskRegistration, GlobalTaskSection, GlobalTaskStatus } from "@/lib/globalTask";
import { loadTaskCenterDock, type TaskCenterDock, type TaskCenterDockSide } from "./TaskCenterStorage";

export interface TaskCenterDragPosition {
  x: number;
  y: number;
}

export interface TaskCenterDragContext {
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  moved: boolean;
}

export const TASK_CENTER_BUTTON_SIZE = 44;
export const TASK_CENTER_TOP_GUARD = 62;
export const TASK_CENTER_BOTTOM_GUARD = 42;
export const TASK_CENTER_EDGE_GAP = 52;

const TASK_CENTER_HIDDEN_OFFSET = TASK_CENTER_BUTTON_SIZE / 2;

/** 读取当前视口尺寸，非浏览器环境使用稳定默认值。 */
export function getViewportSize() {
  if (typeof window === "undefined") {
    return { width: 1280, height: 820 };
  }

  return { width: window.innerWidth, height: window.innerHeight };
}

/** 创建并归一化任务中心浮层的初始停靠位置。 */
export function createInitialTaskCenterDock(): TaskCenterDock {
  const viewport = getViewportSize();
  const fallback = normalizeDock({ side: "left", y: viewport.height - TASK_CENTER_BUTTON_SIZE - 88 }, viewport);

  return normalizeDock(loadTaskCenterDock(fallback), viewport);
}

/** 把浮层停靠位置限制在窗口安全区域内。 */
export function normalizeDock(dock: TaskCenterDock, viewport: { width: number; height: number }): TaskCenterDock {
  return {
    side: dock.side,
    y: clamp(dock.y, TASK_CENTER_TOP_GUARD, viewport.height - TASK_CENTER_BUTTON_SIZE - TASK_CENTER_BOTTOM_GUARD)
  };
}

/** 根据拖拽释放位置判断浮层应吸附到左侧还是右侧。 */
export function getDockSide(x: number, viewportWidth: number): TaskCenterDockSide {
  return x + TASK_CENTER_BUTTON_SIZE / 2 < viewportWidth / 2 ? "left" : "right";
}

/** 计算任务中心根节点的吸附或拖拽定位。 */
export function getTaskCenterRootStyle(dock: TaskCenterDock, dragPosition: TaskCenterDragPosition | null): CSSProperties {
  if (dragPosition) {
    return {
      left: dragPosition.x,
      top: dragPosition.y
    };
  }

  if (dock.side === "left") {
    return {
      left: -TASK_CENTER_HIDDEN_OFFSET,
      top: dock.y
    };
  }

  return {
    right: -TASK_CENTER_HIDDEN_OFFSET,
    top: dock.y
  };
}

/** 计算任务中心展开面板的位置，尽量贴近浮层按钮且不越界。 */
export function getTaskCenterPanelStyle(dock: TaskCenterDock, viewport: { width: number; height: number }): CSSProperties {
  const maxHeight = Math.min(420, viewport.height - 128);
  const spaceBelow = viewport.height - (dock.y + TASK_CENTER_BUTTON_SIZE) - TASK_CENTER_BOTTOM_GUARD;
  const spaceAbove = dock.y - TASK_CENTER_TOP_GUARD;
  const preferredTop = spaceBelow >= maxHeight || spaceBelow >= spaceAbove
    ? dock.y - 12
    : dock.y + TASK_CENTER_BUTTON_SIZE - maxHeight + 12;
  const top = clamp(
    preferredTop,
    TASK_CENTER_TOP_GUARD,
    viewport.height - maxHeight - TASK_CENTER_BOTTOM_GUARD
  );

  return dock.side === "left"
    ? { left: TASK_CENTER_EDGE_GAP, top, maxHeight }
    : { right: TASK_CENTER_EDGE_GAP, top, maxHeight };
}

/** 按任务重要程度和更新时间排序。 */
export function compareTasks(left: GlobalTaskRegistration, right: GlobalTaskRegistration) {
  const statusDelta = statusWeight(right.status) - statusWeight(left.status);
  if (statusDelta !== 0) {
    return statusDelta;
  }

  return (right.updatedAt ?? 0) - (left.updatedAt ?? 0);
}

/** 判断任务是否需要在浮层按钮上显示提醒计数。 */
export function isAttentionTask(task: Pick<GlobalTaskRegistration, "status">) {
  return task.status === "waiting" || task.status === "running" || task.status === "error";
}

/** 为不同任务状态提供排序权重。 */
export function statusWeight(status: GlobalTaskStatus) {
  if (status === "error") return 5;
  if (status === "running") return 4;
  if (status === "waiting") return 3;
  if (status === "success") return 2;
  if (status === "stopped") return 1;
  return 0;
}

/** 把任务状态映射为 Lumina Tag 色调。 */
export function statusTone(status: GlobalTaskStatus) {
  if (status === "success") return "success";
  if (status === "error") return "danger";
  if (status === "waiting" || status === "running") return "warning";
  if (status === "stopped" || status === "disabled") return "neutral";
  return "accent";
}

/** 把任务类型映射为圆形短字标识。 */
export function taskKindLabel(kind: GlobalTaskKind) {
  if (kind === "qq-countdown") return "计";
  if (kind === "qq-monitor") return "监";
  return "文";
}

/** 把任务所属板块映射为中文名称。 */
export function sectionLabel(section: GlobalTaskSection) {
  return section === "qq" ? "QQ 板块" : "文档板块";
}

/** 把剩余毫秒数转换为倒计时展示文案。 */
export function formatRemaining(value: number) {
  if (value <= 0) {
    return "已到点";
  }

  const totalSeconds = Math.ceil(value / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}时${pad2(minutes)}分${pad2(seconds)}秒`;
  }

  if (minutes > 0) {
    return `${minutes}分${pad2(seconds)}秒`;
  }

  return `${seconds}秒`;
}

/** 把日志 ISO 时间转换为短时间展示。 */
export function formatLogTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(value));
}

/** 把数值限制在闭区间范围内。 */
export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/** 把数字补齐为两位字符串。 */
function pad2(value: number) {
  return String(value).padStart(2, "0");
}
