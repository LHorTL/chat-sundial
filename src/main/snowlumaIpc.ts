import { app, clipboard, ipcMain, net, session, shell } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { randomBytes } from "crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync } from "fs";
import { readdir, readFile, rename, rm, stat, writeFile } from "fs/promises";
import { createConnection } from "net";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import extract from "extract-zip";
import {
  applySnowLumaAccountLoginInfo,
  buildSnowLumaCurlDownloadArgs,
  buildSnowLumaElectronProxyConfig,
  buildSnowLumaWsProbeRequest,
  buildSnowLumaWebUiAuthConfig,
  buildSnowLumaWebUiPassword,
  compareSnowLumaVersionTags,
  findSnowLumaDownloadedArchive,
  formatSnowLumaError,
  getSnowLumaQqVersionSupport,
  isSnowLumaWsHandshakeAccepted,
  normalizeSnowLumaQqProcesses,
  QQ_DOWNLOAD_URL,
  parseSnowLumaBundledArchiveManifest,
  parseSnowLumaAccountUin,
  parseSnowLumaInstallManifest,
  parseSnowLumaOneBotConfig,
  resolveSnowLumaInstallProgress,
  resolveSnowLumaInstallCandidate,
  resolveSnowLumaProcessExit,
  resolveSnowLumaQqStatus,
  selectSnowLumaWinX64Asset,
  shouldRefreshSnowLumaReleaseCache,
  type SnowLumaAccountSummary,
  type SnowLumaBundledArchiveManifest,
  type SnowLumaInstallManifest,
  type SnowLumaInstallProgress,
  type SnowLumaInstallState,
  type SnowLumaProtocolPortStatus,
  type SnowLumaQqStatus,
  type SnowLumaReleaseInfo,
  type SnowLumaRunState,
  type SnowLumaStartMode
} from "../shared/snowlumaCore";

const RELEASE_API_URL = "https://api.github.com/repos/SnowLuma/SnowLuma/releases/latest";
const TOOLS_DIR_NAME = "tools";
const SNOWLUMA_DIR_NAME = "snowluma";
const INSTALL_MANIFEST_FILE = "install-manifest.json";
const DOWNLOADS_DIR_NAME = "_downloads";
const BUNDLED_RESOURCES_DIR_NAME = "snowluma";
const BUNDLED_MANIFEST_FILE = "manifest.json";
const LOG_LIMIT = 80;
const RELEASE_CACHE_TTL_MS = 5 * 60 * 1000;
const PROTOCOL_PORT_PROBE_TIMEOUT_MS = 800;
let electronProxySetup: Promise<void> | null = null;

interface SnowLumaStatus {
  platform: NodeJS.Platform;
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
  installProgress: SnowLumaInstallProgress;
  qqStatus: SnowLumaQqStatus;
  error?: string;
  logs: string[];
}

interface SnowLumaActionResult {
  ok: boolean;
  message?: string;
  status?: SnowLumaStatus;
}

interface SnowLumaLogSnapshot {
  runState: SnowLumaRunState;
  webUiUrl?: string;
  error?: string;
  logs: string[];
}

interface SnowLumaBundledArchive {
  manifest: SnowLumaBundledArchiveManifest;
  archivePath: string;
}

interface SnowLumaArchiveInstallRequest {
  version: string;
  archiveName: string;
  archivePath: string;
  releaseUrl?: string;
}

/** 注册 SnowLuma 下载、启动、账号选择相关 IPC。 */
export function registerSnowLumaIpc() {
  const manager = new SnowLumaManager();

  ipcMain.handle("snowluma:status", () => manager.getStatus());
  ipcMain.handle("snowluma:logs", () => manager.getLogs());
  ipcMain.handle("snowluma:install-latest", () => manager.installLatest());
  ipcMain.handle("snowluma:install-bundled", () => manager.installBundled());
  ipcMain.handle("snowluma:uninstall", () => manager.uninstall());
  ipcMain.handle("snowluma:start", (_event, mode?: SnowLumaStartMode) => manager.start(mode));
  ipcMain.handle("snowluma:stop", () => manager.stop());
  ipcMain.handle("snowluma:restart", () => manager.restart());
  ipcMain.handle("snowluma:list-accounts", () => manager.listAccounts());
  ipcMain.handle("snowluma:select-account", (_event, uin: string) => manager.selectAccount(uin));
  ipcMain.handle("snowluma:open-install-folder", () => manager.openInstallFolder());
  ipcMain.handle("snowluma:open-download-url", () => manager.openDownloadUrl());
  ipcMain.handle("snowluma:open-qq-download-url", () => manager.openQqDownloadUrl());
  ipcMain.handle("snowluma:open-webui", () => manager.openWebUi());

  app.on("before-quit", () => {
    void manager.stop();
  });
}

/** 管理 SnowLuma sidecar 的安装目录、进程和运行态。 */
class SnowLumaManager {
  private child: ChildProcessWithoutNullStreams | null = null;
  private installStateOverride: SnowLumaInstallState | null = null;
  private runState: SnowLumaRunState = "stopped";
  private lastError = "";
  private latestRelease: SnowLumaReleaseInfo | null = null;
  private latestReleaseFetchedAt = 0;
  private webUiPort = 5099;
  private logs: string[] = [];
  private installProgress: SnowLumaInstallProgress = { phase: "idle" };
  private lastQqStatus: Pick<SnowLumaQqStatus, "executablePath" | "version"> | null = null;
  private webUiPassword = "";
  private stoppingChild: ChildProcessWithoutNullStreams | null = null;

