import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, StatusBar } from "@fangxinyan/lumina";
import type { GlobalTaskRegistration } from "@/lib/globalTask";
import { ConfigPage } from "./pages/onebot/ConfigPage";
import { CountdownPage } from "./pages/countdown/Page";
import { MonitorPage } from "./pages/monitor/Page";
import { SnowLumaPage } from "./pages/snowluma/Page";
import { normalizeOneBotConfig, type OneBotConfig, type SendMessageTarget } from "./lib/onebot";
import { getSnowLumaAutoConnectAccountUin, type SnowLumaStartMode } from "./lib/snowluma";
import { sendOneBotMessage } from "./lib/onebot/client";
import { eventStatusLabel, oneBotStatusLabel, oneBotStatusTone } from "./lib/qqViewModel";
import { useCountdownTasks } from "./hooks/countdown/useTasks";
import { useMonitorRules } from "./hooks/monitor/useRules";
import { useOneBotConfig } from "./hooks/onebot/useConfig";
import { useOneBotGroups } from "./hooks/onebot/useGroups";
import { useSnowLumaManager } from "./hooks/snowluma/useSnowLumaManager";
import { useQQSidebar } from "./hooks/useQQSidebar";

export type QQPage = "countdown" | "monitor" | "config" | "snowluma";

