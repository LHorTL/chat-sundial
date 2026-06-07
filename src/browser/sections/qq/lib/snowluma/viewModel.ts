import type { SnowLumaAccountStatus, SnowLumaAccountSummary, SnowLumaInstallProgress, SnowLumaProtocolPortStatus, SnowLumaQqStatus, SnowLumaStartMode, SnowLumaStatus } from "./types";

const SNOWLUMA_MIN_QQ_VERSION = "9.9.29";
const QQ_DOWNLOAD_URL = "https://im.qq.com/index/#/";

interface SnowLumaQqVersionSupport {
  supported: boolean;
  unknown: boolean;
  minimumVersion: string;
  downloadUrl: string;
  currentVersion?: string;
  message?: string;
}

export interface SnowLumaInstallViewState {
  statusLabel: string;
  installLabel: string;
  installDisabled: boolean;
  tone: "success" | "warning" | "danger" | "neutral";
}

export interface SnowLumaControlViewState {
  runLabel: string;
  canStart: boolean;
  canStop: boolean;
  canRestart: boolean;
  canOpenWebUi: boolean;
  tone: "success" | "warning" | "danger" | "neutral";
}

export interface SnowLumaVersionActionState {
  label: string;
  icon: "download" | "check2" | "alert" | "sync";
  variant: "default" | "primary" | "ghost" | "danger";
  tone: "success" | "warning" | "danger" | "neutral";
  description: string;
}

export interface SnowLumaStartModeOption {
  mode: SnowLumaStartMode;
  label: string;
  description: string;
  disabled: boolean;
  disabledReason?: string;
}

export interface SnowLumaUninstallViewState {
  label: string;
  disabled: boolean;
  reason?: string;
}

export interface SnowLumaManualDownloadViewState {
  visible: boolean;
  hint: string;
}

export interface SnowLumaProtocolPortTagState {
  label: string;
  tone: "success" | "danger" | "neutral";
}

export interface SnowLumaReadinessState {
  visible: boolean;
  title: string;
  description: string;
  tagLabel: string;
  tagTone: "success" | "warning" | "danger" | "neutral";
  action: "initialize" | "start" | "openQqDownload" | "none";
  buttonLabel?: string;
  buttonIcon?: "download" | "play" | "sync" | "check2" | "alert";
  buttonVariant?: "default" | "primary" | "ghost" | "danger";
  disabled: boolean;
}

export interface SnowLumaLiveRefreshPlan {
  intervalMs: number;
  mode: "none" | "status" | "logs";
}

export const SNOWLUMA_ACCOUNT_REFRESH_INTERVAL_MS = 2500;
export const SNOWLUMA_ACCOUNT_IDLE_REFRESH_INTERVAL_MS = 5000;
export const SNOWLUMA_STATUS_REFRESH_INTERVAL_MS = 5000;

export type SnowLumaActionKind = "installLatest" | "installBundled" | "uninstall" | "start" | "stop" | "restart" | "openInstallFolder" | "openDownloadUrl" | "openQqDownloadUrl" | "openWebUi";
export type SnowLumaMessageScope = "download" | "control";

export interface SnowLumaScopedMessage {
  scope: SnowLumaMessageScope;
  text: string;
}

export interface SnowLumaQqVersionGuard extends SnowLumaQqVersionSupport {
  blocked: boolean;
}