  /** 返回当前安装、运行和 release 状态。 */
  async getStatus(): Promise<SnowLumaStatus> {
    const [manifest, release, qqStatus, bundledArchive] = await Promise.all([
      this.readCurrentManifest(),
      this.getLatestRelease(),
      this.detectQqStatus(),
      this.readBundledArchive()
    ]);
    const installedVersion = manifest?.version;
    const latestVersion = release?.tag_name;
    const latestAsset = release ? selectSnowLumaWinX64Asset(release) : null;
    const manualArchiveName = latestVersion ? await this.findDownloadedArchiveName(latestVersion) : undefined;
    const bundledManifest = bundledArchive?.manifest;

    return {
      platform: process.platform,
      installState: this.resolveInstallState(manifest),
      runState: this.runState,
      installedVersion,
      latestVersion,
      latestReleaseUrl: release?.html_url,
      latestAssetName: latestAsset?.name,
      latestAssetUrl: latestAsset?.browserDownloadUrl,
      bundledVersion: bundledManifest?.version,
      bundledAssetName: bundledManifest?.assetName,
      bundledReleaseUrl: bundledManifest?.releaseUrl,
      webUiUrl: this.getWebUiUrl(),
      installFolderPath: this.getDownloadsDir(),
      manualArchiveName,
      installProgress: this.resolveInstallProgress(manualArchiveName, manifest),
      qqStatus,
      error: this.lastError || undefined,
      logs: [...this.logs]
    };
  }

  /** 返回实时日志快照，供渲染进程运行中轻量刷新。 */
  getLogs(): SnowLumaLogSnapshot {
    return {
      runState: this.runState,
      webUiUrl: this.getWebUiUrl(),
      error: this.lastError || undefined,
      logs: [...this.logs]
    };
  }

  /** 安装当前最佳 SnowLuma 完整包，优先使用本地包，必要时在线下载。 */
  async installLatest(): Promise<SnowLumaActionResult> {
    if (!this.isSupportedPlatform()) {
      return this.actionError("当前平台不支持 SnowLuma 本地管理");
    }

    if (this.child) {
      return this.actionError("请先停止正在运行的 SnowLuma，再执行安装或更新");
    }

    this.installStateOverride = "installing";
    this.lastError = "";
    this.installProgress = { phase: "downloading", percent: 0, detail: "准备安装" };

    try {
      const [currentManifest, release, bundledArchive] = await Promise.all([
        this.readCurrentManifest(),
        this.getLatestRelease(true),
        this.readBundledArchive()
      ]);
      const asset = release ? selectSnowLumaWinX64Asset(release) : null;
      const latestVersion = release?.tag_name;
      const manualArchiveName = latestVersion ? await this.findDownloadedArchiveName(latestVersion) : undefined;
      const candidate = resolveSnowLumaInstallCandidate({
        installedVersion: currentManifest?.version,
        latestVersion,
        latestAssetName: asset?.name,
        latestAssetUrl: asset?.browserDownloadUrl,
        bundledVersion: bundledArchive?.manifest.version,
        bundledAssetName: bundledArchive?.manifest.assetName,
        manualArchiveName
      });

      if (!candidate) {
        throw new Error("没有找到 SnowLuma Windows x64 完整发布包");
      }

      const downloadsDir = this.getDownloadsDir();
      mkdirSync(downloadsDir, { recursive: true });
      let archivePath = "";
      if (candidate.source === "manual") {
        archivePath = path.join(downloadsDir, candidate.assetName);
        this.installProgress = {
          phase: "ready-to-extract",
          percent: 100,
          detail: candidate.assetName
        };
        this.appendLog(`检测到本地安装包: ${candidate.assetName}`);
      } else if (candidate.source === "bundled") {
        if (!bundledArchive || bundledArchive.manifest.version !== candidate.version) {
          throw new Error("内置 SnowLuma 包不可用");
        }
        archivePath = bundledArchive.archivePath;
        this.installProgress = {
          phase: "ready-to-extract",
          percent: 100,
          detail: candidate.assetName
        };
        this.appendLog(`使用内置 SnowLuma 安装包: ${candidate.assetName}`);
      } else if (candidate.assetUrl) {
        archivePath = path.join(downloadsDir, candidate.assetName);
        const downloadingArchivePath = `${archivePath}.download`;
        await safeRemove(downloadingArchivePath, downloadsDir);
        await this.downloadFile(candidate.assetUrl, downloadingArchivePath, asset?.size, candidate.assetName);
        await rename(downloadingArchivePath, archivePath);
      } else {
        throw new Error("没有找到 SnowLuma Windows x64 完整发布包");
      }

      await this.installArchive({
        version: candidate.version,
        archiveName: candidate.assetName,
        archivePath,
        releaseUrl: release?.html_url || bundledArchive?.manifest.releaseUrl
      });

      this.installStateOverride = null;
      this.installProgress = { phase: "completed", percent: 100, detail: candidate.assetName };
      this.appendLog(`SnowLuma ${candidate.version} 安装完成`);
      return { ok: true, status: await this.getStatus() };
    } catch (error) {
      this.installStateOverride = "error";
      this.installProgress = { phase: "error", detail: formatError(error) };
      return this.actionError(formatError(error));
    }
  }

