import { createHash, scryptSync } from "crypto";

export type SnowLumaInstallState = "unsupported" | "missing" | "installed" | "installing" | "error";
export type SnowLumaRunState = "stopped" | "starting" | "running" | "stopping" | "exited" | "error";
export type SnowLumaAccountStatus = "online" | "offline" | "unsupported" | "invalid";
export type SnowLumaProtocolPortStatus = "online" | "offline" | "unknown";
export type SnowLumaInstallPhase = "idle" | "downloading" | "extracting" | "ready-to-extract" | "completed" | "error";
export type SnowLumaStartMode = "hot" | "cold";
export type SnowLumaQqStatusSource = "running" | "memory" | "unknown";

export interface SnowLumaReleaseAsset {
  name: string;
  size: number;
  browserDownloadUrl: string;
}

export interface SnowLumaReleaseInfo {
  tag_name?: string;
  html_url?: string;
  assets?: Array<{
    name?: string;
    size?: number;
    browser_download_url?: string;
  }>;
}

export interface SnowLumaElectronProxyConfig {
  proxyRules: string;
  proxyBypassRules?: string;
}

export interface SnowLumaInstallManifest {
  version: string;
  assetName: string;
  rootDir: string;
  installedAt: string;
  releaseUrl?: string;
}

export interface SnowLumaBundledArchiveManifest {
  version: string;
  assetName: string;
  assetSize?: number;
  archiveSha256: string;
  releaseUrl?: string;
  bundledAt: string;
}

export interface SnowLumaInstallProgress {
  phase: SnowLumaInstallPhase;
  percent?: number;
  receivedBytes?: number;
  totalBytes?: number;
  detail?: string;
}

export interface SnowLumaInstallProgressInput {
  currentProgress: SnowLumaInstallProgress;
  hasManifest: boolean;
  installStateOverride?: SnowLumaInstallState | null;
  manualArchiveName?: string;
}

export interface SnowLumaAccountSummary {
  uin: string;
  nickname?: string;
  avatarUrl?: string;
  httpPort?: number;
  wsPort?: number;
  wsPath?: string;
  httpPortStatus?: SnowLumaProtocolPortStatus;
  wsPortStatus?: SnowLumaProtocolPortStatus;
  accessToken?: string;
  wsAccessToken?: string;
  status: SnowLumaAccountStatus;
  statusDetail?: string;
}

export interface SnowLumaQqProcessSummary {
  pid: number;
  name?: string;
  executablePath?: string;
  version?: string;
}

export interface SnowLumaQqStatus {
  running: boolean;
  processes: SnowLumaQqProcessSummary[];
  executablePath?: string;
  version?: string;
  source: SnowLumaQqStatusSource;
  error?: string;
}

export interface SnowLumaQqVersionSupport {
  supported: boolean;
  unknown: boolean;
  minimumVersion: string;
  downloadUrl: string;
  currentVersion?: string;
  message?: string;
}

export interface SnowLumaWebUiAuthConfig {
  passwordHash: string;
  passwordSalt: string;
  mustChangePassword: boolean;
  generatedAt: string;
  updatedAt: string;
}

export interface SnowLumaProcessExitInput {
  code: number | null;
  signal: string | null;
  expectedStop: boolean;
}

export interface SnowLumaProcessExitState {
  runState: Extract<SnowLumaRunState, "stopped" | "exited" | "error">;
  error: string;
}

export interface SnowLumaWsProbeRequestInput {
  host: string;
  port: number;
  path?: string;
  accessToken?: string;
  key: string;
}

export type SnowLumaInstallSource = "manual" | "bundled" | "online";

export interface SnowLumaInstallCandidateInput {
  installedVersion?: string;
  latestVersion?: string;
  latestAssetName?: string;
  latestAssetUrl?: string;
  bundledVersion?: string;
  bundledAssetName?: string;
  manualArchiveName?: string;
}

export interface SnowLumaInstallCandidate {
  source: SnowLumaInstallSource;
  version: string;
  assetName: string;
  assetUrl?: string;
}

