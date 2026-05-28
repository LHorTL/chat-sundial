import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Tag, Typography } from "@fangxinyan/lumina";

export type GlobalTaskSection = "qq" | "docs";
export type GlobalTaskKind = "qq-countdown" | "qq-monitor" | "docs-submit";
export type GlobalTaskStatus = "idle" | "waiting" | "running" | "success" | "error" | "stopped" | "disabled";

export interface GlobalTaskLog {
  time: string;
  message: string;
}

export interface GlobalTaskRegistration {
  id: string;
  section: GlobalTaskSection;
  kind: GlobalTaskKind;
  title: string;
  status: GlobalTaskStatus;
  statusLabel: string;
  primary: string;
  secondary?: string;
  meta?: string[];
  logs?: GlobalTaskLog[];
  countdownTargetMs?: number;
  updatedAt?: number;
}

interface TaskCenterProps {
  tasks: GlobalTaskRegistration[];
  now: Date;
}

type TaskCenterDockSide = "left" | "right";

interface TaskCenterDock {
  side: TaskCenterDockSide;
  y: number;
}

interface TaskCenterDragPosition {
  x: number;
  y: number;
}

interface TaskCenterDragContext {
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  moved: boolean;
}

const TASK_CENTER_DOCK_STORAGE_KEY = "chat-sundial:task-center-dock";
const TASK_CENTER_BUTTON_SIZE = 44;
const TASK_CENTER_HIDDEN_OFFSET = TASK_CENTER_BUTTON_SIZE / 2;
const TASK_CENTER_TOP_GUARD = 62;
const TASK_CENTER_BOTTOM_GUARD = 42;
const TASK_CENTER_EDGE_GAP = 52;

