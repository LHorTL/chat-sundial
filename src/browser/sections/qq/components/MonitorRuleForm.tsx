import { useMemo, useState } from "react";
import { Button, Card, Input, Select, Switch, Tag, Textarea } from "@fangxinyan/lumina";
import { Field } from "@/components/page";
import { GroupIdSelect } from "./GroupIdSelect";
import type { MonitorRule, MonitorRunMode, MonitorTrigger, OneBotGroupInfo, RecipientType } from "../lib/onebot";

interface MonitorRuleFormProps {
  groups: OneBotGroupInfo[];
  groupsLoading: boolean;
  groupsError: string;
  eventStatus: "idle" | "connected" | "disconnected" | "error";
  onCreateRule: (rule: MonitorRule) => void;
}

/** 渲染群状态监控规则创建表单，并组装规则配置。 */
export function MonitorRuleForm({ groups, groupsLoading, groupsError, eventStatus, onCreateRule }: MonitorRuleFormProps) {
  const [name, setName] = useState("群状态提醒");
  const [sourceGroupId, setSourceGroupId] = useState("");
  const [trigger, setTrigger] = useState<MonitorTrigger>("regex");
  const [runMode, setRunMode] = useState<MonitorRunMode>("repeat");
  const [pattern, setPattern] = useState("");
  const [recipientType, setRecipientType] = useState<RecipientType>("group");
  const [targetId, setTargetId] = useState("");
  const [message, setMessage] = useState("");

  const canSubmit = useMemo(() => {
    const hasTriggerConfig = trigger === "regex" ? Boolean(pattern.trim()) : true;
    return Boolean(name.trim() && sourceGroupId.trim() && targetId.trim() && message.trim() && hasTriggerConfig);
  }, [message, name, pattern, sourceGroupId, targetId, trigger]);

  /** 校验表单后创建新的群状态监控规则。 */
  const createRule = () => {
    if (!canSubmit) {
      return;
    }

    onCreateRule({
      id: crypto.randomUUID(),
      name: name.trim(),
      sourceGroupId: sourceGroupId.trim(),
      trigger,
      runMode,
      pattern: trigger === "regex" ? pattern.trim() : undefined,
      recipientType,
      targetId: targetId.trim(),
      message: message.trim(),
      enabled: true
    });
  };

  return (
    <Card
      title="创建规则"
      actions={
        <div className="monitor-card-actions">
          <label className="run-mode-switch">
            <span>触发后关闭</span>
            <Switch checked={runMode === "once"} onChange={(checked) => setRunMode(checked ? "once" : "repeat")} />
          </label>
          <MonitorEventStatus status={eventStatus} />
        </div>
      }
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
        <Field label="发送目标">
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
  );
}

/** 渲染 OneBot 事件监听连接状态。 */
function MonitorEventStatus({ status }: { status: MonitorRuleFormProps["eventStatus"] }) {
  const tone = status === "connected" ? "success" : status === "error" ? "danger" : status === "disconnected" ? "warning" : "neutral";
  const label = status === "connected" ? "已连接" : status === "error" ? "错误" : status === "disconnected" ? "断开" : "待配置";
  return <Tag tone={tone} dot>{label}</Tag>;
}
