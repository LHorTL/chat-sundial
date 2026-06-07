import { PageHeading } from "@/components/page";
import { MonitorRuleForm } from "../../components/monitor/RuleForm";
import { MonitorRuleList } from "../../components/monitor/RuleList";
import { SnowLumaReadinessNotice } from "../../components/snowluma/ReadinessNotice";
import type { MonitorRule, OneBotGroupInfo } from "../../lib/onebot";
import type { SnowLumaAccountSummary, SnowLumaStartMode, SnowLumaStatus } from "../../lib/snowluma";

interface MonitorPageProps {
  rules: MonitorRule[];
  groups: OneBotGroupInfo[];
  groupsLoading: boolean;
  groupsError: string;
  snowlumaStatus?: SnowLumaStatus;
  snowlumaLoading?: boolean;
  snowlumaAccounts?: SnowLumaAccountSummary[];
  snowlumaAccountsLoading?: boolean;
  selectedSnowLumaAccountUin?: string;
  eventStatus: "idle" | "connected" | "disconnected" | "error";
  onCreateRule: (rule: MonitorRule) => void;
  onRemoveRule: (id: string) => void;
  onToggleRule: (id: string, enabled: boolean) => void;
  onInitializeSnowLuma?: () => void;
  onStartSnowLuma?: (mode: SnowLumaStartMode) => void;
  onStopSnowLuma?: () => void;
  onOpenQqDownloadUrl?: () => void;
  onSelectSnowLumaAccount?: (uin: string) => void;
}

/** 编排群状态监控页面的规则创建表单和规则列表。 */
export function MonitorPage({
  rules,
  groups,
  groupsLoading,
  groupsError,
  snowlumaStatus,
  snowlumaLoading = false,
  snowlumaAccounts = [],
  snowlumaAccountsLoading = false,
  selectedSnowLumaAccountUin = "",
  eventStatus,
  onCreateRule,
  onRemoveRule,
  onToggleRule,
  onInitializeSnowLuma,
  onStartSnowLuma,
  onStopSnowLuma,
  onOpenQqDownloadUrl,
  onSelectSnowLumaAccount
}: MonitorPageProps) {
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
        title="群状态监控"
        description="匹配群消息或禁言事件后自动发送消息，规则本机保存。"
        actions={readinessNotice}
      />

      <div className="page-grid">
        <MonitorRuleForm
          groups={groups}
          groupsLoading={groupsLoading}
          groupsError={groupsError}
          eventStatus={eventStatus}
          onCreateRule={onCreateRule}
        />
        <MonitorRuleList rules={rules} onRemoveRule={onRemoveRule} onToggleRule={onToggleRule} />
      </div>
    </div>
  );
}
