import { Button, Card, Tag, Typography } from "@fangxinyan/lumina";
import { EmptyText } from "@/components/page";
import type { CountdownTask } from "../lib/onebot";
import { countdownTaskStatusLabel, countdownTaskStatusTone, describeCountdownTaskTime } from "../lib/qqViewModel";

interface CountdownTaskListProps {
  tasks: CountdownTask[];
  onRemoveTask: (id: string) => void;
}

/** 渲染倒计时任务队列和删除操作。 */
export function CountdownTaskList({ tasks, onRemoveTask }: CountdownTaskListProps) {
  return (
    <Card title="任务队列" description="等待任务会自动执行，失败任务由你手动处理" bodyLayout="stack">
      {tasks.length === 0 ? (
        <EmptyText>暂无倒计时任务</EmptyText>
      ) : (
        <div className="item-list">
          {tasks.map((task) => (
            <div className="item-card" key={task.id}>
              <div>
                <div className="item-title">
                  <strong>{task.name}</strong>
                  <CountdownTaskStatus status={task.status} />
                </div>
                <Typography.Text type="secondary">
                  {task.recipientType === "group" ? "群聊" : "私聊"} {task.targetId} · {describeCountdownTaskTime(task)}
                </Typography.Text>
                {task.lastError && <p className="error-text">{task.lastError}</p>}
              </div>
              <Button size="sm" variant="ghost" icon="trash" onClick={() => onRemoveTask(task.id)}>
                删除
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** 渲染倒计时任务当前发送状态。 */
function CountdownTaskStatus({ status }: { status: CountdownTask["status"] }) {
  return <Tag tone={countdownTaskStatusTone(status)}>{countdownTaskStatusLabel(status)}</Tag>;
}