/** 把 SnowLuma 安装状态转换成下载页按钮和标签展示状态。 */
export function getSnowLumaInstallState(status: Pick<SnowLumaStatus, "platform" | "installState" | "installedVersion" | "latestVersion" | "bundledVersion" | "runState" | "installProgress">): SnowLumaInstallViewState {
  if (status.platform !== "win32" || status.installState === "unsupported") {
    return {
      statusLabel: "当前平台不支持",
      installLabel: "仅 Windows 可用",
      installDisabled: true,
      tone: "neutral"
    };
  }

  if (status.installState === "installing") {
    return {
      statusLabel: status.installProgress?.phase === "extracting" ? "解压中" : "安装中",
      installLabel: status.installProgress?.phase === "extracting" ? "正在解压" : "正在下载",
      installDisabled: true,
      tone: "warning"
    };
  }

  if (status.installState === "error") {
    const installLabel = status.bundledVersion && !status.latestVersion ? `安装内置 ${status.bundledVersion}` : "重新安装";
    return {
      statusLabel: "安装失败",
      installLabel,
      installDisabled: status.runState === "running" || status.runState === "starting",
      tone: "danger"
    };
  }

  if (status.installState === "installed") {
    const hasUpdate = Boolean(status.installedVersion && status.latestVersion && status.installedVersion !== status.latestVersion);
    const hasBundledUpdate = Boolean(
      !hasUpdate &&
      status.installedVersion &&
      status.bundledVersion &&
      compareSnowLumaVersionTags(status.installedVersion, status.bundledVersion) < 0
    );
    return {
      statusLabel: hasUpdate ? "发现新版本" : hasBundledUpdate ? "发现内置更新" : "已安装",
      installLabel: hasUpdate ? `更新到 ${status.latestVersion}` : hasBundledUpdate ? `使用内置包更新到 ${status.bundledVersion}` : "重新安装",
      installDisabled: status.runState === "running" || status.runState === "starting",
      tone: hasUpdate || hasBundledUpdate ? "warning" : "success"
    };
  }

  const installLabel = status.installProgress?.phase === "ready-to-extract"
    ? "解压安装"
    : status.bundledVersion && (!status.latestVersion || status.latestVersion === status.bundledVersion)
      ? `安装内置 ${status.bundledVersion}`
      : "下载并安装";

  return {
    statusLabel: "未安装",
    installLabel,
    installDisabled: false,
    tone: "neutral"
  };
}

/** 把安装状态转换成操控页信息面板中的安装/版本抽屉入口。 */
export function getSnowLumaVersionActionState(status: Pick<SnowLumaStatus, "platform" | "installState" | "installedVersion" | "latestVersion" | "bundledVersion">): SnowLumaVersionActionState {
  if (status.platform !== "win32" || status.installState === "unsupported") {
    return {
      label: "当前平台不支持",
      icon: "alert",
      variant: "default",
      tone: "neutral",
      description: "打开版本与安装抽屉查看说明"
    };
  }

  if (status.installState === "installing") {
    return {
      label: "安装中",
      icon: "sync",
      variant: "default",
      tone: "warning",
      description: "打开版本与安装抽屉查看进度"
    };
  }

  if (status.installState === "installed") {
    const hasUpdate = Boolean(status.installedVersion && status.latestVersion && status.installedVersion !== status.latestVersion);
    const hasBundledUpdate = Boolean(
      !hasUpdate &&
      status.installedVersion &&
      status.bundledVersion &&
      compareSnowLumaVersionTags(status.installedVersion, status.bundledVersion) < 0
    );
    const updateVersion = hasUpdate ? status.latestVersion : hasBundledUpdate ? status.bundledVersion : undefined;
    return {
      label: updateVersion ? `${status.installedVersion} → ${updateVersion}` : status.installedVersion || "已安装",
      icon: updateVersion ? "download" : "check2",
      variant: updateVersion ? "primary" : "default",
      tone: updateVersion ? "warning" : "success",
      description: updateVersion ? "发现可用更新，打开抽屉进行更新" : "打开版本与安装抽屉查看详情"
    };
  }

  return {
    label: "立即安装",
    icon: "download",
    variant: status.installState === "error" ? "danger" : "primary",
    tone: status.installState === "error" ? "danger" : "neutral",
    description: "打开版本与安装抽屉下载 SnowLuma"
  };
}

