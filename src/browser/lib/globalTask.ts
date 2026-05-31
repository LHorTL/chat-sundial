/** 定义 QQ 和文档板块都能注册到全局任务中心的通用任务契约。 */
export type GlobalTaskSection = "qq" | "docs";

/** 区分全局任务中心里的具体任务来源。 */
export type GlobalTaskKind = "qq-countdown" | "qq-monitor" | "docs-submit";

/** 统一任务中心展示和排序使用的状态枚举。 */
export type GlobalTaskStatus = "idle" | "waiting" | "running" | "success" | "error" | "stopped" | "disabled";

export interface GlobalTaskLog {
  time: string;
  message: string;
}

export interface GlobalTaskRegistration {
  id: string;
  section: GlobalTaskSection;
  kind: GlobalTaskKind;
  title: string;
  status: GlobalTaskStatus;
  statusLabel: string;
  primary: string;
  secondary?: string;
  meta?: string[];
  logs?: GlobalTaskLog[];
  countdownTargetMs?: number;
  updatedAt?: number;
}