  /** 使用随应用内置的 SnowLuma 完整包完成初始化或离线更新。 */
  async installBundled(): Promise<SnowLumaActionResult> {
    if (!this.isSupportedPlatform()) {
      return this.actionError("当前平台不支持 SnowLuma 本地管理");
    }

    if (this.child) {
      return this.actionError("请先停止正在运行的 SnowLuma，再执行初始化或更新");
    }

    this.installStateOverride = "installing";
    this.lastError = "";
    this.installProgress = { phase: "extracting", percent: 0, detail: "准备解压内置包" };

    try {
      const [currentManifest, bundledArchive] = await Promise.all([
        this.readCurrentManifest(),
        this.readBundledArchive()
      ]);

      if (!bundledArchive) {
        throw new Error("当前应用没有内置 SnowLuma 完整包，请打开版本与安装抽屉手动安装");
      }

      if (currentManifest?.version && compareSnowLumaVersionTags(currentManifest.version, bundledArchive.manifest.version) > 0) {
        throw new Error(`当前已安装 ${currentManifest.version}，高于内置 ${bundledArchive.manifest.version}，无法用内置包覆盖`);
      }

      this.installProgress = {
        phase: "extracting",
        percent: 0,
        detail: bundledArchive.manifest.assetName
      };
      this.appendLog(`使用内置 SnowLuma 安装包初始化: ${bundledArchive.manifest.assetName}`);
      await this.installArchive({
        version: bundledArchive.manifest.version,
        archiveName: bundledArchive.manifest.assetName,
        archivePath: bundledArchive.archivePath,
        releaseUrl: bundledArchive.manifest.releaseUrl
      });

      this.installStateOverride = null;
      this.installProgress = { phase: "completed", percent: 100, detail: bundledArchive.manifest.assetName };
      this.appendLog(`SnowLuma ${bundledArchive.manifest.version} 初始化完成`);
      return { ok: true, status: await this.getStatus() };
    } catch (error) {
      this.installStateOverride = "error";
      this.installProgress = { phase: "error", detail: formatError(error) };
      return this.actionError(formatError(error));
    }
  }

  /** 从指定 zip 解压安装 SnowLuma，所有安装来源最终都写入同一种 manifest。 */
  private async installArchive({ version, archiveName, archivePath, releaseUrl }: SnowLumaArchiveInstallRequest) {
    const toolsDir = this.getToolsDir();
    const installDir = path.join(toolsDir, version);
    const tempDir = path.join(toolsDir, `${version}.tmp`);
    await safeRemove(tempDir, toolsDir);
    await safeRemove(installDir, toolsDir);
    mkdirSync(tempDir, { recursive: true });
    await this.extractArchive(archivePath, tempDir, archiveName);

    const rootDir = await findSnowLumaRoot(tempDir);
    if (!rootDir) {
      throw new Error("发布包内没有找到 index.mjs");
    }

    await rename(rootDir, installDir);
    await safeRemove(tempDir, toolsDir);

    const manifest: SnowLumaInstallManifest = {
      version,
      assetName: archiveName,
      rootDir: installDir,
      installedAt: new Date().toISOString(),
      releaseUrl
    };
    await writeFile(path.join(installDir, INSTALL_MANIFEST_FILE), JSON.stringify(manifest, null, 2), "utf8");
  }

  /** 卸载当前 SnowLuma 版本，保留 _downloads 中的安装包缓存。 */
  async uninstall(): Promise<SnowLumaActionResult> {
    try {
      if (!this.isSupportedPlatform()) {
        return this.actionError("当前平台不支持 SnowLuma 本地管理");
      }

      const manifest = await this.readCurrentManifest();
      if (!manifest) {
        return this.actionError("SnowLuma 尚未安装");
      }

      if (this.child) {
        await this.stop();
      }

      const toolsDir = this.getToolsDir();
      await safeRemove(manifest.rootDir, toolsDir);
      this.installStateOverride = null;
      this.installProgress = { phase: "idle" };
      this.runState = "stopped";
      this.webUiPassword = "";
      this.lastError = "";
      this.appendLog(`SnowLuma ${manifest.version} 已卸载`);
      return { ok: true, message: "SnowLuma 已卸载", status: await this.getStatus() };
    } catch (error) {
      return this.actionError(formatError(error));
    }
  }

  /** 启动已安装的 SnowLuma sidecar 进程。 */
  async start(mode: SnowLumaStartMode = "hot"): Promise<SnowLumaActionResult> {
    if (!this.isSupportedPlatform()) {
      return this.actionError("当前平台不支持 SnowLuma 本地管理");
    }

    const qqStatus = await this.detectQqStatus();
    const qqVersionError = this.getQqVersionError(qqStatus);
    if (qqVersionError) {
      return this.actionError(qqVersionError);
    }

    if (mode === "cold" && !qqStatus?.executablePath) {
      return this.actionError("未检测到 QQ 路径，请先打开一次 QQ 后刷新状态");
    }

    if (this.child) {
      if (mode === "cold") {
        return this.openKnownQqExecutable(qqStatus);
      }
      return { ok: true, status: await this.getStatus() };
    }

    const manifest = await this.readCurrentManifest();
    if (!manifest) {
      return this.actionError("SnowLuma 尚未安装");
    }

    const nodePath = path.join(manifest.rootDir, "node.exe");
    const entryPath = path.join(manifest.rootDir, "index.mjs");
    if (!existsSync(nodePath) || !existsSync(entryPath)) {
      return this.actionError("SnowLuma 安装目录缺少 node.exe 或 index.mjs");
    }

    this.lastError = "";
    this.runState = "starting";
    try {
      this.webUiPassword = await this.prepareWebUiPassword(manifest.rootDir);
    } catch (error) {
      this.runState = "error";
      return this.actionError(`生成 WebUI 随机密码失败：${formatError(error)}`);
    }
    this.child = spawn(nodePath, [entryPath], {
      cwd: manifest.rootDir,
      env: {
        ...process.env,
        SNOWLUMA_HOOK_AUTOLOAD: "1",
        SNOWLUMA_WEBUI_PORT: "5099",
        SNOWLUMA_WEBUI_BOOTSTRAP_PASSWORD: this.webUiPassword
      },
      windowsHide: true
    });

    this.appendLog(`启动 SnowLuma: ${manifest.rootDir}`);
    this.child.stdout.on("data", (chunk) => this.handleProcessOutput(String(chunk)));
    this.child.stderr.on("data", (chunk) => this.handleProcessOutput(String(chunk)));
    this.child.on("error", (error) => {
      this.lastError = formatError(error);
      this.runState = "error";
      this.webUiPassword = "";
      this.appendLog(`SnowLuma 启动失败: ${this.lastError}`);
    });
    this.child.on("exit", (code, signal) => {
      const expectedStop = this.stoppingChild === this.child;
      const exitState = resolveSnowLumaProcessExit({ code, signal, expectedStop });
      this.child = null;
      this.stoppingChild = null;
      this.webUiPassword = "";
      this.runState = exitState.runState;
      this.lastError = exitState.error;
      this.appendLog(`SnowLuma 进程退出: ${code ?? signal ?? "unknown"}`);
    });

    setTimeout(() => {
      if (this.child && this.runState === "starting") {
        this.runState = "running";
      }
    }, 1500).unref?.();

    if (mode === "cold") {
      await delay(800);
      return this.openKnownQqExecutable(qqStatus);
    }

    return { ok: true, status: await this.getStatus() };
  }

