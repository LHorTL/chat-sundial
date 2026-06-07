import { useState } from "react";
import { Button, Select, Tag, Typography } from "@fangxinyan/lumina";
import {
  getSnowLumaReadinessState,
  type SnowLumaAccountSummary,
  type SnowLumaStartMode,
  type SnowLumaStatus
} from "../../lib/snowluma";
import { SnowLumaStartModeModal } from "./StartModeModal";

interface SnowLumaReadinessNoticeProps {
  status: SnowLumaStatus;
  accounts?: SnowLumaAccountSummary[];
  selectedAccountUin?: string;
  loading: boolean;
  accountsLoading?: boolean;
  compact?: boolean;
  onInitialize: () => void;
  onStart: (mode: SnowLumaStartMode) => void;
  onOpenQqDownloadUrl?: () => void;
  onStop?: () => void;
  onSelectAccount?: (uin: string) => void;
}

/** 在依赖 OneBot 的 QQ 页面显示 SnowLuma 初始化和启动引导。 */
export function SnowLumaReadinessNotice({
  status,
  accounts = [],
  selectedAccountUin = "",
  loading,
  accountsLoading = false,
  compact = false,
  onInitialize,
  onStart,
  onOpenQqDownloadUrl = () => undefined,
  onStop,
  onSelectAccount
}: SnowLumaReadinessNoticeProps) {
  const [startModeOpen, setStartModeOpen] = useState(false);
  const viewState = getSnowLumaReadinessState(status);
  if (!viewState.visible) {
    return null;
  }

  /** 根据当前状态执行初始化或打开启动模式弹窗。 */
  const handleAction = () => {
    if (viewState.action === "initialize") {
      onInitialize();
      return;
    }

    if (viewState.action === "start") {
      setStartModeOpen(true);
      return;
    }

    if (viewState.action === "openQqDownload") {
      onOpenQqDownloadUrl();
    }
  };

  /** 选择启动模式后关闭弹窗并提交启动。 */
  const chooseStartMode = (mode: SnowLumaStartMode) => {
    setStartModeOpen(false);
    onStart(mode);
  };

  const actionDisabled = loading || viewState.disabled || viewState.action === "none";
  const running = status.runState === "running";
  const accountOptions = accounts
    .filter((account) => account.status === "online" && Boolean(account.httpPort))
    .map((account) => ({
      value: account.uin,
      label: account.nickname || account.uin,
      description: account.nickname ? account.uin : undefined
    }));
  const canSelectAccount = Boolean(onSelectAccount) && accountOptions.length > 0 && running;

  return (
    <div className={`snowluma-readiness${compact ? " is-compact" : ""}`} role="status">
      <div className="snowluma-readiness__content">
        <div className="snowluma-readiness__text">
          <Typography.Text strong>{viewState.title}</Typography.Text>
          {!compact && <Typography.Text type="secondary">{viewState.description}</Typography.Text>}
        </div>
        <Tag tone={viewState.tagTone} dot>{viewState.tagLabel}</Tag>
        {running && (
          <Tag tone="success" icon="check2" className="snowluma-ready-tag">
            已就绪
          </Tag>
        )}
        {compact && running && (
          <Select
            className="snowluma-account-select"
            size="sm"
            value={selectedAccountUin || undefined}
            options={accountOptions}
            placeholder={accountOptions.length ? "连接账号" : "暂无账号"}
            disabled={!canSelectAccount || loading}
            loading={accountsLoading}
            onChange={(uin) => onSelectAccount?.(String(uin))}
          />
        )}
        {running && onStop && (
          <Button
            size="sm"
            icon="pause"
            loading={loading}
            disabled={loading}
            onClick={onStop}
          >
            停止
          </Button>
        )}
        {viewState.buttonLabel && (
          <Button
            size="sm"
            icon={viewState.buttonIcon}
            variant={viewState.buttonVariant}
            loading={loading && viewState.action !== "none"}
            disabled={actionDisabled}
            onClick={handleAction}
          >
            {viewState.buttonLabel}
          </Button>
        )}
      </div>
      <SnowLumaStartModeModal
        open={startModeOpen}
        status={status}
        onChoose={chooseStartMode}
        onClose={() => setStartModeOpen(false)}
      />
    </div>
  );
}
