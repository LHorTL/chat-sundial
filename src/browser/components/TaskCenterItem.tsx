import { Tag } from "@fangxinyan/lumina";
import type { GlobalTaskRegistration } from "@/lib/globalTask";
import {
  formatLogTime,
  formatRemaining,
  sectionLabel,
  statusTone,
  taskKindLabel
} from "./TaskCenterViewModel";

interface TaskCenterItemProps {
  task: GlobalTaskRegistration;
  now: Date;
}

/** 渲染任务中心中的单个任务卡片，负责状态、元信息和最近日志展示。 */
export function TaskCenterItem({ task, now }: TaskCenterItemProps) {
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