const WEBSOCKET_ACCEPT_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
export const SNOWLUMA_MIN_QQ_VERSION = "9.9.29";
export const QQ_DOWNLOAD_URL = "https://im.qq.com/index/#/";

/** 从 GitHub release 中选择完整 Windows x64 包，明确排除 lite 包。 */
export function selectSnowLumaWinX64Asset(release: SnowLumaReleaseInfo): SnowLumaReleaseAsset | null {
  const tag = typeof release.tag_name === "string" ? release.tag_name : "";
  const expectedName = tag ? `SnowLuma-${tag}-win-x64.zip` : "";
  const asset = release.assets?.find((item) => item.name === expectedName);

  if (!asset?.name || !asset.browser_download_url || typeof asset.size !== "number") {
    return null;
  }

  return {
    name: asset.name,
    size: asset.size,
    browserDownloadUrl: asset.browser_download_url
  };
}

/** 从安装目录文件名中查找用户手动放入的完整 SnowLuma zip，明确排除 lite 包。 */
export function findSnowLumaDownloadedArchive(version: string, fileNames: string[]): string | null {
  const expectedName = `SnowLuma-${version}-win-x64.zip`;
  return fileNames.find((fileName) => fileName === expectedName) ?? null;
}

/** 解析随应用打包的 SnowLuma 离线包 manifest，确保指向完整包且 zip 存在。 */
export function parseSnowLumaBundledArchiveManifest(
  value: unknown,
  archiveExists: (assetName: string) => boolean
): SnowLumaBundledArchiveManifest | null {
  if (!isRecord(value)) {
    return null;
  }

  const version = normalizeString(value.version);
  const assetName = normalizeString(value.assetName);
  const archiveSha256 = normalizeString(value.archiveSha256);
  const bundledAt = normalizeString(value.bundledAt);
  if (!version || !assetName || !archiveSha256 || !bundledAt || assetName !== `SnowLuma-${version}-win-x64.zip`) {
    return null;
  }

  if (!archiveExists(assetName)) {
    return null;
  }

  const assetSize = typeof value.assetSize === "number" && Number.isFinite(value.assetSize) ? value.assetSize : undefined;
  return {
    version,
    assetName,
    assetSize,
    archiveSha256,
    releaseUrl: normalizeString(value.releaseUrl),
    bundledAt
  };
}

/** 按优先级选择本次安装来源：手动包、同版本内置包、在线下载或离线内置兜底。 */
export function resolveSnowLumaInstallCandidate(input: SnowLumaInstallCandidateInput): SnowLumaInstallCandidate | null {
  if (input.latestVersion && input.manualArchiveName) {
    return {
      source: "manual",
      version: input.latestVersion,
      assetName: input.manualArchiveName
    };
  }

  if (input.latestVersion && input.bundledVersion === input.latestVersion && input.bundledAssetName) {
    return {
      source: "bundled",
      version: input.bundledVersion,
      assetName: input.bundledAssetName
    };
  }

  if (input.latestVersion && input.latestAssetName && input.latestAssetUrl) {
    return {
      source: "online",
      version: input.latestVersion,
      assetName: input.latestAssetName,
      assetUrl: input.latestAssetUrl
    };
  }

  if (!input.bundledVersion || !input.bundledAssetName) {
    return null;
  }

  if (input.installedVersion && compareSnowLumaVersionTags(input.installedVersion, input.bundledVersion) > 0) {
    return null;
  }

  return {
    source: "bundled",
    version: input.bundledVersion,
    assetName: input.bundledAssetName
  };
}

/** 比较 SnowLuma vX.Y.Z 标签，返回值遵循 Array.sort comparator 约定。 */
export function compareSnowLumaVersionTags(left: string, right: string) {
  const leftParts = versionTagParts(left);
  const rightParts = versionTagParts(right);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const delta = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (delta !== 0) {
      return delta;
    }
  }

  return left.localeCompare(right);
}

