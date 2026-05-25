import { useMemo, useState } from "react";
import { Button, Card, DateTimePicker, Input, InputNumber, Select, Tag, Textarea, Typography } from "@fangxinyan/lumina";
import { GroupIdSelect } from "../components/GroupIdSelect";
import type { CountdownMode, CountdownTask, OneBotGroupInfo, RecipientType } from "../lib/onebot";

interface CountdownPageProps {
  tasks: CountdownTask[];
  groups: OneBotGroupInfo[];
  groupsLoading: boolean;
  groupsError: string;
  onCreateTask: (task: CountdownTask) => void;
  onRemoveTask: (id: string) => void;
}

export function CountdownPage({ tasks, groups, groupsLoading, groupsError, onCreateTask, onRemoveTask }: CountdownPageProps) {
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
    <div className="page">
      <PageHeading
        title="倒计时发送"
        description="选定一个时间，或开启一个倒计时，到点后通过 OneBot 发送指定群聊或私聊消息。"
      />

      <div className="page-grid">
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
                      <TaskStatus status={task.status} />
                    </div>
                    <Typography.Text type="secondary">
                      {task.recipientType === "group" ? "群聊" : "私聊"} {task.targetId} · {describeTaskTime(task)}
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

function TaskStatus({ status }: { status: CountdownTask["status"] }) {
  const tone = status === "sent" ? "success" : status === "failed" ? "danger" : "warning";
  const label = status === "sent" ? "已发送" : status === "failed" ? "失败" : "等待中";
  return <Tag tone={tone}>{label}</Tag>;
}

function describeTaskTime(task: CountdownTask) {
  if (task.mode === "schedule" && task.runAt) {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(task.runAt));
  }

  return `${task.seconds ?? 0} 秒倒计时`;
}
