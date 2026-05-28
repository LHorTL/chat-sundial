import { useCallback, useEffect, useRef, useState } from "react";
import { callOneBotAction } from "../lib/onebotClient";
import type { OneBotConfig, OneBotConnectionStatus, OneBotActionResponse } from "../lib/onebot";
import { hasSavedOneBotConfig, loadOneBotConfig, saveOneBotConfig } from "../lib/qqStorage";

export interface OneBotConfigState {
  config: OneBotConfig;
  hasSavedConfig: boolean;
  connectionStatus: OneBotConnectionStatus;
  lastError: string;
  saveConfig(nextConfig: OneBotConfig): void;
  testConnection(nextConfig: OneBotConfig): Promise<void>;
  setLastError(message: string): void;
}

/** 管理 OneBot 配置持久化、连接测试和自动连接检查状态。 */
export function useOneBotConfig(): OneBotConfigState {
  const initiallyHasSavedConfig = hasSavedOneBotConfig();
  const [config, setConfig] = useState<OneBotConfig>(() => loadOneBotConfig());
  const [hasSavedConfig, setHasSavedConfig] = useState(initiallyHasSavedConfig);
  const [connectionStatus, setConnectionStatus] = useState<OneBotConnectionStatus>(() => initiallyHasSavedConfig ? "checking" : "idle");
  const [lastError, setLastError] = useState("");
  const connectionCheckSeqRef = useRef(0);
  const skipNextAutoCheckRef = useRef(false);

  const checkConnection = useCallback(async (nextConfig: OneBotConfig) => {
    const checkSeq = ++connectionCheckSeqRef.current;
    setConnectionStatus("checking");
    setLastError("");

    const response = await callOneBotAction(nextConfig, "get_status", {});
    if (checkSeq !== connectionCheckSeqRef.current) {
      return response.ok;
    }

    if (response.ok) {
      setConnectionStatus("connected");
      setLastError("");
      return true;
    }

    setConnectionStatus("error");
    setLastError(formatOneBotActionError(response, "get_status"));
    return false;
  }, []);

  useEffect(() => {
    if (!hasSavedConfig) {
      setConnectionStatus("idle");
      return;
    }

    if (skipNextAutoCheckRef.current) {
      skipNextAutoCheckRef.current = false;
      return;
    }

    void checkConnection(config);
  }, [checkConnection, config, hasSavedConfig]);

  /** 持久化配置并返回归一化后的配置。 */
  const persistConfig = (nextConfig: OneBotConfig) => {
    const normalized = saveOneBotConfig(nextConfig);
    setConfig(normalized);
    setHasSavedConfig(true);
    return normalized;
  };

  /** 保存配置但不立即发起连接测试。 */
  const saveConfig = (nextConfig: OneBotConfig) => {
    persistConfig(nextConfig);
    setConnectionStatus("idle");
    setLastError("");
  };

  /** 保存配置并立即执行一次连接测试。 */
  const testConnection = async (nextConfig: OneBotConfig) => {
    skipNextAutoCheckRef.current = true;
    const normalized = persistConfig(nextConfig);
    await checkConnection(normalized);
  };

  return {
    config,
    hasSavedConfig,
    connectionStatus,
    lastError,
    saveConfig,
    testConnection,
    setLastError
  };
}

/** 把 OneBot action 失败响应整理为用户可读错误。 */
function formatOneBotActionError(response: OneBotActionResponse, action: string) {
  if (response.wording) return response.wording;
  if (response.message) return response.message;
  if (response.retcode != null) return `${action} 返回 retcode=${response.retcode}`;
  if (response.httpStatus != null) return `${action} HTTP ${response.httpStatus}`;
  return `${action} 调用失败`;
}