/** 判断当前 QQ 版本是否满足 SnowLuma 最低要求；无法解析版本时不阻断启动。 */
export function getSnowLumaQqVersionSupport(version: string | undefined): SnowLumaQqVersionSupport {
  const normalizedVersion = typeof version === "string" ? version.trim() : "";
  const currentParts = numericVersionParts(normalizedVersion);

  if (!normalizedVersion || currentParts.length === 0) {
    return {
      supported: true,
      unknown: true,
      minimumVersion: SNOWLUMA_MIN_QQ_VERSION,
      downloadUrl: QQ_DOWNLOAD_URL
    };
  }

  const supported = compareNumericVersions(currentParts, numericVersionParts(SNOWLUMA_MIN_QQ_VERSION)) >= 0;
  return {
    supported,
    unknown: false,
    currentVersion: normalizedVersion,
    minimumVersion: SNOWLUMA_MIN_QQ_VERSION,
    downloadUrl: QQ_DOWNLOAD_URL,
    message: supported
      ? undefined
      : `当前 QQ 版本 ${normalizedVersion} 过低，SnowLuma 需要 QQ ${SNOWLUMA_MIN_QQ_VERSION} 或以上版本。`
  };
}

/** 从常见代理环境变量中生成 Electron session 可使用的代理配置。 */
export function buildSnowLumaElectronProxyConfig(env: Partial<Record<string, string | undefined>>): SnowLumaElectronProxyConfig | null {
  const httpProxy = pickEnv(env, "HTTP_PROXY", "http_proxy");
  const httpsProxy = pickEnv(env, "HTTPS_PROXY", "https_proxy") || httpProxy;
  const httpEndpoint = normalizeProxyEndpoint(httpProxy || httpsProxy);
  const httpsEndpoint = normalizeProxyEndpoint(httpsProxy || httpProxy);

  const rules = [
    httpEndpoint ? `http=${httpEndpoint}` : null,
    httpsEndpoint ? `https=${httpsEndpoint}` : null
  ].filter(Boolean).join(";");

  if (!rules) {
    return null;
  }

  const proxyBypassRules = buildProxyBypassRules(pickEnv(env, "NO_PROXY", "no_proxy"));
  return proxyBypassRules ? { proxyRules: rules, proxyBypassRules } : { proxyRules: rules };
}

/** 生成 Windows curl.exe 下载参数，供主进程应用内下载兜底使用。 */
export function buildSnowLumaCurlDownloadArgs(url: string, targetPath: string): string[] {
  return [
    "--location",
    "--fail",
    "--show-error",
    "--silent",
    "--output",
    targetPath,
    "--connect-timeout",
    "20",
    "--retry",
    "2",
    "--retry-delay",
    "1",
    url
  ];
}

