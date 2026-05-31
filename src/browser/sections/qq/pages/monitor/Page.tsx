import { PageHeading } from "@/components/page";
import { MonitorRuleForm } from "../../components/monitor/RuleForm";
import { MonitorRuleList } from "../../components/monitor/RuleList";
import type { MonitorRule, OneBotGroupInfo } from "../../lib/onebot";

interface MonitorPageProps {
  rules: MonitorRule[];
  groups: OneBotGroupInfo[];
  groupsLoading: boolean;
  groupsError: string;
  eventStatus: "idle" | "connected" | "disconnected" | "error";
  onCreateRule: (rule: MonitorRule) => void;
  onRemoveRule: (id: string) => void;
  onToggleRule: (id: string, enabled: boolean) => void;
}

/** 编排群状态监控页面的规则创建表单和规则列表。 */
export function MonitorPage({
  rules,
  groups,
  groupsLoading,
  groupsError,
  eventStatus,
  onCreateRule,
  onRemoveRule,
  onToggleRule
}: MonitorPageProps) {
  return (
    <div className="page">
      <PageHeading
        title="群状态监控"
        description="匹配群消息或禁言事件后自动发送消息，规则本机保存。"
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