export function TaskCenter({ tasks, now }: TaskCenterProps) {
  const [open, setOpen] = useState(false);
  const [viewport, setViewport] = useState(() => getViewportSize());
  const [dock, setDock] = useState<TaskCenterDock>(() => loadTaskCenterDock());
  const [dragPosition, setDragPosition] = useState<TaskCenterDragPosition | null>(null);
  const [peek, setPeek] = useState(false);
  const dragRef = useRef<TaskCenterDragContext | null>(null);
  const ignoreNextClickRef = useRef(false);
  const sortedTasks = useMemo(() => [...tasks].sort(compareTasks), [tasks]);
  const attentionCount = sortedTasks.filter((task) => task.status === "waiting" || task.status === "running" || task.status === "error").length;
  const rootStyle = getTaskCenterRootStyle(dock, dragPosition);
  const panelStyle = getTaskCenterPanelStyle(dock, viewport);

  useEffect(() => {
    if (!open) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  useEffect(() => {
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
      const side: TaskCenterDockSide = nextX + TASK_CENTER_BUTTON_SIZE / 2 < nextViewport.width / 2 ? "left" : "right";
      setViewport(nextViewport);
      setDock(normalizeDock({ side, y: nextY }, nextViewport));
      setDragPosition(null);
      setPeek(false);
      ignoreNextClickRef.current = context.moved;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const handleButtonClick = () => {
    if (ignoreNextClickRef.current) {
      ignoreNextClickRef.current = false;
      return;
    }

    setOpen((current) => !current);
  };

  return (
    <div
      className={`task-center-root dock-${dock.side} ${open ? "open" : ""} ${peek ? "peek" : ""} ${dragPosition ? "dragging" : ""}`}
      style={rootStyle}
      onPointerEnter={() => setPeek(true)}
      onPointerLeave={() => setPeek(false)}
    >
      {open && (
        <section className="task-center-panel" style={panelStyle} aria-label="全局任务中心">
          <div className="task-center-head">
            <div>
              <Typography.Text strong>任务中心</Typography.Text>
              <Typography.Text type="secondary">QQ 与文档任务统一展示</Typography.Text>
            </div>
            <Tag tone={attentionCount > 0 ? "warning" : "neutral"} dot>
              {sortedTasks.length} 项
            </Tag>
          </div>

          {sortedTasks.length === 0 ? (
            <div className="task-center-empty">暂无注册任务</div>
          ) : (
            <div className="task-center-list">
              {sortedTasks.map((task) => (
                <TaskCenterItem task={task} now={now} key={task.id} />
              ))}
            </div>
          )}
        </section>
      )}

      <button
        className={`task-center-button ${open ? "open" : ""}`}
        type="button"
        aria-label={open ? "关闭任务中心" : "打开任务中心"}
        aria-expanded={open}
        onPointerDown={handlePointerDown}
        onClick={handleButtonClick}
      >
        <span className="task-center-glyph" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        {attentionCount > 0 && <span className="task-center-badge">{attentionCount}</span>}
      </button>
    </div>
  );
}

function getViewportSize() {
  if (typeof window === "undefined") {
    return { width: 1280, height: 820 };
  }

  return { width: window.innerWidth, height: window.innerHeight };
}

function loadTaskCenterDock(): TaskCenterDock {
  const viewport = getViewportSize();
  const fallback = normalizeDock({ side: "left", y: viewport.height - TASK_CENTER_BUTTON_SIZE - 88 }, viewport);

  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(TASK_CENTER_DOCK_STORAGE_KEY);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw) as Partial<TaskCenterDock>;
    if ((parsed.side === "left" || parsed.side === "right") && Number.isFinite(parsed.y)) {
      return normalizeDock({ side: parsed.side, y: Number(parsed.y) }, viewport);
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function saveTaskCenterDock(dock: TaskCenterDock) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(TASK_CENTER_DOCK_STORAGE_KEY, JSON.stringify(dock));
  } catch {
    // Position persistence is a convenience only.
  }
}

function normalizeDock(dock: TaskCenterDock, viewport: { width: number; height: number }): TaskCenterDock {
  return {
    side: dock.side,
    y: clamp(dock.y, TASK_CENTER_TOP_GUARD, viewport.height - TASK_CENTER_BUTTON_SIZE - TASK_CENTER_BOTTOM_GUARD)
  };
}

function getTaskCenterRootStyle(dock: TaskCenterDock, dragPosition: TaskCenterDragPosition | null): CSSProperties {
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

function getTaskCenterPanelStyle(dock: TaskCenterDock, viewport: { width: number; height: number }): CSSProperties {
  const maxHeight = Math.min(620, viewport.height - 128);
  const estimatedPanelHeight = Math.min(420, maxHeight);
  const spaceBelow = viewport.height - (dock.y + TASK_CENTER_BUTTON_SIZE) - TASK_CENTER_BOTTOM_GUARD;
  const spaceAbove = dock.y - TASK_CENTER_TOP_GUARD;
  const preferredTop = spaceBelow >= estimatedPanelHeight || spaceBelow >= spaceAbove
    ? dock.y - 12
    : dock.y + TASK_CENTER_BUTTON_SIZE - estimatedPanelHeight + 12;
  const top = clamp(
    preferredTop,
    TASK_CENTER_TOP_GUARD,
    viewport.height - estimatedPanelHeight - TASK_CENTER_BOTTOM_GUARD
  );

  return dock.side === "left"
    ? { left: TASK_CENTER_EDGE_GAP, top, maxHeight }
    : { right: TASK_CENTER_EDGE_GAP, top, maxHeight };
}

function TaskCenterItem({ task, now }: { task: GlobalTaskRegistration; now: Date }) {
  const livePrimary = task.countdownTargetMs && (task.status === "waiting" || task.status === "running")
    ? `剩余 ${formatRemaining(task.countdownTargetMs - now.getTime())}`
    : task.primary;
  const latestLogs = task.logs?.slice(-3).reverse() ?? [];

  return (
    <article className="task-center-item">
      <div className="task-center-item__top">
        <span className={`task-kind-icon ${task.kind}`} aria-hidden="true">{taskKindLabel(task.kind)}</span>
        <div>
          <strong>{task.title}</strong>
          <span>{task.secondary || sectionLabel(task.section)}</span>
        </div>
        <Tag tone={statusTone(task.status)} dot>{task.statusLabel}</Tag>
      </div>

      <div className="task-center-primary">{livePrimary}</div>

      {task.meta?.length ? (
        <div className="task-center-meta">
          {task.meta.map((item) => <span key={item}>{item}</span>)}
        </div>
      ) : null}

      {latestLogs.length > 0 && (
        <div className="task-center-logs">
          {latestLogs.map((log) => (
            <div key={`${task.id}-${log.time}-${log.message}`}>
              <time>{formatLogTime(log.time)}</time>
              <span>{log.message}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function compareTasks(left: GlobalTaskRegistration, right: GlobalTaskRegistration) {
  const statusDelta = statusWeight(right.status) - statusWeight(left.status);
  if (statusDelta !== 0) {
    return statusDelta;
  }

  return (right.updatedAt ?? 0) - (left.updatedAt ?? 0);
}

function statusWeight(status: GlobalTaskStatus) {
  if (status === "error") return 5;
  if (status === "running") return 4;
  if (status === "waiting") return 3;
  if (status === "success") return 2;
  if (status === "stopped") return 1;
  return 0;
}

function statusTone(status: GlobalTaskStatus) {
  if (status === "success") return "success";
  if (status === "error") return "danger";
  if (status === "waiting" || status === "running") return "warning";
  if (status === "stopped" || status === "disabled") return "neutral";
  return "accent";
}

function taskKindLabel(kind: GlobalTaskKind) {
  if (kind === "qq-countdown") return "计";
  if (kind === "qq-monitor") return "监";
  return "文";
}

function sectionLabel(section: GlobalTaskSection) {
  return section === "qq" ? "QQ 板块" : "文档板块";
}

function formatRemaining(value: number) {
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

function formatLogTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