/** 构造 OneBot WebSocket 协议级探测请求，避免把任意 TCP 监听误判为 WS 可用。 */
export function buildSnowLumaWsProbeRequest({ host, port, path, accessToken, key }: SnowLumaWsProbeRequestInput): string {
  const headers = [
    `GET ${normalizePath(path)} HTTP/1.1`,
    `Host: ${host}:${port}`,
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Key: ${key}`,
    "Sec-WebSocket-Version: 13",
    "User-Agent: ChatSundial"
  ];
  const normalizedToken = normalizeString(accessToken);
  if (normalizedToken) {
    headers.push(`Authorization: Bearer ${normalizedToken}`);
  }

  return `${headers.join("\r\n")}\r\n\r\n`;
}

/** 判断本地服务是否完成了标准 WebSocket Upgrade 握手。 */
export function isSnowLumaWsHandshakeAccepted(responseText: string, key: string): boolean {
  const headerText = responseText.split(/\r\n\r\n/)[0] ?? "";
  const lines = headerText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!/^HTTP\/1\.[01]\s+101\b/i.test(lines[0] ?? "")) {
    return false;
  }

  const headers = new Map<string, string>();
  for (const line of lines.slice(1)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }

    headers.set(line.slice(0, separatorIndex).trim().toLowerCase(), line.slice(separatorIndex + 1).trim());
  }

  return headers.get("sec-websocket-accept") === buildSnowLumaWsAcceptKey(key);
}

/** 判断 GitHub release 缓存是否过期，避免自动刷新时频繁请求远端。 */
export function shouldRefreshSnowLumaReleaseCache(lastFetchedAt: number, now: number, ttlMs: number): boolean {
  return !lastFetchedAt || now - lastFetchedAt >= ttlMs;
}

/** 根据随机种子生成 SnowLuma WebUI 本次启动密码，满足 WebUI 强度规则且无空格。 */
export function buildSnowLumaWebUiPassword(seed: Uint8Array): string {
  return `SL-${Buffer.from(seed).toString("hex")}`;
}

/** 构造 SnowLuma config/webui.json 可直接使用的 scrypt 密码配置。 */
export function buildSnowLumaWebUiAuthConfig(password: string, salt: Uint8Array, now: string): SnowLumaWebUiAuthConfig {
  const passwordHash = scryptSync(password, Buffer.from(salt), 64, {
    N: 16384,
    r: 8,
    p: 1
  }).toString("hex");

  return {
    passwordHash,
    passwordSalt: Buffer.from(salt).toString("hex"),
    mustChangePassword: false,
    generatedAt: now,
    updatedAt: now
  };
}

/** 把子进程退出事件归一化，避免把用户主动停止误报为异常退出。 */
export function resolveSnowLumaProcessExit({ code, signal, expectedStop }: SnowLumaProcessExitInput): SnowLumaProcessExitState {
  if (expectedStop) {
    return {
      runState: "stopped",
      error: ""
    };
  }

  if (code === 0) {
    return {
      runState: "exited",
      error: ""
    };
  }

  return {
    runState: "error",
    error: signal ? `SnowLuma 已退出，信号 ${signal}` : `SnowLuma 已退出，退出码 ${code ?? "unknown"}`
  };
}

/** 根据安装运行态推导前端应展示的进度，安装完成后不再重复展示 100% 进度条。 */
export function resolveSnowLumaInstallProgress({
  currentProgress,
  hasManifest,
  installStateOverride,
  manualArchiveName
}: SnowLumaInstallProgressInput): SnowLumaInstallProgress {
  if (installStateOverride === "installing" || currentProgress.phase === "error") {
    return currentProgress;
  }

  if (hasManifest) {
    return { phase: "idle" };
  }

  if (manualArchiveName) {
    return {
      phase: "ready-to-extract",
      percent: 100,
      detail: manualArchiveName
    };
  }

  return { phase: "idle" };
}

/** 归一化系统进程查询结果，提取 QQ 主进程 PID、路径和文件版本。 */
export function normalizeSnowLumaQqProcesses(value: unknown): SnowLumaQqProcessSummary[] {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items
    .map((item) => normalizeSnowLumaQqProcess(item))
    .filter((item): item is SnowLumaQqProcessSummary => Boolean(item))
    .sort((left, right) => left.pid - right.pid);
}

/** 根据当前 QQ 进程和上次检测值生成操控页状态。 */
export function resolveSnowLumaQqStatus(
  processes: SnowLumaQqProcessSummary[],
  lastKnown: Pick<SnowLumaQqStatus, "executablePath" | "version"> | null,
  error?: string
): SnowLumaQqStatus {
  const primary = processes.find((item) => item.executablePath) ?? processes[0];
  if (primary) {
    return {
      running: true,
      processes,
      executablePath: primary.executablePath,
      version: primary.version,
      source: "running",
      error
    };
  }

  if (lastKnown?.executablePath || lastKnown?.version) {
    return {
      running: false,
      processes: [],
      executablePath: lastKnown.executablePath,
      version: lastKnown.version,
      source: "memory",
      error
    };
  }

  return {
    running: false,
    processes: [],
    source: "unknown",
    error
  };
}

/** 把未知异常格式化成用户可读错误，并补充常见网络错误码。 */
export function formatSnowLumaError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error.cause : undefined;
  if (isRecord(cause)) {
    const code = normalizeString(cause.code);
    if (code && !message.includes(code)) {
      return `${message} (${code})`;
    }
  }

  return message;
}

/** 根据 QQ 号生成可直接显示的 QQ 头像地址。 */
export function buildSnowLumaAccountAvatarUrl(uin: string): string {
  return `https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(uin)}&s=100`;
}

/** 把 OneBot 登录信息合并进账号摘要，补充昵称和头像。 */
export function applySnowLumaAccountLoginInfo(account: SnowLumaAccountSummary, value: unknown): SnowLumaAccountSummary {
  const record = isRecord(value) ? value : {};
  const data = isRecord(record.data) ? record.data : record;
  const nickname = normalizeString(data.nickname ?? data.name ?? data.nick);

  return {
    ...account,
    nickname: nickname || account.nickname,
    avatarUrl: account.avatarUrl || buildSnowLumaAccountAvatarUrl(account.uin)
  };
}

/** 校验并归一化 SnowLuma 安装 manifest，安装目录不存在时视为未安装。 */
export function parseSnowLumaInstallManifest(
  value: unknown,
  directoryExists: (rootDir: string) => boolean
): SnowLumaInstallManifest | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Partial<SnowLumaInstallManifest>;
  if (!record.version || !record.assetName || !record.rootDir || !record.installedAt) {
    return null;
  }

  if (!directoryExists(record.rootDir)) {
    return null;
  }

  return {
    version: String(record.version),
    assetName: String(record.assetName),
    rootDir: String(record.rootDir),
    installedAt: String(record.installedAt),
    releaseUrl: record.releaseUrl ? String(record.releaseUrl) : undefined
  };
}

/** 从 SnowLuma 的单账号 OneBot 配置中提取当前应用可接入的端口和 token。 */
export function parseSnowLumaOneBotConfig(uin: string, value: unknown): SnowLumaAccountSummary {
  if (!value || typeof value !== "object") {
    return {
      uin,
      avatarUrl: buildSnowLumaAccountAvatarUrl(uin),
      status: "invalid",
      statusDetail: "账号配置文件不是有效 JSON 对象"
    };
  }

  const record = value as Record<string, unknown>;
  const nickname = normalizeAccountNickname(record);
  const avatarUrl = buildSnowLumaAccountAvatarUrl(uin);
  const networks = isRecord(record.networks) ? record.networks : {};
  const httpServer = findEnabledServer(networks.httpServers);
  const wsServer = findEnabledServer(networks.wsServers);

  if (!httpServer) {
    return {
      uin,
      nickname,
      avatarUrl,
      wsPort: normalizePort(wsServer?.port),
      status: "invalid",
      statusDetail: "当前账号缺少可用的 OneBot HTTP server 配置"
    };
  }

  const httpPort = normalizePort(httpServer.port);
  if (!httpPort) {
    return {
      uin,
      nickname,
      avatarUrl,
      status: "invalid",
      statusDetail: "当前账号的 OneBot HTTP 端口无效"
    };
  }

  const httpPath = normalizePath(httpServer.path);
  const accessToken = normalizeString(httpServer.accessToken);
  const wsPort = normalizePort(wsServer?.port);
  const wsPath = wsServer ? normalizePath(wsServer.path) : undefined;
  const wsAccessToken = normalizeString(wsServer?.accessToken);

  if (httpPath !== "/") {
    return {
      uin,
      nickname,
      avatarUrl,
      httpPort,
      wsPort,
      wsPath,
      accessToken,
      wsAccessToken,
      status: "unsupported",
      statusDetail: "当前账号的 OneBot HTTP path 不是 /，暂不支持自动接入"
    };
  }

  return {
    uin,
    nickname,
    avatarUrl,
    httpPort,
    wsPort,
    wsPath,
    accessToken,
    wsAccessToken,
    status: "offline"
  };
}

/** 从 onebot_<uin>.json 文件名中提取 QQ 号。 */
export function parseSnowLumaAccountUin(fileName: string): string | null {
  const match = /^onebot_(\d{5,12})\.json$/i.exec(fileName);
  return match?.[1] ?? null;
}

/** 判断未知值是否为普通对象，供 JSON 配置解析使用。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 按大小写候选名读取环境变量，跳过空字符串。 */
function pickEnv(env: Partial<Record<string, string | undefined>>, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = env[name];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

/** 归一化代理地址为 Electron proxyRules 支持的 endpoint。 */
function normalizeProxyEndpoint(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const urlText = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `http://${value}`;
  try {
    const parsed = new URL(urlText);
    const credentials = parsed.username ? `${parsed.username}${parsed.password ? `:${parsed.password}` : ""}@` : "";
    if (parsed.protocol.startsWith("socks")) {
      return `${parsed.protocol}//${credentials}${parsed.host}`;
    }

    return `${credentials}${parsed.host}`;
  } catch {
    return null;
  }
}