  /** 停止当前由 ChatSundial 启动的 SnowLuma sidecar。 */
  async stop(): Promise<SnowLumaActionResult> {
    if (!this.child) {
      this.runState = "stopped";
      this.lastError = "";
      this.webUiPassword = "";
      return { ok: true, status: await this.getStatus() };
    }

    const child = this.child;
    this.runState = "stopping";
    this.lastError = "";
    this.stoppingChild = child;
    child.kill();

    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 3000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });

    if (this.child === child) {
      this.child = null;
    }
    this.runState = "stopped";
    this.lastError = "";
    this.stoppingChild = null;
    this.webUiPassword = "";
    this.appendLog("SnowLuma 已停止");
    return { ok: true, status: await this.getStatus() };
  }

  /** 重启 SnowLuma sidecar。 */
  async restart(): Promise<SnowLumaActionResult> {
    if (!this.isSupportedPlatform()) {
      return this.actionError("当前平台不支持 SnowLuma 本地管理");
    }

    const qqVersionError = this.getQqVersionError(await this.detectQqStatus());
    if (qqVersionError) {
      return this.actionError(qqVersionError);
    }

    await this.stop();
    return this.start();
  }

  /** 扫描 SnowLuma 账号配置并探测 OneBot HTTP 在线状态。 */
  async listAccounts(): Promise<{ ok: boolean; message?: string; accounts: SnowLumaAccountSummary[] }> {
    const manifest = await this.readCurrentManifest();
    if (!manifest) {
      return { ok: false, message: "SnowLuma 尚未安装", accounts: [] };
    }

    const configDir = path.join(manifest.rootDir, "config");
    if (!existsSync(configDir)) {
      return { ok: true, accounts: [] };
    }

    const accounts: SnowLumaAccountSummary[] = [];
    for (const fileName of await readdir(configDir)) {
      const uin = parseSnowLumaAccountUin(fileName);
      if (!uin) {
        continue;
      }

      try {
        const raw = JSON.parse(await readFile(path.join(configDir, fileName), "utf8")) as unknown;
        const account = parseSnowLumaOneBotConfig(uin, raw);
        accounts.push(await this.withRuntimeAccountStatus(account));
      } catch (error) {
        accounts.push({
          uin,
          status: "invalid",
          statusDetail: formatError(error)
        });
      }
    }

    return { ok: true, accounts };
  }

  /** 根据账号选择结果返回可写入当前 OneBot 配置的数据。 */
  async selectAccount(uin: string) {
    const accountsResult = await this.listAccounts();
    const account = accountsResult.accounts.find((item) => item.uin === uin);
    if (!account) {
      return { ok: false, message: "没有找到这个 SnowLuma 账号" };
    }

    if (account.status === "unsupported" || !account.httpPort) {
      return {
        ok: false,
        message: account.statusDetail || "当前账号不支持自动接入",
        account
      };
    }

    if (account.status !== "online") {
      return {
        ok: false,
        message: account.statusDetail || "账号当前离线，无法连接",
        account
      };
    }

    return {
      ok: true,
      account,
      config: {
        mode: "local",
        protocol: "http",
        localPort: String(account.httpPort),
        accessToken: account.accessToken || ""
      }
    };
  }

  /** 在系统浏览器中打开 SnowLuma WebUI。 */
  async openWebUi(): Promise<SnowLumaActionResult> {
    const url = this.getWebUiUrl();
    if (!url) {
      return this.actionError("SnowLuma WebUI 地址暂不可用");
    }

    if (this.webUiPassword) {
      clipboard.writeText(this.webUiPassword);
      this.appendLog("已复制 SnowLuma WebUI 登录密码到剪切板");
    }
    await shell.openExternal(url);
    return {
      ok: true,
      message: this.webUiPassword ? "已打开 WebUI，登录密码已复制到剪切板" : "已打开 WebUI，当前密码不由 ChatSundial 管理",
      status: await this.getStatus()
    };
  }

  /** 打开用于放置 SnowLuma zip 安装包的本地文件夹。 */
  async openInstallFolder(): Promise<SnowLumaActionResult> {
    const folderPath = this.getDownloadsDir();
    mkdirSync(folderPath, { recursive: true });
    const message = await shell.openPath(folderPath);
    if (message) {
      return this.actionError(message);
    }

    return { ok: true, status: await this.getStatus() };
  }

  /** 用系统默认浏览器打开最新完整包下载地址。 */
  async openDownloadUrl(): Promise<SnowLumaActionResult> {
    const release = await this.getLatestRelease();
    const asset = release ? selectSnowLumaWinX64Asset(release) : null;
    if (!asset?.browserDownloadUrl) {
      return this.actionError("没有找到 SnowLuma Windows x64 完整包下载地址");
    }

    await shell.openExternal(asset.browserDownloadUrl);
    return { ok: true, message: "已在浏览器打开 SnowLuma 完整包下载地址", status: await this.getStatus() };
  }

  /** 打开新版 QQ 下载页。 */
  async openQqDownloadUrl(): Promise<SnowLumaActionResult> {
    await shell.openExternal(QQ_DOWNLOAD_URL);
    return { ok: true, message: "已打开新版 QQ 下载页", status: await this.getStatus() };
  }

  /** 判断当前平台是否支持本地 SnowLuma 注入能力。 */
  private isSupportedPlatform() {
    return process.platform === "win32";
  }

  /** 检查 QQ 版本是否满足 SnowLuma 启动要求，返回用户可读阻断原因。 */
  private getQqVersionError(qqStatus: SnowLumaQqStatus) {
    const versionSupport = getSnowLumaQqVersionSupport(qqStatus.version);
    return versionSupport.supported ? "" : versionSupport.message || `SnowLuma 需要 QQ ${versionSupport.minimumVersion} 或以上版本`;
  }

  /** 基于 manifest 和运行中覆盖状态推导安装状态。 */
  private resolveInstallState(manifest: SnowLumaInstallManifest | null): SnowLumaInstallState {
    if (!this.isSupportedPlatform()) {
      return "unsupported";
    }

    if (this.installStateOverride) {
      return this.installStateOverride;
    }

    return manifest ? "installed" : "missing";
  }

  /** 读取最新安装版本的 manifest。 */
  private async readCurrentManifest(): Promise<SnowLumaInstallManifest | null> {
    const toolsDir = this.getToolsDir();
    if (!existsSync(toolsDir)) {
      return null;
    }

    const versions = (await readdir(toolsDir, { withFileTypes: true }))
      .filter((item) => item.isDirectory() && item.name.startsWith("v"))
      .map((item) => item.name)
      .sort(compareSnowLumaVersionTags)
      .reverse();

    for (const version of versions) {
      const manifestPath = path.join(toolsDir, version, INSTALL_MANIFEST_FILE);
      if (!existsSync(manifestPath)) {
        continue;
      }

      try {
        const raw = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
        const parsed = parseSnowLumaInstallManifest(raw, (rootDir) => existsSync(rootDir));
        if (parsed) {
          return parsed;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  /** 读取随应用一起打包的 SnowLuma 完整包信息，用作离线安装来源。 */
  private async readBundledArchive(): Promise<SnowLumaBundledArchive | null> {
    if (!this.isSupportedPlatform()) {
      return null;
    }

    for (const dirPath of this.getBundledArchiveDirs()) {
      const manifestPath = path.join(dirPath, BUNDLED_MANIFEST_FILE);
      if (!existsSync(manifestPath)) {
        continue;
      }

      try {
        const raw = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
        const manifest = parseSnowLumaBundledArchiveManifest(raw, (assetName) => existsSync(path.join(dirPath, assetName)));
        if (manifest) {
          return {
            manifest,
            archivePath: path.join(dirPath, manifest.assetName)
          };
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  /** 获取 GitHub 最新 release，并允许强制刷新缓存。 */
  private async getLatestRelease(force = false): Promise<SnowLumaReleaseInfo | null> {
    const now = Date.now();
    if (!force && this.latestReleaseFetchedAt && !shouldRefreshSnowLumaReleaseCache(this.latestReleaseFetchedAt, now, RELEASE_CACHE_TTL_MS)) {
      return this.latestRelease;
    }

    try {
      const response = await fetchRemote(RELEASE_API_URL, {
        headers: {
          "User-Agent": "ChatSundial"
        }
      });
      if (!response.ok) {
        throw new Error(`GitHub release 查询失败：HTTP ${response.status}`);
      }
      this.latestRelease = await response.json() as SnowLumaReleaseInfo;
      this.latestReleaseFetchedAt = Date.now();
      return this.latestRelease;
    } catch (error) {
      this.lastError = formatError(error);
      this.latestReleaseFetchedAt = now;
      return this.latestRelease;
    }
  }

  /** 下载远程文件到本地路径。 */
  private async downloadFile(url: string, targetPath: string, fallbackTotalBytes?: number, displayName = path.basename(targetPath)) {
    try {
      const response = await fetchRemote(url, {
        headers: {
          "User-Agent": "ChatSundial"
        }
      });
      await this.downloadResponseToFile(response, targetPath, fallbackTotalBytes, displayName);
    } catch (electronNetError) {
      this.appendLog(`Electron 网络下载失败，切换 Node 下载: ${formatError(electronNetError)}`);
      this.installProgress = {
        phase: "downloading",
        percent: 0,
        totalBytes: fallbackTotalBytes,
        detail: "网络重试：切换 Node 下载"
      };
      await safeRemove(targetPath, path.dirname(targetPath));

      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent": "ChatSundial"
          }
        });
        await this.downloadResponseToFile(response, targetPath, fallbackTotalBytes, displayName);
      } catch (nodeError) {
        this.appendLog(`Node 网络下载失败，切换 Windows 系统下载器: ${formatError(nodeError)}`);
        this.installProgress = {
          phase: "downloading",
          percent: 0,
          totalBytes: fallbackTotalBytes,
          detail: "网络重试：切换 Windows 系统下载器"
        };
        await safeRemove(targetPath, path.dirname(targetPath));

        try {
          await this.downloadFileWithWindowsCurl(url, targetPath, fallbackTotalBytes, displayName);
        } catch (curlError) {
          await safeRemove(targetPath, path.dirname(targetPath));
          throw new Error(`SnowLuma 下载失败：Electron 网络 ${formatError(electronNetError)}；Node 网络 ${formatError(nodeError)}；Windows 系统下载器 ${formatError(curlError)}。请检查网络或代理后重试。`);
        }
      }
    }
  }

  /** 使用 Windows 自带 curl.exe 在应用内完成下载，并通过文件大小轮询更新进度。 */
  private async downloadFileWithWindowsCurl(url: string, targetPath: string, fallbackTotalBytes?: number, displayName = path.basename(targetPath)) {
    if (process.platform !== "win32") {
      throw new Error("当前平台没有 Windows 系统下载器");
    }

    const args = buildSnowLumaCurlDownloadArgs(url, targetPath);
    await new Promise<void>((resolve, reject) => {
      const child = spawn("curl.exe", args, {
        windowsHide: true
      });
      let stderr = "";
      let settled = false;

      const updateProgress = async () => {
        try {
          const info = await stat(targetPath);
          this.installProgress = {
            phase: "downloading",
            percent: fallbackTotalBytes ? Math.min(99, Math.round((info.size / fallbackTotalBytes) * 100)) : undefined,
            receivedBytes: info.size,
            totalBytes: fallbackTotalBytes,
            detail: `${displayName}（系统下载器）`
          };
        } catch {
          // 文件尚未创建时忽略，下一轮轮询会继续更新。
        }
      };

      const timer = setInterval(() => {
        void updateProgress();
      }, 500);
      timer.unref?.();

      const finish = (error?: Error) => {
        if (settled) {
          return;
        }

        settled = true;
        clearInterval(timer);
        if (error) {
          reject(error);
          return;
        }

        resolve();
      };

      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", (error) => finish(error));
      child.on("exit", (code) => {
        if (code !== 0) {
          finish(new Error(stderr.trim() || `curl.exe 退出码 ${code ?? "unknown"}`));
          return;
        }

        finish();
      });
    });

    const info = await stat(targetPath);
    this.installProgress = {
      phase: "downloading",
      percent: 100,
      receivedBytes: info.size,
      totalBytes: fallbackTotalBytes || info.size,
      detail: displayName
    };
  }

  /** 把远程响应流写入本地文件，同时更新安装进度。 */
  private async downloadResponseToFile(response: Response, targetPath: string, fallbackTotalBytes?: number, displayName = path.basename(targetPath)) {
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}`);
    }

    const totalBytes = Number(response.headers.get("content-length")) || fallbackTotalBytes;
    let receivedBytes = 0;
    const stream = Readable.fromWeb(response.body as never);
    stream.on("data", (chunk: Buffer) => {
      receivedBytes += chunk.length;
      this.installProgress = {
        phase: "downloading",
        percent: totalBytes ? Math.min(99, Math.round((receivedBytes / totalBytes) * 100)) : undefined,
        receivedBytes,
        totalBytes,
        detail: displayName
      };
    });

    await pipeline(stream, createWriteStream(targetPath));
    this.installProgress = {
      phase: "downloading",
      percent: 100,
      receivedBytes,
      totalBytes,
      detail: displayName
    };
  }

  /** 解压 SnowLuma 安装包并更新解压阶段进度。 */
  private async extractArchive(archivePath: string, targetDir: string, archiveName: string) {
    let extractedEntries = 0;
    this.installProgress = {
      phase: "extracting",
      percent: 0,
      detail: archiveName
    };

    await extract(archivePath, {
      dir: targetDir,
      onEntry: (entry, zipfile) => {
        extractedEntries += 1;
        const totalEntries = Number(zipfile.entryCount) || undefined;
        this.installProgress = {
          phase: "extracting",
          percent: totalEntries ? Math.min(99, Math.round((extractedEntries / totalEntries) * 100)) : undefined,
          detail: entry.fileName || archiveName
        };
      }
    });

    this.installProgress = {
      phase: "extracting",
      percent: 100,
      detail: archiveName
    };
  }

  /** 探测账号 OneBot HTTP/WS 协议端口状态并合并到账号摘要。 */
  private async withRuntimeAccountStatus(account: SnowLumaAccountSummary): Promise<SnowLumaAccountSummary> {
    const displayAccount = applySnowLumaAccountLoginInfo(account, null);
    const [httpPortStatus, wsPortStatus] = await Promise.all([
      account.httpPort ? this.probeOneBotHttpPort(account) : Promise.resolve<SnowLumaProtocolPortStatus>("unknown"),
      account.wsPort ? probeWebSocketPort(account.wsPort, account.wsPath, account.wsAccessToken || account.accessToken) : Promise.resolve<SnowLumaProtocolPortStatus>("unknown")
    ]);
    const probedAccount: SnowLumaAccountSummary = {
      ...displayAccount,
      httpPortStatus,
      wsPortStatus
    };

    if (account.status !== "offline" || !account.httpPort) {
      return probedAccount;
    }

    if (httpPortStatus !== "online") {
      return {
        ...probedAccount,
        status: "offline"
      };
    }

    return this.withRuntimeAccountProfile({
      ...probedAccount,
      status: "online"
    });
  }

  /** 使用 OneBot HTTP get_status 探测指定账号 HTTP 服务是否可用。 */
  private async probeOneBotHttpPort(account: SnowLumaAccountSummary): Promise<SnowLumaProtocolPortStatus> {
    if (!account.httpPort) {
      return "unknown";
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROTOCOL_PORT_PROBE_TIMEOUT_MS);
    try {
      const response = await fetch(`http://127.0.0.1:${account.httpPort}/get_status`, {
        method: "POST",
        headers: buildOneBotProbeHeaders(account.accessToken),
        body: "{}",
        signal: controller.signal
      });
      const raw = await response.json().catch(() => null) as { status?: string } | null;
      const online = response.ok && (!raw?.status || raw.status === "ok");
      return online ? "online" : "offline";
    } catch {
      return "offline";
    } finally {
      clearTimeout(timer);
    }
  }

  /** 在线账号额外读取 OneBot 登录信息，用于展示 QQ 昵称。 */
  private async withRuntimeAccountProfile(account: SnowLumaAccountSummary): Promise<SnowLumaAccountSummary> {
    if (!account.httpPort) {
      return account;
    }

    try {
      const response = await fetch(`http://127.0.0.1:${account.httpPort}/get_login_info`, {
        method: "POST",
        headers: buildOneBotProbeHeaders(account.accessToken),
        body: "{}"
      });
      const raw = await response.json().catch(() => null) as unknown;
      if (!response.ok) {
        return account;
      }

      return applySnowLumaAccountLoginInfo(account, raw);
    } catch {
      return account;
    }
  }

  /** 检测当前 Windows QQ 进程的 PID、路径和文件版本。 */
  private async detectQqStatus(): Promise<SnowLumaQqStatus> {
    if (!this.isSupportedPlatform()) {
      return resolveSnowLumaQqStatus([], null);
    }

    try {
      const raw = await runPowerShellJson(`
$ErrorActionPreference = 'SilentlyContinue'
$items = @(Get-CimInstance Win32_Process -Filter "Name = 'QQ.exe'" | ForEach-Object {
  $exe = $_.ExecutablePath
  $version = $null
  if ($exe -and (Test-Path -LiteralPath $exe)) {
    $info = (Get-Item -LiteralPath $exe).VersionInfo
    $version = if ($info.ProductVersion) { $info.ProductVersion } elseif ($info.FileVersion) { $info.FileVersion } else { $null }
  }
  [pscustomobject]@{
    pid = [int]$_.ProcessId
    name = $_.Name
    path = $exe
    version = $version
  }
})
if ($items.Count -eq 0) { '[]' } else { $items | ConvertTo-Json -Compress -Depth 3 }
      `);
      const status = resolveSnowLumaQqStatus(normalizeSnowLumaQqProcesses(raw), this.lastQqStatus);
      this.rememberQqStatus(status);
      return status;
    } catch (error) {
      return resolveSnowLumaQqStatus([], this.lastQqStatus, formatError(error));
    }
  }

  /** 打开已检测到的 QQ 路径，用于冷启动模式。 */
  private async openKnownQqExecutable(qqStatus?: SnowLumaQqStatus): Promise<SnowLumaActionResult> {
    const status = qqStatus ?? await this.detectQqStatus();
    const executablePath = status.executablePath;
    if (!executablePath) {
      return this.actionError("未检测到 QQ 路径，请先打开一次 QQ 后刷新状态");
    }

    if (!existsSync(executablePath)) {
      return this.actionError(`QQ 路径不存在：${executablePath}`);
    }

    const message = await shell.openPath(executablePath);
    if (message) {
      return this.actionError(`SnowLuma 已启动，但打开 QQ 失败：${message}`);
    }

    this.appendLog(`冷启动 QQ: ${executablePath}`);
    return { ok: true, message: "已启动 SnowLuma 并打开 QQ", status: await this.getStatus() };
  }

  /** 缓存当前会话中最近一次可用的 QQ 路径和版本，供退出 QQ 后冷启动使用。 */
  private rememberQqStatus(status: SnowLumaQqStatus) {
    if (status.executablePath || status.version) {
      this.lastQqStatus = {
        executablePath: status.executablePath,
        version: status.version
      };
    }
  }

  /** 处理 SnowLuma 进程输出，提取 WebUI 端口并保留最近日志。 */
  private handleProcessOutput(text: string) {
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      const portMatch = /http:\/\/localhost:(\d+)/i.exec(trimmed);
      if (portMatch) {
        this.webUiPort = Number(portMatch[1]);
        this.runState = "running";
      }

      const passwordMatch = /initial credentials:\s*user=admin\s+password=(\S+)/i.exec(trimmed) ?? /dev mode enabled:\s*password=(\S+)/i.exec(trimmed);
      if (passwordMatch?.[1]) {
        this.webUiPassword = passwordMatch[1];
      }
      this.appendLog(trimmed);
    }
  }

  /** 记录最近的 SnowLuma 管理日志。 */
  private appendLog(line: string) {
    this.logs.push(line);
    if (this.logs.length > LOG_LIMIT) {
      this.logs.splice(0, this.logs.length - LOG_LIMIT);
    }
  }

  /** 返回 SnowLuma WebUI 地址。 */
  private getWebUiUrl() {
    if (!this.isSupportedPlatform()) {
      return undefined;
    }

    return `http://localhost:${this.webUiPort}/`;
  }

  /** 返回当前应用下的 SnowLuma 工具安装根目录。 */
  private getToolsDir() {
    return path.join(app.getPath("userData"), TOOLS_DIR_NAME, SNOWLUMA_DIR_NAME);
  }

  /** 返回存放手动下载 zip 的目录。 */
  private getDownloadsDir() {
    return path.join(this.getToolsDir(), DOWNLOADS_DIR_NAME);
  }

  /** 返回可能存在内置 SnowLuma 包的资源目录，开发态兼容 build/vendor。 */
  private getBundledArchiveDirs() {
    return [
      path.join(process.resourcesPath, BUNDLED_RESOURCES_DIR_NAME),
      path.join(app.getAppPath(), "build", "vendor", BUNDLED_RESOURCES_DIR_NAME)
    ];
  }

  /** 启动前写入本次 WebUI 随机密码配置，明文只保留在当前主进程内存。 */
  private async prepareWebUiPassword(rootDir: string) {
    const password = buildSnowLumaWebUiPassword(randomBytes(12));
    const config = buildSnowLumaWebUiAuthConfig(password, randomBytes(16), new Date().toISOString());
    const configDir = path.join(rootDir, "config");
    mkdirSync(configDir, { recursive: true });
    await writeFile(path.join(configDir, "webui.json"), JSON.stringify(config, null, 2), {
      encoding: "utf8",
      mode: 0o600
    });
    this.appendLog("已生成本次 SnowLuma WebUI 随机登录密码");
    return password;
  }

  /** 检测下载目录内是否已有指定版本的完整 SnowLuma zip。 */
  private async findDownloadedArchiveName(version: string): Promise<string | undefined> {
    const downloadsDir = this.getDownloadsDir();
    if (!existsSync(downloadsDir)) {
      return undefined;
    }

    const fileNames = await readdir(downloadsDir);
    return findSnowLumaDownloadedArchive(version, fileNames) ?? undefined;
  }

  /** 根据手动安装包和当前安装阶段返回展示用进度。 */
  private resolveInstallProgress(manualArchiveName: string | undefined, manifest: SnowLumaInstallManifest | null): SnowLumaInstallProgress {
    return resolveSnowLumaInstallProgress({
      currentProgress: this.installProgress,
      hasManifest: Boolean(manifest),
      installStateOverride: this.installStateOverride,
      manualArchiveName
    });
  }

  /** 统一记录错误并返回 action 失败响应。 */
  private async actionError(message: string): Promise<SnowLumaActionResult> {
    this.lastError = message;
    return {
      ok: false,
      message,
      status: await this.getStatus()
    };
  }
}

