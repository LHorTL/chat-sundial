import type { CountdownTiming, MonitorRule, OneBotEvent } from "./onebotTypes";

/** 判断倒计时任务在当前时间点是否已经到期。 */
export function isCountdownDue(timing: CountdownTiming, now = Date.now()): boolean {
  if (timing.mode === "schedule") {
    if (!timing.runAt) {
      return false;
    }

    const runAt = Date.parse(timing.runAt);
    return Number.isFinite(runAt) && now >= runAt;
  }

  const seconds = timing.seconds ?? 0;
  const startedAt = timing.startedAt ?? now;
  return seconds > 0 && now >= startedAt + seconds * 1000;
}

/** 判断 OneBot 事件是否命中群状态监控规则。 */
export function matchMonitorEvent(rule: Pick<MonitorRule, "trigger" | "sourceGroupId" | "pattern">, event: OneBotEvent): boolean {
  if (String(event.group_id ?? "") !== String(rule.sourceGroupId)) {
    return false;
  }

  if (rule.trigger === "regex") {
    if (event.post_type !== "message" || event.message_type !== "group") {
      return false;
    }

    return safeRegexTest(rule.pattern ?? "", getEventMessageText(event));
  }

  if (event.post_type !== "notice" || event.notice_type !== "group_ban") {
    return false;
  }

  const duration = Number(event.duration ?? 0);
  const subType = String(event.sub_type ?? "");

  if (rule.trigger === "mute_on") {
    return subType === "ban" || duration > 0;
  }

  return subType === "lift_ban" || duration === 0;
}

/** 从 OneBot 消息事件中提取可用于正则匹配的文本。 */
export function getEventMessageText(event: OneBotEvent): string {
  if (typeof event.raw_message === "string") {
    return event.raw_message;
  }

  if (typeof event.message === "string") {
    return event.message;
  }

  return JSON.stringify(event.message ?? "");
}

/** 安全执行用户正则，正则非法时返回不匹配。 */
export function safeRegexTest(pattern: string, text: string): boolean {
  if (!pattern.trim()) {
    return false;
  }

  try {
    return new RegExp(pattern).test(text);
  } catch {
    return false;
  }
}