/** 归一化 NO_PROXY 为 Electron 使用的分号分隔绕过规则。 */
function buildProxyBypassRules(value: string | undefined): string {
  const rules = ["<local>"];
  for (const item of value?.split(/[;,]/) ?? []) {
    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }

    rules.push(trimmed.startsWith(".") ? `*${trimmed}` : trimmed);
  }

  return Array.from(new Set(rules)).join(";");
}

/** 归一化单个 QQ 进程对象，过滤无效 PID。 */
function normalizeSnowLumaQqProcess(value: unknown): SnowLumaQqProcessSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  const rawPid = value.pid ?? value.ProcessId ?? value.processId;
  const pid = typeof rawPid === "number" ? rawPid : typeof rawPid === "string" ? Number(rawPid) : NaN;
  if (!Number.isInteger(pid) || pid <= 0) {
    return null;
  }

  return {
    pid,
    name: normalizeString(value.name ?? value.Name),
    executablePath: normalizeString(value.path ?? value.executablePath ?? value.ExecutablePath),
    version: normalizeString(value.version ?? value.ProductVersion ?? value.FileVersion)
  };
}

/** 选择第一个启用的 server 配置，跳过 enabled=false 的条目。 */
function findEnabledServer(value: unknown): Record<string, unknown> | null {
  if (!Array.isArray(value)) {
    return null;
  }

  for (const item of value) {
    if (isRecord(item) && item.enabled !== false) {
      return item;
    }
  }

  return null;
}