/** 组织 QQ 板块页面、OneBot 状态和全局任务注册数据。 */
export function useQQSection(activePage: QQPage) {
  const oneBot = useOneBotConfig();
  const snowluma = useSnowLumaManager();
  const [selectedSnowLumaAccountUin, setSelectedSnowLumaAccountUin] = useState("");
  const groupsState = useOneBotGroups({
    config: oneBot.config,
    hasSavedConfig: oneBot.hasSavedConfig
  });
  const configRef = useRef(oneBot.config);
  const autoConnectAttemptRef = useRef("");

  useEffect(() => {
    configRef.current = oneBot.config;
  }, [oneBot.config]);

  const sendTarget = useCallback(async (target: SendMessageTarget) => {
    const response = await sendOneBotMessage(configRef.current, target);
    if (!response.ok) {
      throw new Error(response.wording || response.message || `OneBot 调用失败: ${response.retcode ?? "unknown"}`);
    }
    return response;
  }, []);

  /** 写入 SnowLuma 选择出的 OneBot 配置，并立即执行连接测试。 */
  const applySnowLumaOneBotConfig = useCallback(async (config: OneBotConfig) => {
    await oneBot.testConnection(config);
  }, [oneBot]);

  const countdown = useCountdownTasks({ sendTarget });
  const monitor = useMonitorRules({
    config: oneBot.config,
    hasSavedConfig: oneBot.hasSavedConfig,
    sendTarget,
    onError: oneBot.setLastError
  });
  const sidebarItems = useQQSidebar({
    tasksCount: countdown.tasks.length,
    rulesCount: monitor.rules.length,
    connectionStatus: oneBot.connectionStatus
  });
  const taskRegistrations = useMemo<GlobalTaskRegistration[]>(
    () => [
      ...countdown.registrations,
      ...monitor.registrations
    ],
    [countdown.registrations, monitor.registrations]
  );

  /** 使用内置包初始化 SnowLuma，供依赖 OneBot 的页面快速引导。 */
  const initializeSnowLuma = useCallback(() => {
    void snowluma.installBundled();
  }, [snowluma]);

  /** 使用用户选择的启动模式启动 SnowLuma。 */
  const startSnowLuma = useCallback((mode: SnowLumaStartMode) => {
    void snowluma.start(mode);
  }, [snowluma]);

  /** 停止 SnowLuma sidecar。 */
  const stopSnowLuma = useCallback(() => {
    void snowluma.stop();
  }, [snowluma]);

  /** 打开新版 QQ 下载页，供 QQ 版本不满足 SnowLuma 要求时引导升级。 */
  const openQqDownloadUrl = useCallback(() => {
    void snowluma.openQqDownloadUrl();
  }, [snowluma]);

  /** 选择 SnowLuma 账号并写入当前 OneBot 配置。 */
  const selectSnowLumaAccount = useCallback(async (uin: string) => {
    const config = await snowluma.selectAccount(uin);
    if (!config) {
      return;
    }

    await applySnowLumaOneBotConfig(normalizeOneBotConfig(config));
    setSelectedSnowLumaAccountUin(uin);
  }, [applySnowLumaOneBotConfig, snowluma]);

  useEffect(() => {
    const autoConnectUin = getSnowLumaAutoConnectAccountUin(
      snowluma.status,
      snowluma.accounts,
      selectedSnowLumaAccountUin,
      snowluma.accountsLoading
    );

    if (!autoConnectUin || autoConnectAttemptRef.current === autoConnectUin) {
      return;
    }

    autoConnectAttemptRef.current = autoConnectUin;
    void selectSnowLumaAccount(autoConnectUin);
  }, [selectSnowLumaAccount, selectedSnowLumaAccountUin, snowluma.accounts, snowluma.accountsLoading, snowluma.status]);

  const content = useMemo(() => {
    if (activePage === "monitor") {
      return (
        <MonitorPage
          rules={monitor.rules}
          groups={groupsState.groups}
          groupsLoading={groupsState.groupsLoading}
          groupsError={groupsState.groupsError}
          snowlumaStatus={snowluma.status}
          snowlumaLoading={snowluma.loading}
          snowlumaAccounts={snowluma.accounts}
          snowlumaAccountsLoading={snowluma.accountsLoading}
          selectedSnowLumaAccountUin={selectedSnowLumaAccountUin}
          eventStatus={monitor.eventStatus}
          onCreateRule={monitor.createRule}
          onRemoveRule={monitor.removeRule}
          onToggleRule={monitor.toggleRule}
          onInitializeSnowLuma={initializeSnowLuma}
          onStartSnowLuma={startSnowLuma}
          onStopSnowLuma={stopSnowLuma}
          onOpenQqDownloadUrl={openQqDownloadUrl}
          onSelectSnowLumaAccount={selectSnowLumaAccount}
        />
      );
    }

    if (activePage === "config") {
      return (
        <ConfigPage
          config={oneBot.config}
          connectionStatus={oneBot.connectionStatus}
          lastError={oneBot.lastError}
          onSave={oneBot.saveConfig}
          onTest={oneBot.testConnection}
        />
      );
    }

    if (activePage === "snowluma") {
      return (
        <SnowLumaPage
          snowluma={snowluma}
          selectedAccountUin={selectedSnowLumaAccountUin}
          onSelectAccount={selectSnowLumaAccount}
        />
      );
    }

    return (
      <CountdownPage
        tasks={countdown.tasks}
        groups={groupsState.groups}
        groupsLoading={groupsState.groupsLoading}
        groupsError={groupsState.groupsError}
        snowlumaStatus={snowluma.status}
        snowlumaLoading={snowluma.loading}
        snowlumaAccounts={snowluma.accounts}
        snowlumaAccountsLoading={snowluma.accountsLoading}
        selectedSnowLumaAccountUin={selectedSnowLumaAccountUin}
        onCreateTask={countdown.createTask}
        onRemoveTask={countdown.removeTask}
        onInitializeSnowLuma={initializeSnowLuma}
        onStartSnowLuma={startSnowLuma}
        onStopSnowLuma={stopSnowLuma}
        onOpenQqDownloadUrl={openQqDownloadUrl}
        onSelectSnowLumaAccount={selectSnowLumaAccount}
      />
    );
  }, [activePage, applySnowLumaOneBotConfig, countdown, groupsState, initializeSnowLuma, monitor, oneBot, openQqDownloadUrl, selectSnowLumaAccount, selectedSnowLumaAccountUin, snowluma, startSnowLuma, stopSnowLuma]);

  return {
    sidebarItems,
    taskRegistrations,
    content,
    statusLeft: (
      <StatusBar.Item icon={<Icon name="sync" size={12} />} tone={oneBotStatusTone(oneBot.connectionStatus)}>
        OneBot {oneBotStatusLabel(oneBot.connectionStatus)}
      </StatusBar.Item>
    ),
    statusCenter: oneBot.config.protocol === "websocket" ? oneBot.config.wsUrl : oneBot.config.httpUrl,
    eventStatusLabel: eventStatusLabel(monitor.eventStatus)
  };
}