/** 把 SnowLuma 安装进度转换成下载页提示文案。 */
export function getSnowLumaInstallProgressLabel(progress: SnowLumaInstallProgress | undefined): string {
  if (!progress || progress.phase === "idle") return "";
  if (progress.phase === "downloading") {
    return `下载中${typeof progress.percent === "number" ? ` ${progress.percent}%` : ""}`;
  }
  if (progress.phase === "extracting") {
    return `解压中${progress.detail ? ` ${progress.detail}` : ""}`;
  }
  if (progress.phase === "ready-to-extract") {
    return `已检测到安装包${progress.detail ? ` ${progress.detail}` : ""}`;
  }
  if (progress.phase === "completed") return "安装完成";
  return progress.detail || "安装失败";
}

/** 判断安装进度是否需要渲染进度条，已检测到本地包只显示文字状态。 */
export function shouldShowSnowLumaInstallProgress(progress: SnowLumaInstallProgress | undefined): boolean {
  return progress?.phase === "downloading" || progress?.phase === "extracting";
}

/** 判断 SnowLuma 页面需要用哪种自动刷新策略，运行中只轻量刷新日志。 */
export function getSnowLumaLiveRefreshPlan(status: Pick<SnowLumaStatus, "installState" | "runState">, loading: boolean): SnowLumaLiveRefreshPlan {
  if (loading && status.installState === "installing") {
    return {
      intervalMs: 600,
      mode: "status"
    };
  }

  if (status.runState === "starting" || status.runState === "running" || status.runState === "stopping") {
    return {
      intervalMs: 1000,
      mode: "logs"
    };
  }

  return {
    intervalMs: 0,
    mode: "none"
  };
}

/** 判断完整状态自动刷新频率，用于同步安装包、QQ 状态、版本和本地目录变化。 */
export function getSnowLumaStatusRefreshInterval(status: Pick<SnowLumaStatus, "platform" | "installState">, loading: boolean): number {
  if (status.platform !== "win32" || (loading && status.installState === "installing")) {
    return 0;
  }

  return SNOWLUMA_STATUS_REFRESH_INTERVAL_MS;
}

/** 把 SnowLuma 可用性转换为倒计时和群监控页面的轻量引导按钮。 */
export function getSnowLumaReadinessState(status: Pick<SnowLumaStatus, "platform" | "installState" | "runState" | "installedVersion" | "bundledVersion" | "qqStatus">): SnowLumaReadinessState {
  if (status.platform !== "win32" || status.installState === "unsupported") {
    return {
      visible: true,
      title: "SnowLuma 不可用",
      description: "当前平台暂不支持 SnowLuma 本地初始化和启动。",
      tagLabel: "不支持",
      tagTone: "neutral",
      action: "none",
      disabled: true
    };
  }

  if (status.installState === "installing") {
    return {
      visible: true,
      title: "SnowLuma 初始化中",
      description: "正在解压或安装 SnowLuma，完成后即可启动使用。",
      tagLabel: "处理中",
      tagTone: "warning",
      action: "none",
      buttonLabel: "处理中",
      buttonIcon: "sync",
      buttonVariant: "default",
      disabled: true
    };
  }

  if (status.installState === "missing" || status.installState === "error") {
    const canInitialize = Boolean(status.bundledVersion);
    return {
      visible: true,
      title: "SnowLuma 未安装",
      description: canInitialize ? `可使用内置包 ${status.bundledVersion} 自动完成初始化。` : "当前安装包未内置 SnowLuma，请先到 SnowLuma 管理页完成安装。",
      tagLabel: "需初始化",
      tagTone: status.installState === "error" ? "danger" : "warning",
      action: canInitialize ? "initialize" : "none",
      buttonLabel: canInitialize ? "初始化" : "未内置",
      buttonIcon: canInitialize ? "download" : "alert",
      buttonVariant: canInitialize ? "primary" : "default",
      disabled: !canInitialize
    };
  }

  const qqVersionGuard = getSnowLumaQqVersionGuard(status);
  if (qqVersionGuard.blocked) {
    return {
      visible: true,
      title: "QQ 版本过低",
      description: qqVersionGuard.message || `SnowLuma 需要 QQ ${SNOWLUMA_MIN_QQ_VERSION} 或以上版本。`,
      tagLabel: "需升级 QQ",
      tagTone: "warning",
      action: "openQqDownload",
      buttonLabel: "下载新版 QQ",
      buttonIcon: "download",
      buttonVariant: "primary",
      disabled: false
    };
  }

  if (status.runState === "running") {
    return {
      visible: true,
      title: "SnowLuma 已运行",
      description: "倒计时发送和群状态监控可以使用当前 OneBot 连接。",
      tagLabel: status.installedVersion || "已运行",
      tagTone: "success",
      action: "none",
      disabled: true
    };
  }

  if (status.runState === "starting" || status.runState === "stopping") {
    return {
      visible: true,
      title: status.runState === "starting" ? "SnowLuma 启动中" : "SnowLuma 停止中",
      description: "请稍等当前操作完成。",
      tagLabel: "处理中",
      tagTone: "warning",
      action: "none",
      buttonLabel: "处理中",
      buttonIcon: "sync",
      buttonVariant: "default",
      disabled: true
    };
  }

  return {
    visible: true,
    title: "SnowLuma 未启动",
    description: "需要先启动 SnowLuma，才能让 OneBot 服务保持可用。",
    tagLabel: status.installedVersion || "已安装",
    tagTone: "warning",
    action: "start",
    buttonLabel: "启动",
    buttonIcon: "play",
    buttonVariant: "primary",
    disabled: false
  };
}

