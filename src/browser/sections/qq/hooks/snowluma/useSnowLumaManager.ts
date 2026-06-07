import { useCallback, useEffect, useState } from "react";
import type {
  SnowLumaAccountSummary,
  SnowLumaActionKind,
  SnowLumaSelectedAccountConfig,
  SnowLumaScopedMessage,
  SnowLumaStartMode,
  SnowLumaStatus
} from "../../lib/snowluma";
import {
  getSnowLumaAccountRefreshInterval,
  getSnowLumaActionMessage,
  getSnowLumaLiveRefreshPlan,
  getSnowLumaStatusError,
  getSnowLumaStatusRefreshInterval
} from "../../lib/snowluma";

const DEFAULT_STATUS: SnowLumaStatus = {
  platform: "browser",
  installState: "unsupported",
  runState: "stopped",
  qqStatus: {
    running: false,
    processes: [],
    source: "unknown"
  },
  logs: []
};

/** 管理 SnowLuma IPC 状态、按钮动作和账号列表刷新。 */
export function useSnowLumaManager() {
  const bridge = window.chatSundial?.snowluma;
  const [status, setStatus] = useState<SnowLumaStatus>(() => bridge ? { ...DEFAULT_STATUS, platform: window.chatSundial?.platform ?? "browser", installState: "missing" } : DEFAULT_STATUS);
  const [accounts, setAccounts] = useState<SnowLumaAccountSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [message, setMessage] = useState<SnowLumaScopedMessage | null>(null);
  const [error, setError] = useState("");
  const refreshPlan = getSnowLumaLiveRefreshPlan(status, loading);
  const statusRefreshIntervalMs = getSnowLumaStatusRefreshInterval(status, loading);
  const accountRefreshIntervalMs = getSnowLumaAccountRefreshInterval(status, accounts, accountsLoading);

  /** 刷新 SnowLuma 安装和运行状态。 */
  const refreshStatus = useCallback(async () => {
    if (!bridge) {
      setStatus(DEFAULT_STATUS);
      setError("当前环境不是 Electron，无法管理本地 SnowLuma");
      return DEFAULT_STATUS;
    }

    const nextStatus = await bridge.status();
    setStatus(nextStatus);
    setError(getSnowLumaStatusError(nextStatus));
    return nextStatus;
  }, [bridge]);

  /** 刷新 SnowLuma 账号列表。 */
  const refreshAccounts = useCallback(async () => {
    if (!bridge) {
      setAccounts([]);
      return [];
    }

    setAccountsLoading(true);
    try {
      const result = await bridge.listAccounts();
      setAccounts(result.accounts);
      if (!result.ok && result.message && result.message !== "SnowLuma 尚未安装") {
        setError(result.message);
      }
      return result.accounts;
    } finally {
      setAccountsLoading(false);
    }
  }, [bridge]);

  /** 轻量刷新 SnowLuma 输出日志，避免运行中频繁触发完整状态探测。 */
  const refreshLogs = useCallback(async () => {
    if (!bridge) {
      return;
    }

    if (!bridge.logs) {
      await refreshStatus();
      return;
    }

    const nextLogs = await bridge.logs();
    setStatus((current) => ({
      ...current,
      runState: nextLogs.runState,
      webUiUrl: nextLogs.webUiUrl || current.webUiUrl,
      error: nextLogs.error,
      logs: nextLogs.logs
    }));
    setError(getSnowLumaStatusError(nextLogs));
  }, [bridge, refreshStatus]);

  /** 执行一个 SnowLuma 主进程动作并同步状态。 */
  const runAction = useCallback(async (action: SnowLumaActionKind, startMode?: SnowLumaStartMode) => {
    if (!bridge) {
      setError("当前环境不是 Electron，无法管理本地 SnowLuma");
      return false;
    }

    setLoading(true);
    setMessage(null);
    setError("");
    if (action === "installLatest" || action === "installBundled") {
      setStatus((current) => ({
        ...current,
        installState: "installing",
        installProgress: {
          phase: action === "installBundled" || current.installProgress?.phase === "ready-to-extract" ? "extracting" : "downloading",
          percent: 0,
          detail: action === "installBundled" ? current.bundledAssetName || current.bundledVersion : current.manualArchiveName || current.latestVersion
        }
      }));
    }
    try {
      const result = action === "start" ? await bridge.start(startMode) : await bridge[action]();
      if (result.status) {
        setStatus(result.status);
      }
      if (!result.ok) {
        setError(result.message || "SnowLuma 操作失败");
        return false;
      }
      setMessage(getSnowLumaActionMessage(action, startMode));
      await refreshAccounts();
      return true;
    } finally {
      setLoading(false);
      await refreshStatus();
    }
  }, [bridge, refreshAccounts, refreshStatus]);

  useEffect(() => {
    if (!refreshPlan.intervalMs) {
      return;
    }

    const timer = window.setInterval(() => {
      if (refreshPlan.mode === "logs") {
        void refreshLogs();
        return;
      }

      void refreshStatus();
    }, refreshPlan.intervalMs);
    return () => window.clearInterval(timer);
  }, [refreshLogs, refreshPlan.intervalMs, refreshPlan.mode, refreshStatus]);

  useEffect(() => {
    if (!statusRefreshIntervalMs) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshStatus();
    }, statusRefreshIntervalMs);
    return () => window.clearInterval(timer);
  }, [refreshStatus, statusRefreshIntervalMs]);

  useEffect(() => {
    if (!accountRefreshIntervalMs) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshAccounts();
    }, accountRefreshIntervalMs);
    return () => window.clearInterval(timer);
  }, [accountRefreshIntervalMs, refreshAccounts]);

  /** 选择 SnowLuma 账号并返回可写入 OneBot 的配置。 */
  const selectAccount = useCallback(async (uin: string): Promise<SnowLumaSelectedAccountConfig | null> => {
    if (!bridge) {
      setError("当前环境不是 Electron，无法管理本地 SnowLuma");
      return null;
    }

    setLoading(true);
    setMessage(null);
    setError("");
    try {
      const result = await bridge.selectAccount(uin);
      if (!result.ok || !result.config) {
        setError(result.message || "账号无法自动接入");
        return null;
      }
      setMessage({ scope: "control", text: `已选择账号 ${uin}` });
      return result.config;
    } finally {
      setLoading(false);
    }
  }, [bridge]);

  useEffect(() => {
    void refreshStatus();
    void refreshAccounts();
  }, [refreshAccounts, refreshStatus]);

  return {
    status,
    accounts,
    loading,
    accountsLoading,
    message,
    error,
    refreshStatus,
    refreshAccounts,
    installBundled: () => runAction("installBundled"),
    installLatest: () => runAction("installLatest"),
    uninstall: () => runAction("uninstall"),
    start: (mode?: SnowLumaStartMode) => runAction("start", mode ?? "hot"),
    stop: () => runAction("stop"),
    restart: () => runAction("restart"),
    openInstallFolder: () => runAction("openInstallFolder"),
    openDownloadUrl: () => runAction("openDownloadUrl"),
    openQqDownloadUrl: () => runAction("openQqDownloadUrl"),
    openWebUi: () => runAction("openWebUi"),
    selectAccount
  };
}

export type SnowLumaManagerState = ReturnType<typeof useSnowLumaManager>;
