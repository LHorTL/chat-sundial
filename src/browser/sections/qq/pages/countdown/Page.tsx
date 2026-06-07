import { PageHeading } from "@/components/page";
import { CountdownTaskForm } from "../../components/countdown/TaskForm";
import { CountdownTaskList } from "../../components/countdown/TaskList";
import { SnowLumaReadinessNotice } from "../../components/snowluma/ReadinessNotice";
import type { CountdownTask, OneBotGroupInfo } from "../../lib/onebot";
import type { SnowLumaAccountSummary, SnowLumaStartMode, SnowLumaStatus } from "../../lib/snowluma";

interface CountdownPageProps {
  tasks: CountdownTask[];
  groups: OneBotGroupInfo[];
  groupsLoading: boolean;
  groupsError: string;
  snowlumaStatus?: SnowLumaStatus;
  snowlumaLoading?: boolean;
  snowlumaAccounts?: SnowLumaAccountSummary[];
  snowlumaAccountsLoading?: boolean;
  selectedSnowLumaAccountUin?: string;
  onCreateTask: (task: CountdownTask) => void;
  onRemoveTask: (id: string) => void;
  onInitializeSnowLuma?: () => void;
  onStartSnowLuma?: (mode: SnowLumaStartMode) => void;
  onStopSnowLuma?: () => void;
  onOpenQqDownloadUrl?: () => void;
  onSelectSnowLumaAccount?: (uin: string) => void;
}

/** 编排倒计时发送页面的创建表单和任务队列。 */
export function CountdownPage({
  tasks,
  groups,
  groupsLoading,
  groupsError,
  snowlumaStatus,
  snowlumaLoading = false,
  snowlumaAccounts = [],
  snowlumaAccountsLoading = false,
  selectedSnowLumaAccountUin = "",
  onCreateTask,
  onRemoveTask,
  onInitializeSnowLuma,
  onStartSnowLuma,
  onStopSnowLuma,
  onOpenQqDownloadUrl,
  onSelectSnowLumaAccount
}: CountdownPageProps) {
  const readinessNotice = snowlumaStatus && onInitializeSnowLuma && onStartSnowLuma ? (
    <SnowLumaReadinessNotice
      status={snowlumaStatus}
      accounts={snowlumaAccounts}
      selectedAccountUin={selectedSnowLumaAccountUin}
      loading={snowlumaLoading}
      accountsLoading={snowlumaAccountsLoading}
      compact
      onInitialize={onInitializeSnowLuma}
      onStart={onStartSnowLuma}
      onOpenQqDownloadUrl={onOpenQqDownloadUrl}
      onStop={onStopSnowLuma}
      onSelectAccount={onSelectSnowLumaAccount}
    />
  ) : null;

  return (
    <div className="page">
      <PageHeading
        title="倒计时发送"
        description="选定一个时间，或开启一个倒计时，到点后通过 OneBot 发送指定群聊或私聊消息。"
        actions={readinessNotice}
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
