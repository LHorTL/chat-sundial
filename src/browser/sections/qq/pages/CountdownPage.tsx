import { PageHeading } from "@/components/page";
import { CountdownTaskForm } from "../components/CountdownTaskForm";
import { CountdownTaskList } from "../components/CountdownTaskList";
import type { CountdownTask, OneBotGroupInfo } from "../lib/onebot";

interface CountdownPageProps {
  tasks: CountdownTask[];
  groups: OneBotGroupInfo[];
  groupsLoading: boolean;
  groupsError: string;
  onCreateTask: (task: CountdownTask) => void;
  onRemoveTask: (id: string) => void;
}

/** 编排倒计时发送页面的创建表单和任务队列。 */
export function CountdownPage({ tasks, groups, groupsLoading, groupsError, onCreateTask, onRemoveTask }: CountdownPageProps) {
  return (
    <div className="page">
      <PageHeading
        title="倒计时发送"
        description="选定一个时间，或开启一个倒计时，到点后通过 OneBot 发送指定群聊或私聊消息。"
      />

      <div className="page-grid">
        <CountdownTaskForm
          groups={groups}
          groupsLoading={groupsLoading}
          groupsError={groupsError}
          onCreateTask={onCreateTask}
        />
        <CountdownTaskList tasks={tasks} onRemoveTask={onRemoveTask} />
      </div>
    </div>
  );
}
