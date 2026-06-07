import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Card, Tag, Typography } from "@fangxinyan/lumina";
import { EmptyText, Field } from "@/components/page";
import {
  getSnowLumaAccountStatusLabel,
  getSnowLumaControlState,
  getSnowLumaProtocolPortTagState,
  getSnowLumaQqStatusLabel,
  getSnowLumaQqVersionGuard,
  getSnowLumaVisibleLogs,
  getSnowLumaVersionActionState,
  type SnowLumaAccountSummary,
  type SnowLumaStartMode,
  type SnowLumaStatus
} from "../../lib/snowluma";
import { SnowLumaStartModeModal } from "./StartModeModal";

interface SnowLumaControlPanelProps {
  status: SnowLumaStatus;
  accounts: SnowLumaAccountSummary[];
  loading: boolean;
  accountsLoading: boolean;
  error: string;
  message: string;
  onStart: (mode: SnowLumaStartMode) => void;
  onStop: () => void;
  onRestart: () => void;
  onRefresh: () => void;
  onRefreshAccounts: () => void;
  onOpenWebUi: () => void;
  onOpenQqDownloadUrl?: () => void;
  onSelectAccount: (uin: string) => void;
  onOpenInstallDrawer?: () => void;
  selectedAccountUin?: string;
}

/** 渲染 SnowLuma 操控页，提供进程控制、账号选择和日志查看。 */
export function SnowLumaControlPanel({
  status,
  accounts,
  loading,
  accountsLoading,
  error,
  message,
  onStart,
  onStop,
  onRestart,
  onRefresh,
  onRefreshAccounts,
  onOpenWebUi,
  onOpenQqDownloadUrl = () => undefined,
  onSelectAccount,
  onOpenInstallDrawer = () => undefined,
  selectedAccountUin = ""
}: SnowLumaControlPanelProps) {
  const [startModeOpen, setStartModeOpen] = useState(false);
  const logRef = useRef<HTMLPreElement | null>(null);
  const viewState = getSnowLumaControlState(status);
  const versionAction = getSnowLumaVersionActionState(status);
  const qqVersionGuard = getSnowLumaQqVersionGuard(status);
  const visibleLogs = useMemo(() => getSnowLumaVisibleLogs(status.logs), [status.logs]);
  const latestLog = visibleLogs[visibleLogs.length - 1] ?? "";
  const compactStatus = (
    <div className="snowluma-card-actions">
      <Tag tone={viewState.tone} dot>{viewState.runLabel}</Tag>
      {message && (
        <Tag tone="success" icon="check2" className="snowluma-message-tag">
          {message}
        </Tag>
      )}
    </div>
  );

  /** 选择启动模式后关闭弹窗并提交 SnowLuma 启动动作。 */
  const chooseStartMode = (mode: SnowLumaStartMode) => {
    setStartModeOpen(false);
    onStart(mode);
  };

  useEffect(() => {
    if (!logRef.current) {
      return;
    }

    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [latestLog, visibleLogs.length]);

  return (
    <div className="snowluma-control-stack">
      <Card
        title="操控"
        description="启动或停止本地 SnowLuma sidecar，并查看当前运行状态。"
        actions={compactStatus}
        bodyLayout="stack"
      >
        {error && <Alert tone="danger" title="SnowLuma 错误">{error}</Alert>}

        <div className="snowluma-info-grid">
          <Field label="运行状态">
            <Typography.Text>{viewState.runLabel}</Typography.Text>
          </Field>
          <Field label="SnowLuma 版本">
            <Button
              size="sm"
              icon={versionAction.icon}
              variant={versionAction.variant}
              title={versionAction.description}
              className="snowluma-version-button"
              onClick={onOpenInstallDrawer}
            >
              {versionAction.label}
            </Button>
          </Field>
          <Field label="WebUI">
            <Typography.Text>{status.webUiUrl || "暂无"}</Typography.Text>
          </Field>
          <Field label="QQ 状态">
            <Typography.Text>{getSnowLumaQqStatusLabel(status.qqStatus)}</Typography.Text>
          </Field>
          <Field label="QQ 当前版本">
            <Typography.Text>{status.qqStatus?.version || "未检测到"}</Typography.Text>
          </Field>
          <Field label="QQ 路径">
            <Typography.Text className="snowluma-path-text">{status.qqStatus?.executablePath || "未检测到"}</Typography.Text>
          </Field>
        </div>
        {status.qqStatus?.error && <Alert tone="warning" title="QQ 状态检测失败">{status.qqStatus.error}</Alert>}
        {qqVersionGuard.blocked && (
          <Alert tone="warning" title="QQ 版本过低">
            <div className="snowluma-upgrade-alert">
              <Typography.Text>
                {qqVersionGuard.message || `SnowLuma 需要 QQ ${qqVersionGuard.minimumVersion} 或以上版本。`}
              </Typography.Text>
              <Button size="sm" icon="download" variant="primary" onClick={onOpenQqDownloadUrl}>
                下载新版 QQ
              </Button>
            </div>
          </Alert>
        )}

        <div className="action-row">
          <Button icon="sync" variant="ghost" loading={loading} onClick={onRefresh}>
            刷新
          </Button>
          <Button icon="play" variant="primary" loading={loading || status.runState === "starting"} disabled={!viewState.canStart} onClick={() => setStartModeOpen(true)}>
            启动
          </Button>
          <Button icon="pause" loading={loading || status.runState === "stopping"} disabled={!viewState.canStop} onClick={onStop}>
            停止
          </Button>
          <Button icon="reload" disabled={!viewState.canRestart || loading} onClick={onRestart}>
            重启
          </Button>
          <Button icon="arrowRight" variant="ghost" disabled={!viewState.canOpenWebUi || loading} onClick={onOpenWebUi}>
            打开 WebUI
          </Button>
        </div>

        <SnowLumaStartModeModal
          open={startModeOpen}
          status={status}
          onChoose={chooseStartMode}
          onClose={() => setStartModeOpen(false)}
        />
      </Card>

      <Card
        title="账号"
        description="选择一个 SnowLuma 账号作为当前 ChatSundial 使用的 OneBot 连接。"
        actions={
          <Button size="sm" icon="sync" variant="ghost" loading={accountsLoading} onClick={onRefreshAccounts}>
            刷新账号
          </Button>
        }
        bodyLayout="stack"
      >
        {accounts.length === 0 ? (
          <EmptyText>暂无账号配置，启动 SnowLuma 并完成 QQ 注入后再刷新</EmptyText>
        ) : (
          <div className="item-list">
            {accounts.map((account) => {
              const canConnectAccount = account.status === "online" && Boolean(account.httpPort);
              const isSelected = account.uin === selectedAccountUin && canConnectAccount;
              const httpPortTag = getSnowLumaProtocolPortTagState("HTTP", account.httpPort, account.httpPortStatus);
              const wsPortTag = getSnowLumaProtocolPortTagState("WS", account.wsPort, account.wsPortStatus);

              return (
                <div className={`item-card snowluma-account-card${isSelected ? " is-selected" : ""}`} key={account.uin} aria-current={isSelected ? "true" : undefined}>
                  <div className="snowluma-account-avatar">
                    {account.avatarUrl ? (
                      <img src={account.avatarUrl} alt={`${account.nickname || account.uin} 头像`} />
                    ) : (
                      <span>{(account.nickname || account.uin).slice(0, 1)}</span>
                    )}
                  </div>
                  <div className="item-meta">
                    <div className="item-title">
                      <strong>{account.nickname || account.uin}</strong>
                      <Tag tone={account.status === "online" ? "success" : account.status === "unsupported" || account.status === "invalid" ? "danger" : "neutral"} dot>
                        {getSnowLumaAccountStatusLabel(account.status)}
                      </Tag>
                      {isSelected && (
                        <Tag tone="accent" icon="check2">
                          当前账号
                        </Tag>
                      )}
                    </div>
                    {account.nickname && (
                      <Typography.Text type="secondary" className="snowluma-account-uin">
                        {account.uin}
                      </Typography.Text>
                    )}
                    <div className="snowluma-port-tags" aria-label="OneBot 协议端口状态">
                      <Tag tone={httpPortTag.tone}>{httpPortTag.label}</Tag>
                      <Tag tone={wsPortTag.tone}>{wsPortTag.label}</Tag>
                    </div>
                    {account.statusDetail && <p className="error-text">{account.statusDetail}</p>}
                  </div>
                  <Button
                    size="sm"
                    icon="check2"
                    disabled={isSelected || loading || !canConnectAccount}
                    onClick={() => onSelectAccount(account.uin)}
                  >
                    {isSelected ? "已连接" : "连接账号"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="日志" description="显示 ChatSundial 捕获到的最近 SnowLuma 输出。" bodyLayout="stack">
        {visibleLogs.length ? (
          <pre ref={logRef} className="snowluma-log" aria-live="polite">
            {visibleLogs.join("\n")}
          </pre>
        ) : (
          <EmptyText>暂无日志</EmptyText>
        )}
      </Card>
    </div>
  );
}
