import { useCallback, useEffect, useMemo, useRef } from "react";
import { Icon, StatusBar } from "@fangxinyan/lumina";
import type { GlobalTaskRegistration } from "@/lib/globalTask";
import { ConfigPage } from "./pages/ConfigPage";
import { CountdownPage } from "./pages/CountdownPage";
import { MonitorPage } from "./pages/MonitorPage";
import type { SendMessageTarget } from "./lib/onebot";
import { sendOneBotMessage } from "./lib/onebotClient";
import { eventStatusLabel, oneBotStatusLabel, oneBotStatusTone } from "./lib/qqViewModel";
import { useCountdownTasks } from "./hooks/useCountdownTasks";
import { useMonitorRules } from "./hooks/useMonitorRules";
import { useOneBotConfig } from "./hooks/useOneBotConfig";
import { useOneBotGroups } from "./hooks/useOneBotGroups";
import { useQQSidebar } from "./hooks/useQQSidebar";

export type QQPage = "countdown" | "monitor" | "config";

/** 组织 QQ 板块页面、OneBot 状态和全局任务注册数据。 */
export function useQQSection(activePage: QQPage) {
  const oneBot = useOneBotConfig();
  const groupsState = useOneBotGroups({
    config: oneBot.config,
    hasSavedConfig: oneBot.hasSavedConfig
  });
  const configRef = useRef(oneBot.config);

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

  const content = useMemo(() => {
    if (activePage === "monitor") {
      return (
        <MonitorPage
          rules={monitor.rules}
          groups={groupsState.groups}
          groupsLoading={groupsState.groupsLoading}
          groupsError={groupsState.groupsError}
          eventStatus={monitor.eventStatus}
          onCreateRule={monitor.createRule}
          onRemoveRule={monitor.removeRule}
          onToggleRule={monitor.toggleRule}
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

    return (
      <CountdownPage
        tasks={countdown.tasks}
        groups={groupsState.groups}
        groupsLoading={groupsState.groupsLoading}
        groupsError={groupsState.groupsError}
        onCreateTask={countdown.createTask}
        onRemoveTask={countdown.removeTask}
      />
    );
  }, [activePage, countdown, groupsState, monitor, oneBot]);

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
