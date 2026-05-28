import type { ReactNode } from "react";
import { Icon, StatusBar } from "@fangxinyan/lumina";
import type { AppSection } from "../hooks/useAppNavigation";

interface AppStatusBarProps {
  activeSection: AppSection;
  qqStatusLeft: ReactNode;
  qqStatusCenter: string;
  qqEventStatusLabel: string;
  now: Date;
}

/** 格式化状态栏右侧当前时间。 */
function formatTime(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

/** 渲染应用底部状态栏，并根据当前板块切换展示内容。 */
export function AppStatusBar({
  activeSection,
  qqStatusLeft,
  qqStatusCenter,
  qqEventStatusLabel,
  now
}: AppStatusBarProps) {
  return (
    <StatusBar
      left={activeSection === "docs" ? (
        <StatusBar.Item icon={<Icon name="file" size={12} />} tone="accent">
          文档板块
        </StatusBar.Item>
      ) : qqStatusLeft}
      center={<StatusBar.Item tone="accent">{activeSection === "docs" ? "腾讯文档自助提交" : qqStatusCenter}</StatusBar.Item>}
      right={
        activeSection === "docs" ? (
          <StatusBar.Item tone="muted">{formatTime(now)}</StatusBar.Item>
        ) : (
          <>
            <StatusBar.Item tone="muted">事件流 {qqEventStatusLabel}</StatusBar.Item>
            <StatusBar.Item tone="muted">{formatTime(now)}</StatusBar.Item>
          </>
        )
      }
    />
  );
}
