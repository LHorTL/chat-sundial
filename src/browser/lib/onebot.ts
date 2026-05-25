export type OneBotConnectionStatus = "idle" | "checking" | "connected" | "disconnected" | "error";

export type RecipientType = "group" | "private";

export type CountdownMode = "schedule" | "countdown";

export type MonitorTrigger = "regex" | "mute_on" | "mute_off";

export type MonitorRunMode = "once" | "repeat";

export type OneBotConfigMode = "local" | "remote";

export type OneBotProtocolMode = "http" | "websocket";

export interface OneBotConfig {
  mode: OneBotConfigMode;
  protocol: OneBotProtocolMode;
  localPort: string;
  remoteBaseUrl: string;
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
  runMode?: MonitorRunMode;
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

export interface OneBotWebSocketActionPayload {
  action: string;
  params: Record<string, unknown>;
  echo: string;
}

export interface OneBotActionResponse {
  ok: boolean;
  httpStatus?: number;
  status?: string;
  retcode?: number;
  data?: unknown;
  message?: string;
  wording?: string;
  raw?: unknown;
  rawText?: string;
}

export interface OneBotGroupInfo {
  groupId: string;
  groupName: string;
  memberCount?: number;
  maxMemberCount?: number;
}

export const DEFAULT_ONEBOT_CONFIG: OneBotConfig = {
  mode: "local",
  protocol: "http",
  localPort: "5700",
  remoteBaseUrl: "",
  httpUrl: "http://127.0.0.1:5700",
  wsUrl: "ws://127.0.0.1:5700",
  accessToken: ""
};

export function normalizeOneBotConfig(value: Partial<OneBotConfig> | null | undefined): OneBotConfig {
  const accessToken = value?.accessToken?.trim() || "";
  const mode = normalizeOneBotConfigMode(value);
  const protocol = normalizeOneBotProtocolMode(value);
  const localPort = normalizeOneBotLocalPort(
    value?.localPort || extractUrlPort(protocol === "websocket" ? value?.wsUrl : value?.httpUrl) || DEFAULT_ONEBOT_CONFIG.localPort
  );

  if (mode === "local") {
    return {
      mode,
      protocol,
      localPort,
      remoteBaseUrl: normalizeRemoteBaseUrl(value?.remoteBaseUrl),
      httpUrl: `http://127.0.0.1:${localPort}`,
      wsUrl: `ws://127.0.0.1:${localPort}`,
      accessToken
    };
  }

  const remote = buildRemoteOneBotEndpoints(value);

  return {
    mode,
    protocol,
    localPort,
    remoteBaseUrl: remote.remoteBaseUrl,
    httpUrl: remote.httpUrl,
    wsUrl: remote.wsUrl,
    accessToken
  };
}

export function normalizeOneBotLocalPort(value: string): string {
  const port = Number(value.trim());
  if (Number.isInteger(port) && port >= 1 && port <= 65535) {
    return String(port);
  }

  return DEFAULT_ONEBOT_CONFIG.localPort;
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

export function buildOneBotWebSocketActionPayload(
  action: string,
  params: Record<string, unknown>,
  echo = crypto.randomUUID()
): OneBotWebSocketActionPayload {
  return {
    action,
    params,
    echo
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

export function buildOneBotWebSocketUrl(config: OneBotConfig): string {
  const normalized = normalizeOneBotConfig(config);
  if (!normalized.accessToken) {
    return normalized.wsUrl;
  }

  const url = new URL(normalized.wsUrl);
  url.searchParams.set("access_token", normalized.accessToken);
  return url.toString();
}

function buildRemoteOneBotEndpoints(value: Partial<OneBotConfig> | null | undefined): Pick<OneBotConfig, "remoteBaseUrl" | "httpUrl" | "wsUrl"> {
  const remoteBaseUrl = normalizeRemoteBaseUrl(value?.remoteBaseUrl);

  if (remoteBaseUrl) {
    return deriveRemoteOneBotEndpoints(remoteBaseUrl);
  }

  if (value?.httpUrl && value.wsUrl) {
    return {
      remoteBaseUrl: inferRemoteBaseUrl(value.httpUrl),
      httpUrl: trimTrailingSlash(value.httpUrl.trim()),
      wsUrl: trimTrailingSlash(value.wsUrl.trim())
    };
  }

  return deriveRemoteOneBotEndpoints(value?.httpUrl || value?.wsUrl || "");
}

function deriveRemoteOneBotEndpoints(value: string): Pick<OneBotConfig, "remoteBaseUrl" | "httpUrl" | "wsUrl"> {
  const url = parseRemoteUrl(value);
  if (!url) {
    return {
      remoteBaseUrl: "",
      httpUrl: "",
      wsUrl: ""
    };
  }

  const pathParts = url.pathname.split("/").filter(Boolean);
  const lastPart = pathParts.at(-1)?.toLowerCase();
  const baseParts = lastPart === "botapi" || lastPart === "websocket" ? pathParts.slice(0, -1) : pathParts;
  const httpProtocol = url.protocol === "http:" || url.protocol === "ws:" ? "http:" : "https:";
  const wsProtocol = httpProtocol === "https:" ? "wss:" : "ws:";

  return {
    remoteBaseUrl: formatRemoteUrl(httpProtocol, url.host, baseParts),
    httpUrl: formatRemoteUrl(httpProtocol, url.host, [...baseParts, "botApi"]),
    wsUrl: formatRemoteUrl(wsProtocol, url.host, [...baseParts, "websocket"])
  };
}

function normalizeRemoteBaseUrl(value: string | undefined): string {
  return inferRemoteBaseUrl(value || "");
}

function inferRemoteBaseUrl(value: string): string {
  const url = parseRemoteUrl(value);
  if (!url) {
    return "";
  }

  const pathParts = url.pathname.split("/").filter(Boolean);
  const lastPart = pathParts.at(-1)?.toLowerCase();
  const baseParts = lastPart === "botapi" || lastPart === "websocket" ? pathParts.slice(0, -1) : pathParts;
  const httpProtocol = url.protocol === "http:" || url.protocol === "ws:" ? "http:" : "https:";
  return formatRemoteUrl(httpProtocol, url.host, baseParts);
}

function parseRemoteUrl(value: string): URL | null {
  const trimmed = trimTrailingSlash(value.trim());
  if (!trimmed) {
    return null;
  }

  const withProtocol = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL(withProtocol);
  } catch {
    return null;
  }
}

function formatRemoteUrl(protocol: string, host: string, pathParts: string[]): string {
  const path = pathParts.length ? `/${pathParts.join("/")}` : "";
  return `${protocol}//${host}${path}`;
}

function normalizeOneBotConfigMode(value: Partial<OneBotConfig> | null | undefined): OneBotConfigMode {
  if (value?.mode === "local" || value?.mode === "remote") {
    return value.mode;
  }

  if (value?.remoteBaseUrl) {
    return "remote";
  }

  if (isLocalUrl(value?.httpUrl) && isLocalUrl(value?.wsUrl)) {
    return "local";
  }

  if (value?.httpUrl || value?.wsUrl) {
    return "remote";
  }

  return DEFAULT_ONEBOT_CONFIG.mode;
}

function normalizeOneBotProtocolMode(value: Partial<OneBotConfig> | null | undefined): OneBotProtocolMode {
  if (value?.protocol === "http" || value?.protocol === "websocket") {
    return value.protocol;
  }

  if (value?.wsUrl && !value.httpUrl) {
    return "websocket";
  }

  return DEFAULT_ONEBOT_CONFIG.protocol;
}

function isLocalUrl(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  try {
    const hostname = new URL(value).hostname;
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
  } catch {
    return false;
  }
}

function extractUrlPort(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).port || undefined;
  } catch {
    return undefined;
  }
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}