/** 生成 OneBot 探测请求头。 */
function buildOneBotProbeHeaders(accessToken: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return headers;
}

/** 使用标准 WebSocket Upgrade 握手探测 OneBot WS 服务是否真正可用。 */
function probeWebSocketPort(port: number, pathValue?: string, accessToken?: string): Promise<SnowLumaProtocolPortStatus> {
  return new Promise((resolve) => {
    const host = "127.0.0.1";
    const key = randomBytes(16).toString("base64");
    const requestText = buildSnowLumaWsProbeRequest({
      host,
      port,
      path: pathValue,
      accessToken,
      key
    });
    let responseText = "";
    const socket = createConnection({ host: "127.0.0.1", port });
    let settled = false;

    const finish = (status: SnowLumaProtocolPortStatus) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve(status);
    };

    socket.setTimeout(PROTOCOL_PORT_PROBE_TIMEOUT_MS);
    socket.once("connect", () => socket.write(requestText));
    socket.on("data", (chunk) => {
      responseText += String(chunk);
      if (responseText.includes("\r\n\r\n")) {
        finish(isSnowLumaWsHandshakeAccepted(responseText, key) ? "online" : "offline");
      }
    });
    socket.once("timeout", () => finish("offline"));
    socket.once("error", () => finish("offline"));
  });
}