/** 判断启动后是否继续刷新账号列表，用于等待 OneBot 返回昵称等资料。 */
export function getSnowLumaAccountRefreshInterval(
  status: Pick<SnowLumaStatus, "installState" | "runState">,
  accounts: Array<Pick<SnowLumaAccountSummary, "status" | "nickname">>,
  accountsLoading: boolean
): number {
  if (accountsLoading || status.installState !== "installed") {
    return 0;
  }

  const hasNoAccountsYet = accounts.length === 0;
  const hasNoOnlineAccountsYet = accounts.length > 0 && accounts.every((account) => account.status !== "online");
  const hasOnlineAccountWithoutName = accounts.some((account) => account.status === "online" && !account.nickname);
  const shouldUseStartupRefresh = status.runState === "starting" || status.runState === "running";

  if (shouldUseStartupRefresh && (hasNoAccountsYet || hasNoOnlineAccountsYet || hasOnlineAccountWithoutName)) {
    return SNOWLUMA_ACCOUNT_REFRESH_INTERVAL_MS;
  }

  return SNOWLUMA_ACCOUNT_IDLE_REFRESH_INTERVAL_MS;
}

/** 找出启动后可自动连接的唯一 SnowLuma 账号；不满足唯一可接入条件时返回空字符串。 */
export function getSnowLumaAutoConnectAccountUin(
  status: Pick<SnowLumaStatus, "installState" | "runState">,
  accounts: Array<Pick<SnowLumaAccountSummary, "uin" | "status" | "httpPort">>,
  selectedAccountUin: string,
  accountsLoading: boolean
): string {
  if (
    accountsLoading ||
    selectedAccountUin ||
    status.installState !== "installed" ||
    status.runState !== "running"
  ) {
    return "";
  }

  const connectableAccounts = accounts.filter((account) => account.status === "online" && Boolean(account.httpPort));
  return connectableAccounts.length === 1 ? connectableAccounts[0].uin : "";
}

/** 返回当前应展示的 SnowLuma 错误；状态恢复后返回空字符串以清掉旧错误。 */
export function getSnowLumaStatusError(status: Pick<SnowLumaStatus, "error">): string {
  return status.error || "";
}

/** 截取日志展示区需要渲染的最新消息，避免旧日志挤占可读空间。 */
export function getSnowLumaVisibleLogs(logs: string[] | undefined, limit = 80): string[] {
  return (logs ?? []).slice(-limit);
}

