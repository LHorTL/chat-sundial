import { useMemo, useState } from "react";
import { Button, Card, Input, Select, Switch, Tag, Textarea, Typography } from "@fangxinyan/lumina";
import { GroupIdSelect } from "../components/GroupIdSelect";
import type { MonitorRule, MonitorTrigger, OneBotGroupInfo, RecipientType } from "../lib/onebot";

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
  const [name, setName] = useState("群状态提醒");
  const [sourceGroupId, setSourceGroupId] = useState("");
  const [trigger, setTrigger] = useState<MonitorTrigger>("regex");
  const [pattern, setPattern] = useState("");
  const [recipientType, setRecipientType] = useState<RecipientType>("group");
  const [targetId, setTargetId] = useState("");
  const [message, setMessage] = useState("");

  const canSubmit = useMemo(() => {
    const hasTriggerConfig = trigger === "regex" ? Boolean(pattern.trim()) : true;
    return Boolean(name.trim() && sourceGroupId.trim() && targetId.trim() && message.trim() && hasTriggerConfig);
  }, [message, name, pattern, sourceGroupId, targetId, trigger]);

  const createRule = () => {
    if (!canSubmit) {
      return;
    }

    onCreateRule({
      id: crypto.randomUUID(),
      name: name.trim(),
      sourceGroupId: sourceGroupId.trim(),
      trigger,
      pattern: trigger === "regex" ? pattern.trim() : undefined,
      recipientType,
      targetId: targetId.trim(),
      message: message.trim(),
      enabled: true
    });
  };

  return (
    <div className="page">
      <PageHeading
        title="群状态监控"
        description="监听 OneBot WebSocket 事件，匹配群消息正则或群禁言事件后发送指定消息。"
      />

      <div className="page-grid">
        <Card
          title="创建监控规则"
          description="正则匹配只处理群消息；禁言开启/关闭匹配 group_ban 通知事件"
          actions={<StatusPill status={eventStatus} />}
          bodyLayout="stack"
        >
          <div className="form-grid">
            <Field label="规则名称">
              <Input value={name} onValueChange={setName} allowClear />
            </Field>
            <Field label="来源群号">
              <GroupIdSelect
                value={sourceGroupId}
                onChange={setSourceGroupId}
                groups={groups}
                loading={groupsLoading}
                error={groupsError}
                placeholder="搜索来源群名或群号"
              />
            </Field>
            <Field label="触发条件">
              <Select
                value={trigger}
                onChange={(value) => setTrigger(value as MonitorTrigger)}
                options={[
                  { value: "regex", label: "群消息正则" },
                  { value: "mute_on", label: "群禁言开启" },
                  { value: "mute_off", label: "群禁言关闭" }
                ]}
              />
            </Field>
            {trigger === "regex" && (
              <Field label="正则表达式">
                <Input value={pattern} onValueChange={setPattern} placeholder="例如 开服|开门" allowClear />
              </Field>
            )}
            <Field label="发送对象">
              <Select
                value={recipientType}
                onChange={(value) => setRecipientType(value as RecipientType)}
                options={[
                  { value: "group", label: "群聊" },
                  { value: "private", label: "私聊" }
                ]}
              />
            </Field>
            <Field label={recipientType === "group" ? "目标群号" : "目标 QQ 号"}>
              {recipientType === "group" ? (
                <GroupIdSelect
                  value={targetId}
                  onChange={setTargetId}
                  groups={groups}
                  loading={groupsLoading}
                  error={groupsError}
                  placeholder="搜索目标群名或群号"
                />
              ) : (
                <Input value={targetId} onValueChange={setTargetId} allowClear />
              )}
            </Field>
          </div>
          <Field label="触发后发送">
            <Textarea value={message} onValueChange={setMessage} rows={5} allowClear showCount maxLength={500} />
          </Field>
          <div className="action-row">
            <Button variant="primary" icon="plus" disabled={!canSubmit} onClick={createRule}>
              添加规则
            </Button>
          </div>
        </Card>

        <Card title="规则列表" description="关闭规则后仍保留配置，但不会响应事件" bodyLayout="stack">
          {rules.length === 0 ? (
            <EmptyText>暂无监控规则</EmptyText>
          ) : (
            <div className="item-list">
              {rules.map((rule) => (
                <div className="item-card" key={rule.id}>
                  <div>
                    <div className="item-title">
                      <strong>{rule.name || "未命名规则"}</strong>
                      <Tag tone={rule.enabled === false ? "neutral" : "success"} dot>
                        {rule.enabled === false ? "已停用" : "启用中"}
                      </Tag>
                    </div>
                    <Typography.Text type="secondary">
                      来源群 {rule.sourceGroupId} · {describeTrigger(rule)}
                    </Typography.Text>
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
      </div>
    </div>
  );
}

function PageHeading({ title, description }: { title: string; description: string }) {
  return (
    <header className="page-heading">
      <Typography.Title level={2}>{title}</Typography.Title>
      <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>
    </header>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <div className="empty-text">{children}</div>;
}

function StatusPill({ status }: { status: MonitorPageProps["eventStatus"] }) {
  const tone = status === "connected" ? "success" : status === "error" ? "danger" : status === "disconnected" ? "warning" : "neutral";
  const label = status === "connected" ? "事件流已连接" : status === "error" ? "事件流错误" : status === "disconnected" ? "事件流断开" : "事件流待配置";
  return <Tag tone={tone} dot>{label}</Tag>;
}

function describeTrigger(rule: MonitorRule) {
  if (rule.trigger === "regex") {
    return `正则 /${rule.pattern}/`;
  }

  return rule.trigger === "mute_on" ? "群禁言开启" : "群禁言关闭";
}
