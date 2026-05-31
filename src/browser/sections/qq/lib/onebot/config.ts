import type {
  OneBotActionRequest,
  OneBotConfig,
  OneBotConfigMode,
  OneBotProtocolMode,
  OneBotWebSocketActionPayload
} from "./types";

export const DEFAULT_ONEBOT_CONFIG: OneBotConfig = {
  mode: "local",
  protocol: "http",
  localPort: "5700",
  remoteBaseUrl: "",
  httpUrl: "http://127.0.0.1:5700",
  wsUrl: "ws://127.0.0.1:5700",
  accessToken: ""
};

/** 归一化 OneBot 配置，补齐本地/远程 HTTP 和 WebSocket 入口。 */
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

/** 归一化本地 OneBot 端口，非法端口回退默认值。 */
export function normalizeOneBotLocalPort(value: string): string {
  const port = Number(value.trim());
  if (Number.isInteger(port) && port >= 1 && port <= 65535) {
    return String(port);
  }

  return DEFAULT_ONEBOT_CONFIG.localPort;
}

/** 构造 OneBot HTTP action 请求，统一带上 JSON 头和 token。 */
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

/** 构造 OneBot WebSocket action payload，并为响应匹配生成 echo。 */
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

/** 构造带 access_token 查询参数的 WebSocket 连接地址。 */
export function buildOneBotWebSocketUrl(config: OneBotConfig): string {
  const normalized = normalizeOneBotConfig(config);
  if (!normalized.accessToken) {
    return normalized.wsUrl;
  }

  const url = new URL(normalized.wsUrl);
  url.searchParams.set("access_token", normalized.accessToken);
  return url.toString();
}

/** 去掉 URL 尾部多余斜杠，避免拼接 action 时出现双斜杠。 */
function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/** 根据远程配置推导 HTTP/WebSocket 端点。 */
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

/** 从任一远程入口推导标准 base、botApi 和 websocket 地址。 */
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

/** 归一化远程基础地址，无法解析时返回空字符串。 */
function normalizeRemoteBaseUrl(value: string | undefined): string {
  return inferRemoteBaseUrl(value || "");
}

/** 从历史保存的 HTTP 或 WebSocket 地址反推远程基础地址。 */
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

/** 解析远程 URL，缺少协议时默认补 https。 */
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

/** 按协议、host 和路径片段拼出标准 URL。 */
function formatRemoteUrl(protocol: string, host: string, pathParts: string[]): string {
  const path = pathParts.length ? `/${pathParts.join("/")}` : "";
  return `${protocol}//${host}${path}`;
}

/** 归一化本地/远程模式，兼容旧配置中只保存 URL 的情况。 */
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

/** 归一化 HTTP/WebSocket 协议模式，未知时优先回退 HTTP。 */
function normalizeOneBotProtocolMode(value: Partial<OneBotConfig> | null | undefined): OneBotProtocolMode {
  if (value?.protocol === "http" || value?.protocol === "websocket") {
    return value.protocol;
  }

  if (value?.wsUrl && !value.httpUrl) {
    return "websocket";
  }

  return DEFAULT_ONEBOT_CONFIG.protocol;
}

/** 判断 URL 是否指向本机 OneBot 服务。 */
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

/** 从 URL 中提取端口，无法解析时返回空值。 */
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
