import { useMemo, useState } from "react";
import { Button, Card, DateTimePicker, Input, InputNumber, Select, Textarea } from "@fangxinyan/lumina";
import { Field } from "@/components/page";
import { GroupIdSelect } from "../onebot/GroupSelect";
import type { CountdownMode, CountdownTask, OneBotGroupInfo, RecipientType } from "../../lib/onebot";

interface CountdownTaskFormProps {
  groups: OneBotGroupInfo[];
  groupsLoading: boolean;
  groupsError: string;
  onCreateTask: (task: CountdownTask) => void;
}

/** 渲染倒计时任务创建表单，并在提交时组装完整任务对象。 */
export function CountdownTaskForm({ groups, groupsLoading, groupsError, onCreateTask }: CountdownTaskFormProps) {
  const [name, setName] = useState("定时提醒");
  const [mode, setMode] = useState<CountdownMode>("schedule");
  const [runAt, setRunAt] = useState<Date | null>(() => new Date(Date.now() + 5 * 60 * 1000));
  const [seconds, setSeconds] = useState<number | null>(60);
  const [recipientType, setRecipientType] = useState<RecipientType>("group");
  const [targetId, setTargetId] = useState("");
  const [message, setMessage] = useState("");

  const canSubmit = useMemo(() => {
    const hasTiming = mode === "schedule" ? Boolean(runAt) : Boolean(seconds && seconds > 0);
    return Boolean(name.trim() && targetId.trim() && message.trim() && hasTiming);
  }, [message, mode, name, runAt, seconds, targetId]);

  /** 校验表单后创建新的倒计时任务。 */
  const createTask = () => {
    if (!canSubmit) {
      return;
    }

    onCreateTask({
      id: crypto.randomUUID(),
      name: name.trim(),
      mode,
      runAt: mode === "schedule" && runAt ? runAt.toISOString() : undefined,
      seconds: mode === "countdown" ? seconds ?? 0 : undefined,
      startedAt: mode === "countdown" ? Date.now() : undefined,
      recipientType,
      targetId: targetId.trim(),
      message: message.trim(),
      status: "waiting"
    });
  };

  return (
    <Card title="创建任务" description="发送成功后自动移除；发送失败会保留在队列中" bodyLayout="stack">
      <div className="form-grid">
        <Field label="任务名称">
          <Input value={name} onValueChange={setName} allowClear />
        </Field>
        <Field label="触发方式">
          <Select
            value={mode}
            onChange={(value) => setMode(value as CountdownMode)}
            options={[
              { value: "schedule", label: "指定时间" },
              { value: "countdown", label: "倒计时" }
            ]}
          />
        </Field>
        {mode === "schedule" ? (
          <Field label="发送时间">
            <DateTimePicker
              value={runAt}
              onChange={setRunAt}
              allowClear
              format="YYYY-MM-DD HH:mm:ss"
              min={new Date()}
              placeholder="选择发送时间"
              showSecond
            />
          </Field>
        ) : (
          <Field label="倒计时秒数">
            <InputNumber min={1} value={seconds} onChange={setSeconds} suffix="秒" />
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
        <Field label={recipientType === "group" ? "群号" : "QQ 号"}>
          {recipientType === "group" ? (
            <GroupIdSelect
              value={targetId}
              onChange={setTargetId}
              groups={groups}
              loading={groupsLoading}
              error={groupsError}
              placeholder="搜索群名或群号"
            />
          ) : (
            <Input value={targetId} onValueChange={setTargetId} placeholder="例如 1000010000" allowClear />
          )}
        </Field>
      </div>
      <Field label="消息内容">
        <Textarea value={message} onValueChange={setMessage} rows={5} allowClear showCount maxLength={500} />
      </Field>
      <div className="action-row">
        <Button variant="primary" icon="plus" disabled={!canSubmit} onClick={createTask}>
          添加任务
        </Button>
      </div>
    </Card>
  );
}
