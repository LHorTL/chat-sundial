import { useMemo } from "react";
import { Tag, Typography } from "@fangxinyan/lumina";
import type { GlobalTaskRegistration } from "@/lib/globalTask";
import { TaskCenterItem } from "./Item";
import { compareTasks, isAttentionTask } from "./viewModel";
import { useTaskCenterDock } from "./useDock";

interface TaskCenterProps {
  tasks: GlobalTaskRegistration[];
  now: Date;
}

/** 渲染可拖拽吸附的全局任务中心浮层。 */
export function TaskCenter({ tasks, now }: TaskCenterProps) {
  const dockState = useTaskCenterDock();
  const sortedTasks = useMemo(() => [...tasks].sort(compareTasks), [tasks]);
  const attentionCount = sortedTasks.filter(isAttentionTask).length;

  return (
    <div
      className={dockState.rootClassName}
      style={dockState.rootStyle}
      onPointerEnter={() => dockState.setPeek(true)}
      onPointerLeave={() => dockState.setPeek(false)}
    >
      {dockState.open && (
        <section className="task-center-panel" style={dockState.panelStyle} aria-label="全局任务中心">
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
        className={`task-center-button ${dockState.open ? "open" : ""}`}
        type="button"
        aria-label={dockState.open ? "关闭任务中心" : "打开任务中心"}
        aria-expanded={dockState.open}
        onPointerDown={dockState.handlePointerDown}
        onClick={dockState.handleButtonClick}
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
