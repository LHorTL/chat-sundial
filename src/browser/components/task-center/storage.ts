import { readJson, writeJson } from "@/lib/storage";

export type TaskCenterDockSide = "left" | "right";

export interface TaskCenterDock {
  side: TaskCenterDockSide;
  y: number;
}

const TASK_CENTER_DOCK_STORAGE_KEY = "chat-sundial:task-center-dock";

/** 读取任务中心悬浮按钮停靠位置，失败时返回调用方计算好的默认位置。 */
export function loadTaskCenterDock(fallback: TaskCenterDock): TaskCenterDock {
  const dock = readJson<Partial<TaskCenterDock>>(TASK_CENTER_DOCK_STORAGE_KEY, fallback);
  if ((dock.side === "left" || dock.side === "right") && Number.isFinite(dock.y)) {
    return { side: dock.side, y: Number(dock.y) };
  }

  return fallback;
}

/** 保存任务中心悬浮按钮停靠位置。 */
export function saveTaskCenterDock(dock: TaskCenterDock) {
  writeJson(TASK_CENTER_DOCK_STORAGE_KEY, dock);
}
