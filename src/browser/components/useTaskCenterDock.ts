import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { saveTaskCenterDock, type TaskCenterDock } from "./TaskCenterStorage";
import {
  clamp,
  createInitialTaskCenterDock,
  getDockSide,
  getTaskCenterPanelStyle,
  getTaskCenterRootStyle,
  getViewportSize,
  normalizeDock,
  TASK_CENTER_BOTTOM_GUARD,
  TASK_CENTER_BUTTON_SIZE,
  TASK_CENTER_TOP_GUARD,
  type TaskCenterDragContext,
  type TaskCenterDragPosition
} from "./TaskCenterViewModel";

export interface TaskCenterDockState {
  open: boolean;
  peek: boolean;
  dock: TaskCenterDock;
  dragPosition: TaskCenterDragPosition | null;
  viewport: { width: number; height: number };
  rootStyle: CSSProperties;
  panelStyle: CSSProperties;
  rootClassName: string;
  setPeek(nextPeek: boolean): void;
  handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>): void;
  handleButtonClick(): void;
}

/** 管理任务中心浮层开合、拖拽吸附、视口约束和位置持久化。 */
export function useTaskCenterDock(): TaskCenterDockState {
  const [open, setOpen] = useState(false);
  const [viewport, setViewport] = useState(() => getViewportSize());
  const [dock, setDock] = useState<TaskCenterDock>(() => createInitialTaskCenterDock());
  const [dragPosition, setDragPosition] = useState<TaskCenterDragPosition | null>(null);
  const [peek, setPeek] = useState(false);
  const dragRef = useRef<TaskCenterDragContext | null>(null);
  const ignoreNextClickRef = useRef(false);
  const rootStyle = getTaskCenterRootStyle(dock, dragPosition);
  const panelStyle = getTaskCenterPanelStyle(dock, viewport);
  const rootClassName = `task-center-root dock-${dock.side} ${open ? "open" : ""} ${peek ? "peek" : ""} ${dragPosition ? "dragging" : ""}`;

  useEffect(() => {
    if (!open) {
      return;
    }

    /** 按 Escape 时关闭任务中心浮层。 */
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  useEffect(() => {
    /** 窗口尺寸变化后重新约束浮层吸附位置。 */
    const handleResize = () => {
      const nextViewport = getViewportSize();
      setViewport(nextViewport);
      setDock((current) => normalizeDock(current, nextViewport));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    saveTaskCenterDock(dock);
  }, [dock]);

  /** 记录浮层拖拽起点，并在释放时吸附到最近边缘。 */
  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }

    const root = event.currentTarget.closest(".task-center-root");
    const rect = root?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    dragRef.current = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    };
    setDragPosition({ x: rect.left, y: rect.top });

    /** 拖拽过程中更新浮层临时位置。 */
    const handlePointerMove = (moveEvent: PointerEvent) => {
      const context = dragRef.current;
      if (!context) {
        return;
      }

      const deltaX = moveEvent.clientX - context.startX;
      const deltaY = moveEvent.clientY - context.startY;
      if (!context.moved && Math.hypot(deltaX, deltaY) > 4) {
        context.moved = true;
        setOpen(false);
        setPeek(false);
      }

      const nextViewport = getViewportSize();
      const nextX = clamp(moveEvent.clientX - context.offsetX, 8, nextViewport.width - TASK_CENTER_BUTTON_SIZE - 8);
      const nextY = clamp(
        moveEvent.clientY - context.offsetY,
        TASK_CENTER_TOP_GUARD,
        nextViewport.height - TASK_CENTER_BUTTON_SIZE - TASK_CENTER_BOTTOM_GUARD
      );
      setViewport(nextViewport);
      setDragPosition({ x: nextX, y: nextY });
    };

    /** 拖拽结束后吸附边缘，并避免释放时误触点击。 */
    const handlePointerUp = (upEvent: PointerEvent) => {
      const context = dragRef.current;
      dragRef.current = null;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);

      if (!context) {
        setDragPosition(null);
        return;
      }

      const nextViewport = getViewportSize();
      const nextX = clamp(upEvent.clientX - context.offsetX, 8, nextViewport.width - TASK_CENTER_BUTTON_SIZE - 8);
      const nextY = clamp(
        upEvent.clientY - context.offsetY,
        TASK_CENTER_TOP_GUARD,
        nextViewport.height - TASK_CENTER_BUTTON_SIZE - TASK_CENTER_BOTTOM_GUARD
      );
      const side = getDockSide(nextX, nextViewport.width);
      setViewport(nextViewport);
      setDock(normalizeDock({ side, y: nextY }, nextViewport));
      setDragPosition(null);
      setPeek(false);
      ignoreNextClickRef.current = context.moved;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  /** 切换任务中心开合状态，拖拽后的释放点击会被忽略一次。 */
  const handleButtonClick = () => {
    if (ignoreNextClickRef.current) {
      ignoreNextClickRef.current = false;
      return;
    }

    setOpen((current) => !current);
  };

  return {
    open,
    peek,
    dock,
    dragPosition,
    viewport,
    rootStyle,
    panelStyle,
    rootClassName,
    setPeek,
    handlePointerDown,
    handleButtonClick
  };
}
