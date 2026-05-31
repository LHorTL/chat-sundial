import { Button, Card, Switch, Tag, Typography } from "@fangxinyan/lumina";
import { EmptyText } from "@/components/page";
import type { MonitorRule } from "../../lib/onebot";
import {
  describeLastMatchedAt,
  describeMonitorRecipient,
  describeMonitorRunMode,
  describeMonitorTrigger
} from "../../lib/qqViewModel";

interface MonitorRuleListProps {
  rules: MonitorRule[];
  onRemoveRule: (id: string) => void;
  onToggleRule: (id: string, enabled: boolean) => void;
}

/** 渲染群状态监控规则列表和启停/删除操作。 */
export function MonitorRuleList({ rules, onRemoveRule, onToggleRule }: MonitorRuleListProps) {
  return (
    <Card title="规则列表" description="重启后恢复；关闭后不响应事件" bodyLayout="stack">
      {rules.length === 0 ? (
        <EmptyText>暂无监控规则</EmptyText>
      ) : (
        <div className="item-list">
          {rules.map((rule) => (
            <div className="item-card" key={rule.id}>
              <div>
                <div className="item-title">
                  <strong>{rule.name || "未命名规则"}</strong>
                  <RuleStatusTag rule={rule} />
                  <Tag tone="accent">{describeMonitorRunMode(rule)}</Tag>
                </div>
                <div className="item-meta">
                  <Typography.Text type="secondary">
                    来源群 {rule.sourceGroupId} · {describeMonitorTrigger(rule)}
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    发送到 {describeMonitorRecipient(rule)} {rule.targetId} · {describeLastMatchedAt(rule.lastMatchedAt)}
                  </Typography.Text>
                </div>
              </div>
              <div className="item-actions">
                <Switch checked={rule.enabled !== false} onChange={(checked) => onToggleRule(rule.id, checked)} />
                <Button size="sm" variant="ghost" icon="trash" onClick={() => onRemoveRule(rule.id)}>
                  删除
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** 渲染单条监控规则的启用、停用或完成状态。 */
function RuleStatusTag({ rule }: { rule: MonitorRule }) {
  if (rule.enabled === false && rule.runMode === "once" && rule.lastMatchedAt) {
    return <Tag tone="neutral" dot>已完成</Tag>;
  }

  if (rule.enabled === false) {
    return <Tag tone="neutral" dot>已停用</Tag>;
  }

  return <Tag tone="success" dot>启用中</Tag>;
}
