import { useState } from "react";
import { Alert, Button, Card, Modal, Tag, Typography } from "@fangxinyan/lumina";
import { Field } from "@/components/page";
import { getSnowLumaInstallProgressLabel, getSnowLumaInstallState, getSnowLumaManualDownloadState, getSnowLumaUninstallState, shouldShowSnowLumaInstallProgress, type SnowLumaStatus } from "../../lib/snowluma";

interface SnowLumaDownloadPanelProps {
  status: SnowLumaStatus;
  loading: boolean;
  error: string;
  message: string;
  onInstall: () => void;
  onUninstall: () => void;
  onOpenInstallFolder: () => void;
  onOpenDownloadUrl: () => void;
  onRefresh: () => void;
}

/** 渲染 SnowLuma 下载页，展示安装状态和安装/更新入口。 */
export function SnowLumaDownloadPanel({ status, loading, error, message, onInstall, onUninstall, onOpenInstallFolder, onOpenDownloadUrl, onRefresh }: SnowLumaDownloadPanelProps) {
  const [uninstallOpen, setUninstallOpen] = useState(false);
  const viewState = getSnowLumaInstallState(status);
  const uninstallState = getSnowLumaUninstallState(status);
  const progressLabel = getSnowLumaInstallProgressLabel(status.installProgress);
  const manualDownloadState = getSnowLumaManualDownloadState(status);
  const progressPercent = typeof status.installProgress?.percent === "number" ? status.installProgress.percent : 0;
  const showProgress = shouldShowSnowLumaInstallProgress(status.installProgress);
  const showProgressLabelOnly = Boolean(progressLabel && !showProgress);

  return (
    <Card
      title="下载"
      description="检测本地 SnowLuma 安装状态，并下载 Windows x64 完整发布包。"
      actions={<Tag tone={viewState.tone} dot>{viewState.statusLabel}</Tag>}
      bodyLayout="stack"
    >
      {error && <Alert tone="danger" title="SnowLuma 错误">{error}</Alert>}
      {message && <Alert tone="success" title="SnowLuma 状态">{message}</Alert>}

      <div className="snowluma-info-grid">
        <Field label="当前版本">
          <Typography.Text>{status.installedVersion || "未安装"}</Typography.Text>
        </Field>
        <Field label="最新版本">
          <Typography.Text>{status.latestVersion || "检测中"}</Typography.Text>
        </Field>
        <Field label="内置版本">
          <Typography.Text>{status.bundledVersion || "未内置"}</Typography.Text>
        </Field>
        <Field label="安装状态">
          <Typography.Text>{viewState.statusLabel}</Typography.Text>
        </Field>
        <Field label="发布页">
          {status.latestReleaseUrl ? (
            <a href={status.latestReleaseUrl} target="_blank" rel="noreferrer">打开 GitHub Release</a>
          ) : (
            <Typography.Text>暂无</Typography.Text>
          )}
        </Field>
        <Field label="安装文件夹">
          <Typography.Text>{status.installFolderPath || "暂无"}</Typography.Text>
        </Field>
        <Field label="在线完整包">
          <Typography.Text>{status.latestAssetName || "检测中"}</Typography.Text>
        </Field>
        <Field label="内置包">
          <Typography.Text>{status.bundledAssetName || "未内置"}</Typography.Text>
        </Field>
      </div>

      {manualDownloadState.visible && (
        <Alert tone="info" title="浏览器下载兜底">
          {manualDownloadState.hint}
        </Alert>
      )}

      {showProgressLabelOnly && <Typography.Text>{progressLabel}</Typography.Text>}

      {showProgress && (
        <div className="snowluma-progress">
          <div className="snowluma-progress__label">
            <Typography.Text>{progressLabel}</Typography.Text>
            {status.installProgress?.phase === "extracting" && typeof status.installProgress.percent === "number" && (
              <Typography.Text>{status.installProgress.percent}%</Typography.Text>
            )}
          </div>
          <div className="snowluma-progress__bar" aria-label="SnowLuma 安装进度">
            <span style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      )}

      <div className="action-row">
        <Button icon="sync" variant="ghost" loading={loading} onClick={onRefresh}>
          刷新
        </Button>
        <Button icon="folder" variant="ghost" disabled={status.platform !== "win32"} onClick={onOpenInstallFolder}>
          打开安装文件夹
        </Button>
        {manualDownloadState.visible && (
          <Button icon="download" variant="ghost" disabled={status.platform !== "win32" || !status.latestAssetUrl} onClick={onOpenDownloadUrl}>
            浏览器下载完整包
          </Button>
        )}
        <Button
          icon="trash"
          variant="danger"
          loading={loading}
          disabled={uninstallState.disabled || loading}
          title={uninstallState.reason}
          onClick={() => setUninstallOpen(true)}
        >
          {uninstallState.label}
        </Button>
        <Button
          icon="download"
          variant="primary"
          loading={loading || status.installState === "installing"}
          disabled={viewState.installDisabled}
          onClick={onInstall}
        >
          {viewState.installLabel}
        </Button>
      </div>

      <Modal
        open={uninstallOpen}
        title="卸载 SnowLuma"
        description="将删除当前安装目录，保留安装文件夹中的 zip 缓存。"
        okText="确认卸载"
        cancelText="取消"
        okButtonProps={{ variant: "danger", loading }}
        onOk={() => {
          setUninstallOpen(false);
          onUninstall();
        }}
        onClose={() => setUninstallOpen(false)}
      >
        <Typography.Text>
          当前版本：{status.installedVersion || "未知"}。卸载前请确认 SnowLuma 已停止运行。
        </Typography.Text>
      </Modal>
    </Card>
  );
}
