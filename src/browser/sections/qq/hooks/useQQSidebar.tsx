import { useMemo } from "react";
import { Icon } from "@fangxinyan/lumina";
import { NavLabel } from "../../../components/app-shell/SidebarItems";
import type { OneBotConnectionStatus } from "../lib/onebot";

interface UseQQSidebarOptions {
  tasksCount: number;
  rulesCount: number;
  connectionStatus: OneBotConnectionStatus;
}

/** 构建 QQ 板块侧栏导航项，避免容器直接拼装 JSX 配置。 */
export function useQQSidebar({ tasksCount, rulesCount, connectionStatus }: UseQQSidebarOptions) {
  return useMemo(
    () => [
      { key: "countdown", label: <NavLabel group="QQ" label="倒计时发送" />, icon: <Icon name="clock" size={16} />, badge: tasksCount || undefined },
      { key: "monitor", label: <NavLabel group="QQ" label="群状态监控" />, icon: <Icon name="bell" size={16} />, badge: rulesCount || undefined },
      { key: "snowluma", label: <NavLabel group="QQ" label="SnowLuma 管理" />, icon: <Icon name="download" size={16} /> },
      { key: "config", label: <NavLabel group="QQ" label="OneBot 配置" />, icon: <Icon name="settings" size={16} />, badge: connectionStatus === "connected" ? "OK" : undefined }
    ],
    [connectionStatus, rulesCount, tasksCount]
  );
}