/** 查找解压目录中的 SnowLuma 根目录。 */
async function findSnowLumaRoot(rootDir: string): Promise<string | null> {
  const queue = [rootDir];

  while (queue.length) {
    const current = queue.shift()!;
    if (existsSync(path.join(current, "index.mjs"))) {
      return current;
    }

    const children = await readdir(current, { withFileTypes: true });
    for (const child of children) {
      if (child.isDirectory()) {
        queue.push(path.join(current, child.name));
      }
    }
  }

  return null;
}

/** 安全删除 SnowLuma 工具目录下的子路径，避免误删到目录外。 */
async function safeRemove(targetPath: string, allowedRoot: string) {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedRoot = path.resolve(allowedRoot);
  if (!resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`拒绝删除 SnowLuma 工具目录外路径：${resolvedTarget}`);
  }

  await rm(resolvedTarget, { recursive: true, force: true });
}

/** 把未知异常格式化成用户可读错误。 */
function formatError(error: unknown) {
  return formatSnowLumaError(error);
}

/** 使用 Electron Chromium 网络栈访问远程资源，并尽量继承常见代理环境。 */
async function fetchRemote(url: string, init?: RequestInit) {
  await ensureElectronProxyConfigured();
  return net.fetch(url, {
    ...init,
    redirect: "follow"
  });
}

/** 首次远程访问前把 HTTP_PROXY/HTTPS_PROXY 写入 Electron session。 */
async function ensureElectronProxyConfigured() {
  if (electronProxySetup) {
    return electronProxySetup;
  }

  const proxyConfig = buildSnowLumaElectronProxyConfig(process.env);
  electronProxySetup = proxyConfig ? session.defaultSession.setProxy(proxyConfig) : Promise.resolve();
  return electronProxySetup;
}

/** 执行只读 PowerShell 查询并解析 JSON 输出。 */
function runPowerShellJson(script: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("QQ 状态检测超时"));
    }, 3500);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `PowerShell 退出码 ${code}`));
        return;
      }

      const text = stdout.trim();
      if (!text) {
        resolve([]);
        return;
      }

      try {
        resolve(JSON.parse(text));
      } catch (error) {
        reject(error);
      }
    });
  });
}

/** 等待指定时间，给 SnowLuma watcher 留出启动窗口。 */
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
