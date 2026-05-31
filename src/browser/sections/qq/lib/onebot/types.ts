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
