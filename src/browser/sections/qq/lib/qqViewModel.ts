import type { GlobalTaskRegistration, GlobalTaskStatus } from "@/lib/globalTask";
import type { CountdownTask, MonitorRule, OneBotConnectionStatus } from "./onebot";

/** 把倒计时任务内部状态映射为全局任务中心状态。 */
export function countdownStatus(status: CountdownTask["status"]): GlobalTaskStatus {
  if (status === "failed") return "error";
  if (status === "sent") return "success";
  return "waiting";
}

/** 计算倒计时任务的目标时间戳。 */
export function getCountdownTargetMs(task: CountdownTask) {
  if (task.mode === "schedule" && task.runAt) {
    const value = Date.parse(task.runAt);
    return Number.isFinite(value) ? value : undefined;
  }

  if (task.mode === "countdown" && task.startedAt && task.seconds) {
    return task.startedAt + task.seconds * 1000;
  }

  return undefined;
}

/** 把倒计时任务转换为全局任务中心注册项。 */
export function buildCountdownRegistration(task: CountdownTask): GlobalTaskRegistration {
  const targetMs = getCountdownTargetMs(task);
  const status = countdownStatus(task.status);
  const lastErrorLog = task.lastError
    ? [{ time: new Date().toISOString(), message: task.lastError }]
    : undefined;

  return {
    id: `qq-countdown-${task.id}`,
    section: "qq",
    kind: "qq-countdown",
    title: task.name,
    status,
    statusLabel: task.status === "failed" ? "发送失败" : task.status === "sent" ? "已发送" : "等待中",
    primary: targetMs ? `目标 ${formatDateTime(targetMs)}` : `${task.seconds ?? 0} 秒倒计时`,
    secondary: `${task.recipientType === "group" ? "群聊" : "私聊"} ${task.targetId}`,
    meta: [
      task.mode === "schedule" ? "指定时间" : "倒计时",
      task.message.slice(0, 42) || "空消息"
    ],
    logs: lastErrorLog,
    countdownTargetMs: targetMs,
    updatedAt: targetMs ?? task.startedAt ?? 0
  };
}

/** 把群监控规则转换为全局任务中心注册项。 */
export function buildMonitorRegistration(rule: MonitorRule): GlobalTaskRegistration {
  const completed = rule.enabled === false && rule.runMode === "once" && Boolean(rule.lastMatchedAt);
  const status: GlobalTaskStatus = completed ? "success" : rule.enabled === false ? "disabled" : "waiting";

  return {
    id: `qq-monitor-${rule.id}`,
    section: "qq",
    kind: "qq-monitor",
    title: rule.name || "未命名监控",
    status,
    statusLabel: completed ? "已完成" : rule.enabled === false ? "已停用" : "监控中",
    primary: describeMonitorTrigger(rule),
    secondary: `来源群 ${rule.sourceGroupId}`,
    meta: [
      `发送到 ${rule.recipientType === "group" ? "群聊" : "私聊"} ${rule.targetId}`,
      rule.runMode === "once" ? "触发后关闭" : "持续监控"
    ],
    logs: rule.lastMatchedAt ? [{ time: new Date(rule.lastMatchedAt).toISOString(), message: "监控规则已触发" }] : undefined,
    updatedAt: rule.lastMatchedAt ?? 0
  };
}

/** 渲染倒计时任务当前发送状态标签所需文案。 */
export function countdownTaskStatusLabel(status: CountdownTask["status"]) {
  return status === "sent" ? "已发送" : status === "failed" ? "失败" : "等待中";
}

/** 渲染倒计时任务当前发送状态标签所需色调。 */
export function countdownTaskStatusTone(status: CountdownTask["status"]) {
  return status === "sent" ? "success" : status === "failed" ? "danger" : "warning";
}

/** 把倒计时任务的触发时间转换为列表里可读的描述。 */
export function describeCountdownTaskTime(task: CountdownTask) {
  if (task.mode === "schedule" && task.runAt) {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(task.runAt));
  }

  return `${task.seconds ?? 0} 秒倒计时`;
}

/** 把监控触发类型转换为规则列表里的可读文案。 */
export function describeMonitorTrigger(rule: Pick<MonitorRule, "trigger" | "pattern">) {
  if (rule.trigger === "regex") {
    return `正则 /${rule.pattern}/`;
  }

  return rule.trigger === "mute_on" ? "群禁言开启" : "群禁言关闭";
}

/** 把规则运行模式转换为列表标签文案。 */
export function describeMonitorRunMode(rule: Pick<MonitorRule, "runMode">) {
  return (rule.runMode ?? "repeat") === "once" ? "一次性" : "循环运行";
}

/** 把发送目标类型转换为中文文案。 */
export function describeMonitorRecipient(rule: Pick<MonitorRule, "recipientType">) {
  return rule.recipientType === "group" ? "群聊" : "私聊";
}

/** 把上次触发时间转换为列表里的可读描述。 */
export function describeLastMatchedAt(lastMatchedAt: number | undefined) {
  if (!lastMatchedAt) {
    return "尚未触发";
  }

  return `上次触发 ${new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(lastMatchedAt))}`;
}

/** 把 OneBot 连接状态映射为状态栏色调。 */
export function oneBotStatusTone(status: OneBotConnectionStatus) {
  if (status === "connected") return "success";
  if (status === "error") return "danger";
  if (status === "checking") return "warning";
  return "muted";
}

/** 把 OneBot 连接状态转换为状态栏文案。 */
export function oneBotStatusLabel(status: OneBotConnectionStatus) {
  if (status === "connected") return "已连接";
  if (status === "checking") return "检测中";
  if (status === "error") return "连接失败";
  return "未连接";
}

/** 把群事件监听状态转换为状态栏文案。 */
export function eventStatusLabel(status: "idle" | "connected" | "disconnected" | "error") {
  if (status === "connected") return "已连接";
  if (status === "disconnected") return "已断开";
  if (status === "error") return "错误";
  return "未启用";
}

/** 把时间戳格式化为任务中心使用的日期时间文案。 */
function formatDateTime(value: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(value));
}