/** 根据动作类型生成只属于对应页签的成功提示。 */
export function getSnowLumaActionMessage(action: SnowLumaActionKind, startMode?: SnowLumaStartMode): SnowLumaScopedMessage {
  if (action === "installBundled") {
    return { scope: "download", text: "SnowLuma 初始化完成" };
  }

  if (action === "installLatest") {
    return { scope: "download", text: "SnowLuma 安装完成" };
  }

  if (action === "uninstall") {
    return { scope: "download", text: "SnowLuma 已卸载" };
  }

  if (action === "openInstallFolder") {
    return { scope: "download", text: "已打开安装文件夹" };
  }

  if (action === "openDownloadUrl") {
    return { scope: "download", text: "已在浏览器打开完整包下载地址" };
  }

  if (action === "openQqDownloadUrl") {
    return { scope: "control", text: "已打开新版 QQ 下载页" };
  }

  if (action === "openWebUi") {
    return { scope: "control", text: "已打开 WebUI，登录密码已复制到剪切板" };
  }

  if (action === "start" && startMode === "cold") {
    return { scope: "control", text: "冷启动已提交" };
  }

  if (action === "start") {
    return { scope: "control", text: "热启动已提交" };
  }

  return { scope: "control", text: "操作已提交" };
}

/** 生成应用内下载失败后的浏览器兜底入口和目标目录提示。 */
export function getSnowLumaManualDownloadState(status: Pick<SnowLumaStatus, "installState" | "installProgress" | "latestAssetName" | "installFolderPath">): SnowLumaManualDownloadViewState {
  const downloadFailed = status.installState === "error" || status.installProgress?.phase === "error";
  if (!downloadFailed) {
    return {
      visible: false,
      hint: ""
    };
  }

  const assetName = status.latestAssetName || "SnowLuma Windows x64 完整包";
  const folderPath = status.installFolderPath || "安装文件夹";
  return {
    visible: true,
    hint: `应用内下载失败时，可以点击“浏览器下载完整包”，下载 ${assetName} 后放入 ${folderPath}，然后回到这里刷新或重新安装。`
  };
}

/** 推导卸载按钮状态，避免运行中直接删除 sidecar 文件。 */
export function getSnowLumaUninstallState(status: Pick<SnowLumaStatus, "platform" | "installState" | "runState">): SnowLumaUninstallViewState {
  if (status.platform !== "win32" || status.installState === "unsupported") {
    return {
      label: "卸载",
      disabled: true,
      reason: "当前平台不支持"
    };
  }

  if (status.installState !== "installed") {
    return {
      label: "卸载",
      disabled: true,
      reason: "尚未安装"
    };
  }

  if (status.runState === "running" || status.runState === "starting" || status.runState === "stopping") {
    return {
      label: "卸载",
      disabled: true,
      reason: "请先停止 SnowLuma"
    };
  }

  return {
    label: "卸载",
    disabled: false
  };
}

/** 把 QQ 运行态转换为操控页状态文案。 */
export function getSnowLumaQqStatusLabel(status: SnowLumaQqStatus | undefined): string {
  if (!status) return "检测中";
  if (status.running) return `运行中 · ${status.processes.length} 个进程`;
  if (status.source === "memory") return "未运行 · 已记住路径";
  if (status.error) return "检测失败";
  return "未运行";
}

/** 判断 QQ 当前版本是否阻断 SnowLuma 启动。 */
export function getSnowLumaQqVersionGuard(status: Pick<SnowLumaStatus, "qqStatus">): SnowLumaQqVersionGuard {
  const support = getSnowLumaQqVersionSupport(status.qqStatus?.version);
  return {
    ...support,
    blocked: !support.supported,
    downloadUrl: support.downloadUrl || QQ_DOWNLOAD_URL,
    minimumVersion: support.minimumVersion || SNOWLUMA_MIN_QQ_VERSION
  };
}

