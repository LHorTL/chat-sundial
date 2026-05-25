import { useEffect, useState } from "react";
import { Alert, Button, Card, Input, InputNumber, Select, Tag, Typography } from "@fangxinyan/lumina";
import { normalizeOneBotConfig } from "../lib/onebot";
import type { OneBotConfig, OneBotConfigMode, OneBotConnectionStatus, OneBotProtocolMode } from "../lib/onebot";

interface ConfigPageProps {
  config: OneBotConfig;
  connectionStatus: OneBotConnectionStatus;
  lastError: string;
  onSave: (config: OneBotConfig) => void;
  onTest: (config: OneBotConfig) => void;
}

export function ConfigPage({ config, connectionStatus, lastError, onSave, onTest }: ConfigPageProps) {
  const [draft, setDraft] = useState(() => normalizeOneBotConfig(config));

  useEffect(() => {
    setDraft(normalizeOneBotConfig(config));
  }, [config]);

  const update = (key: keyof OneBotConfig, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const changeMode = (mode: OneBotConfigMode) => {
    setDraft((current) => normalizeOneBotConfig({ ...current, mode }));
  };

  const changeProtocol = (protocol: OneBotProtocolMode) => {
    setDraft((current) => normalizeOneBotConfig({ ...current, protocol }));
  };

  const updateRemoteBaseUrl = (value: string) => {
    setDraft((current) => ({
      ...current,
      remoteBaseUrl: value,
      httpUrl: "",
      wsUrl: ""
    }));
  };

  const submitDraft = () => normalizeOneBotConfig(draft);
  const canSubmit = draft.mode === "local" ? Boolean(draft.localPort) : Boolean(draft.remoteBaseUrl.trim());
  const connectionDescription = draft.mode === "local"
    ? "本地端口会按所选协议连接，同时自动推导另一端地址。"
    : "远程入口支持 HTTP 或 WebSocket，只需要填写一个。";

  return (
    <div className="page">
      <PageHeading
        title="OneBot 配置"
        description="选择本地或远程连接，填写一个入口和访问令牌。"
      />

      <Card
        title="连接信息"
        description={connectionDescription}
        actions={<StatusTag status={connectionStatus} />}
        bodyLayout="stack"
      >
        {lastError && <Alert tone="danger" title="连接错误">{lastError}</Alert>}
        <div className="form-grid single">
          <Field label="连接模式">
            <Select
              value={draft.mode}
              onChange={(value) => changeMode(value as OneBotConfigMode)}
              options={[
                { value: "local", label: "本地端口" },
                { value: "remote", label: "远程地址" }
              ]}
            />
          </Field>
          <Field label="协议模式">
            <Select
              value={draft.protocol}
              onChange={(value) => changeProtocol(value as OneBotProtocolMode)}
              options={[
                { value: "http", label: "HTTP API" },
                { value: "websocket", label: "WebSocket" }
              ]}
            />
          </Field>
          {draft.mode === "local" ? (
            <Field label="本地端口">
              <InputNumber
                min={1}
                max={65535}
                value={Number(draft.localPort) || null}
                onChange={(value) => update("localPort", value == null ? "" : String(value))}
                placeholder="5700"
                suffix="端口"
              />
            </Field>
          ) : (
            <Field label="远程入口">
              <Input
                value={draft.remoteBaseUrl}
                onValueChange={updateRemoteBaseUrl}
                placeholder={draft.protocol === "websocket" ? "wss://api.example.com/napcat/websocket" : "https://api.example.com/napcat/botApi"}
                allowClear
              />
            </Field>
          )}
          <Field label="Access Token">
            <Input.Password value={draft.accessToken} onValueChange={(value) => update("accessToken", value)} allowClear />
          </Field>
        </div>
        <div className="action-row">
          <Button icon="check2" disabled={!canSubmit} onClick={() => onSave(submitDraft())}>
            保存配置
          </Button>
          <Button variant="primary" icon="sync" disabled={!canSubmit} loading={connectionStatus === "checking"} onClick={() => onTest(submitDraft())}>
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
