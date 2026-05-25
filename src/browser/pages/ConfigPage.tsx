import { useState } from "react";
import { Alert, Button, Card, Input, Tag, Typography } from "@fangxinyan/lumina";
import type { OneBotConfig, OneBotConnectionStatus } from "../lib/onebot";

interface ConfigPageProps {
  config: OneBotConfig;
  connectionStatus: OneBotConnectionStatus;
  lastError: string;
  onSave: (config: OneBotConfig) => void;
  onTest: (config: OneBotConfig) => void;
}

export function ConfigPage({ config, connectionStatus, lastError, onSave, onTest }: ConfigPageProps) {
  const [draft, setDraft] = useState(config);

  const update = (key: keyof OneBotConfig, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="page">
      <PageHeading
        title="OneBot 配置"
        description="配置 HTTP API 地址、WebSocket 事件流地址和访问令牌。StatusBar 会展示当前连接状态。"
      />

      <Card
        title="连接信息"
        description="HTTP 地址用于调用 send_group_msg / send_private_msg / get_status；WebSocket 地址用于接收群消息和通知事件。"
        actions={<StatusTag status={connectionStatus} />}
        bodyLayout="stack"
      >
        {lastError && <Alert tone="danger" title="连接错误">{lastError}</Alert>}
        <div className="form-grid single">
          <Field label="HTTP API 地址">
            <Input value={draft.httpUrl} onValueChange={(value) => update("httpUrl", value)} placeholder="http://127.0.0.1:5700" />
          </Field>
          <Field label="WebSocket 地址">
            <Input value={draft.wsUrl} onValueChange={(value) => update("wsUrl", value)} placeholder="ws://127.0.0.1:5700" />
          </Field>
          <Field label="Access Token">
            <Input.Password value={draft.accessToken} onValueChange={(value) => update("accessToken", value)} allowClear />
          </Field>
        </div>
        <div className="action-row">
          <Button icon="check2" onClick={() => onSave(draft)}>
            保存配置
          </Button>
          <Button variant="primary" icon="sync" loading={connectionStatus === "checking"} onClick={() => onTest(draft)}>
            测试连接
          </Button>
        </div>
      </Card>
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

function StatusTag({ status }: { status: OneBotConnectionStatus }) {
  const tone = status === "connected" ? "success" : status === "error" ? "danger" : status === "checking" ? "warning" : "neutral";
  const label = status === "connected" ? "已连接" : status === "checking" ? "检测中" : status === "error" ? "连接失败" : "未连接";
  return <Tag tone={tone} dot>{label}</Tag>;
}