/** 生成启动模式弹窗中的模式选项和禁用原因。 */
export function getSnowLumaStartModeOptions(status: Pick<SnowLumaStatus, "platform" | "installState" | "runState" | "qqStatus">): SnowLumaStartModeOption[] {
  const baseDisabled = status.platform !== "win32" || status.installState !== "installed" || status.runState === "starting" || status.runState === "running" || status.runState === "stopping";
  const coldDisabledReason = !status.qqStatus?.executablePath ? "未检测到 QQ 路径" : undefined;
  const qqVersionGuard = getSnowLumaQqVersionGuard(status);
  const qqVersionDisabledReason = qqVersionGuard.blocked ? qqVersionGuard.message : undefined;

  return [
    {
      mode: "hot",
      label: "热启动",
      description: "适合 QQ 已经打开的情况。启动 SnowLuma 后自动接入当前运行中的 QQ 进程。",
      disabled: baseDisabled || Boolean(qqVersionDisabledReason),
      disabledReason: qqVersionDisabledReason
    },
    {
      mode: "cold",
      label: "冷启动",
      description: "适合先退出 QQ 后使用。SnowLuma 会先启动，再打开已检测到的 QQ 路径。",
      disabled: baseDisabled || Boolean(qqVersionDisabledReason || coldDisabledReason),
      disabledReason: qqVersionDisabledReason || coldDisabledReason
    }
  ];
}

/** 把 SnowLuma 运行状态转换成操控页按钮可用性和标签展示状态。 */
export function getSnowLumaControlState(status: Pick<SnowLumaStatus, "platform" | "installState" | "runState" | "webUiUrl" | "qqStatus">): SnowLumaControlViewState {
  const unsupported = status.platform !== "win32" || status.installState === "unsupported";
  const installed = status.installState === "installed";
  const busy = status.runState === "starting" || status.runState === "stopping";
  const running = status.runState === "running";
  const qqVersionBlocked = getSnowLumaQqVersionGuard(status).blocked;

  return {
    runLabel: getSnowLumaRunStateLabel(status.runState, unsupported, installed),
    canStart: !unsupported && installed && !busy && !running && !qqVersionBlocked,
    canStop: !unsupported && installed && running,
    canRestart: !unsupported && installed && running && !qqVersionBlocked,
    canOpenWebUi: !unsupported && running && Boolean(status.webUiUrl),
    tone: running ? "success" : busy ? "warning" : status.runState === "error" ? "danger" : "neutral"
  };
}

/** 把 SnowLuma 账号接入状态转换成列表标签文案。 */
export function getSnowLumaAccountStatusLabel(status: SnowLumaAccountStatus): string {
  if (status === "online") return "在线";
  if (status === "offline") return "离线";
  if (status === "unsupported") return "不支持自动接入";
  return "配置异常";
}

/** 把 OneBot 协议端口探测结果转换为账号卡片里的 Tag 文案。 */
export function getSnowLumaProtocolPortTagState(protocol: "HTTP" | "WS", port: number | undefined, status: SnowLumaProtocolPortStatus | undefined): SnowLumaProtocolPortTagState {
  if (!port) {
    return {
      label: `${protocol} 未配置`,
      tone: "neutral"
    };
  }

  if (status === "online") {
    return {
      label: `${protocol} ${port} ${protocol === "HTTP" ? "可用" : "监听"}`,
      tone: "success"
    };
  }

  if (status === "offline") {
    return {
      label: `${protocol} ${port} ${protocol === "HTTP" ? "离线" : "未监听"}`,
      tone: "danger"
    };
  }

  return {
    label: `${protocol} ${port} 检测中`,
    tone: "neutral"
  };
}

/** 把运行态组合转换为用户可读文案。 */
function getSnowLumaRunStateLabel(runState: SnowLumaStatus["runState"], unsupported: boolean, installed: boolean) {
  if (unsupported) return "当前平台不支持";
  if (!installed) return "未安装";
  if (runState === "starting") return "启动中";
  if (runState === "running") return "运行中";
  if (runState === "stopping") return "停止中";
  if (runState === "exited") return "已退出";
  if (runState === "error") return "异常";
  return "未启动";
}

/** 比较 vX.Y.Z 版本标签，用于判断内置包是否可作为更新目标。 */
function compareSnowLumaVersionTags(left: string, right: string) {
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
function getSnowLumaQqVersionSupport(version: string | undefined): SnowLumaQqVersionSupport {
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

/** 从版本标签中提取数字部分，非数字片段按 0 处理。 */
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