/** 将端口字段归一化为合法 TCP 端口。 */
function normalizePort(value: unknown): number | undefined {
  const port = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (Number.isInteger(port) && port >= 1 && port <= 65535) {
    return port;
  }

  return undefined;
}

/** 将可选字符串字段归一化，空字符串转为 undefined。 */
function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** 从 SnowLuma 可能保存的账号档案字段中提取昵称。 */
function normalizeAccountNickname(record: Record<string, unknown>): string | undefined {
  const profile = isRecord(record.profile) ? record.profile : {};
  const account = isRecord(record.account) ? record.account : {};
  const user = isRecord(record.user) ? record.user : {};
  return normalizeString(record.nickname ?? record.name ?? profile.nickname ?? profile.name ?? account.nickname ?? account.name ?? user.nickname ?? user.name);
}

/** 归一化 SnowLuma 网络 path，缺省值按根路径处理。 */
function normalizePath(value: unknown): string {
  const path = typeof value === "string" && value.trim() ? value.trim() : "/";
  return path.startsWith("/") ? path : `/${path}`;
}

/** 从 vX.Y.Z 标签中提取数字版本片段。 */
function versionTagParts(value: string) {
  return value.replace(/^v/i, "").split(".").map((part) => Number(part) || 0);
}

/** 比较数字版本片段数组，返回值遵循 Array.sort comparator 约定。 */
function compareNumericVersions(left: number[], right: number[]) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const delta = (left[index] || 0) - (right[index] || 0);
    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
}

/** 从 QQ 版本字符串中提取数字片段，兼容 9.9.29.47354-xxxx 这类格式。 */
function numericVersionParts(value: string) {
  return (value.match(/\d+/g) ?? []).map((part) => Number(part)).filter((part) => Number.isFinite(part));
}

/** 生成 WebSocket 握手响应中用于校验服务端身份的 accept key。 */
function buildSnowLumaWsAcceptKey(key: string): string {
  return createHash("sha1").update(`${key}${WEBSOCKET_ACCEPT_GUID}`).digest("base64");
}
