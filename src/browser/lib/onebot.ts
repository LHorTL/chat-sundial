export type OneBotConnectionStatus = "idle" | "checking" | "connected" | "disconnected" | "error";

export type RecipientType = "group" | "private";

export type CountdownMode = "schedule" | "countdown";

export type MonitorTrigger = "regex" | "mute_on" | "mute_off";

export interface OneBotConfig {
  httpUrl: string;
  wsUrl: string;
  accessToken: string;
}

export interface SendMessageTarget {
  recipientType: RecipientType;
  targetId: string;
  message: string;
  autoEscape?: boolean;
}

export interface SendMessageAction {
  action: "send_group_msg" | "send_private_msg";
  params: Record<string, unknown>;
}

export interface CountdownTiming {
  mode: CountdownMode;
  runAt?: string;
  seconds?: number;
  startedAt?: number;
}

export interface CountdownTask extends SendMessageTarget, CountdownTiming {
  id: string;
  name: string;
  status: "waiting" | "sent" | "failed";
  lastError?: string;
}

export interface MonitorRule extends SendMessageTarget {
  id: string;
  name?: string;
  sourceGroupId: string;
  trigger: MonitorTrigger;
  pattern?: string;
  enabled?: boolean;
  lastMatchedAt?: number;
}

export interface OneBotEvent {
  post_type?: string;
  message_type?: string;
  notice_type?: string;
  group_id?: number | string;
  raw_message?: string;
  message?: unknown;
  duration?: number;
  sub_type?: string;
  [key: string]: unknown;
}

export interface OneBotActionRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface OneBotActionResponse {
  ok: boolean;
  status?: string;
  retcode?: number;
  data?: unknown;
  message?: string;
  wording?: string;
  raw?: unknown;
}

export interface OneBotGroupInfo {
  groupId: string;
  groupName: string;
  memberCount?: number;
  maxMemberCount?: number;
}

export const DEFAULT_ONEBOT_CONFIG: OneBotConfig = {
  httpUrl: "http://127.0.0.1:5700",
  wsUrl: "ws://127.0.0.1:5700",
  accessToken: ""
};

export function normalizeOneBotConfig(value: Partial<OneBotConfig> | null | undefined): OneBotConfig {
  return {
    httpUrl: trimTrailingSlash(value?.httpUrl?.trim() || DEFAULT_ONEBOT_CONFIG.httpUrl),
    wsUrl: trimTrailingSlash(value?.wsUrl?.trim() || DEFAULT_ONEBOT_CONFIG.wsUrl),
    accessToken: value?.accessToken?.trim() || ""
  };
}

export function buildOneBotActionRequest(
  config: OneBotConfig,
  action: string,
  params: Record<string, unknown>
): OneBotActionRequest {
  const normalized = normalizeOneBotConfig(config);
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (normalized.accessToken) {
    headers.Authorization = `Bearer ${normalized.accessToken}`;
  }

  return {
    url: `${normalized.httpUrl}/${action}`,
    headers,
    body: JSON.stringify(params)
  };
}

export function buildSendMessageAction(target: SendMessageTarget): SendMessageAction {
  const numericTargetId = parseNumericId(target.targetId);
  const common = {
    message: target.message,
    auto_escape: target.autoEscape ?? false
  };

  if (target.recipientType === "group") {
    return {
      action: "send_group_msg",
      params: {
        group_id: numericTargetId,
        ...common
      }
    };
  }

  return {
    action: "send_private_msg",
    params: {
      user_id: numericTargetId,
      ...common
    }
  };
}

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

export function parseOneBotGroupList(value: unknown): OneBotGroupInfo[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;
    const groupId = String(record.group_id ?? "").trim();
    if (!groupId) {
      return [];
    }

    const rawName = String(record.group_name ?? "").trim();

    return [{
      groupId,
      groupName: rawName || `群聊 ${groupId}`,
      memberCount: normalizeOptionalNumber(record.member_count),
      maxMemberCount: normalizeOptionalNumber(record.max_member_count)
    }];
  });
}

export function getEventMessageText(event: OneBotEvent): string {
  if (typeof event.raw_message === "string") {
    return event.raw_message;
  }

  if (typeof event.message === "string") {
    return event.message;
  }

  return JSON.stringify(event.message ?? "");
}

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

export function parseNumericId(value: string): number {
  const id = Number(value.trim());
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("目标 ID 必须是正数");
  }

  return id;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}
