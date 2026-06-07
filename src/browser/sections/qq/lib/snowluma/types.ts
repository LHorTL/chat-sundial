export type SnowLumaInstallState = "unsupported" | "missing" | "installed" | "installing" | "error";
export type SnowLumaRunState = "stopped" | "starting" | "running" | "stopping" | "exited" | "error";
export type SnowLumaAccountStatus = "online" | "offline" | "unsupported" | "invalid";
export type SnowLumaProtocolPortStatus = "online" | "offline" | "unknown";
export type SnowLumaInstallPhase = "idle" | "downloading" | "extracting" | "ready-to-extract" | "completed" | "error";
export type SnowLumaStartMode = "hot" | "cold";
export type SnowLumaQqStatusSource = "running" | "memory" | "unknown";

export interface SnowLumaInstallProgress {
  phase: SnowLumaInstallPhase;
  percent?: number;
  receivedBytes?: number;
  totalBytes?: number;
  detail?: string;
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

export interface SnowLumaStatus {
  platform: NodeJS.Platform | "browser";
  installState: SnowLumaInstallState;
  runState: SnowLumaRunState;
  installedVersion?: string;
  latestVersion?: string;
  latestReleaseUrl?: string;
  latestAssetName?: string;
  latestAssetUrl?: string;
  bundledVersion?: string;
  bundledAssetName?: string;
  bundledReleaseUrl?: string;
  webUiUrl?: string;
  installFolderPath?: string;
  manualArchiveName?: string;
  installProgress?: SnowLumaInstallProgress;
  qqStatus?: SnowLumaQqStatus;
  error?: string;
  logs?: string[];
}

export interface SnowLumaLogSnapshot {
  runState: SnowLumaRunState;
  webUiUrl?: string;
  error?: string;
  logs: string[];
}

export interface SnowLumaAccountSummary {
  uin: string;
  nickname?: string;
  avatarUrl?: string;
  httpPort?: number;
  wsPort?: number;
  httpPortStatus?: SnowLumaProtocolPortStatus;
  wsPortStatus?: SnowLumaProtocolPortStatus;
  accessToken?: string;
  status: SnowLumaAccountStatus;
  statusDetail?: string;
}

export interface SnowLumaSelectedAccountConfig {
  mode: "local";
  protocol: "http";
  localPort: string;
  accessToken: string;
}

export interface SnowLumaActionResult {
  ok: boolean;
  message?: string;
  status?: SnowLumaStatus;
}

export interface SnowLumaAccountsResult {
  ok: boolean;
  message?: string;
  accounts: SnowLumaAccountSummary[];
}

export interface SnowLumaSelectAccountResult {
  ok: boolean;
  message?: string;
  account?: SnowLumaAccountSummary;
  config?: SnowLumaSelectedAccountConfig;
}
