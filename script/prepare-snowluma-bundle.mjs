#!/usr/bin/env node
import { createHash } from "crypto";
import { spawn } from "child_process";
import { createReadStream, createWriteStream } from "fs";
import { mkdir, readdir, rename, rm, stat, writeFile } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { pathToFileURL } from "url";

const RELEASE_API_URL = "https://api.github.com/repos/SnowLuma/SnowLuma/releases/latest";
const DEFAULT_BUNDLE_DIR = path.resolve(process.cwd(), "build", "vendor", "snowluma");
const MANIFEST_FILE = "manifest.json";

/** 从 GitHub release 中精确选择完整 Windows x64 包，排除 lite 包。 */
export function selectSnowLumaBundleAsset(release) {
  const tag = typeof release?.tag_name === "string" ? release.tag_name : "";
  const expectedName = tag ? `SnowLuma-${tag}-win-x64.zip` : "";
  const asset = Array.isArray(release?.assets) ? release.assets.find((item) => item?.name === expectedName) : null;
  if (!asset?.name || !asset.browser_download_url) {
    return null;
  }

  return {
    name: asset.name,
    size: typeof asset.size === "number" ? asset.size : undefined,
    browserDownloadUrl: asset.browser_download_url
  };
}

/** 生成随安装包携带的 SnowLuma 内置包 manifest。 */
export function buildSnowLumaBundleManifest({ release, asset, archiveSha256, bundledAt }) {
  return {
    version: release.tag_name,
    assetName: asset.name,
    assetSize: asset.size,
    archiveSha256,
    releaseUrl: release.html_url,
    assetUrl: asset.browserDownloadUrl,
    bundledAt
  };
}

/** 拉取 SnowLuma 最新完整包并写入 build/vendor/snowluma。 */
export async function prepareSnowLumaBundle({ bundleDir = DEFAULT_BUNDLE_DIR, now = new Date() } = {}) {
  await mkdir(bundleDir, { recursive: true });
  const release = await fetchLatestRelease();
  const asset = selectSnowLumaBundleAsset(release);
  if (!release?.tag_name || !asset) {
    throw new Error("没有找到 SnowLuma Windows x64 完整包");
  }

  const tempPath = path.join(bundleDir, `${asset.name}.download`);
  const archivePath = path.join(bundleDir, asset.name);
  await rm(tempPath, { force: true });
  await downloadFile(asset.browserDownloadUrl, tempPath);
  const archiveSha256 = await hashFile(tempPath);
  const actualSize = (await stat(tempPath)).size;
  const manifest = buildSnowLumaBundleManifest({
    release,
    asset: {
      ...asset,
      size: asset.size ?? actualSize
    },
    archiveSha256,
    bundledAt: now.toISOString()
  });

  await cleanBundleDir(bundleDir, asset.name, path.basename(tempPath));
  await rename(tempPath, archivePath);
  await writeFile(path.join(bundleDir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return {
    archivePath,
    manifest
  };
}

/** 读取 GitHub 最新 release 元数据。 */
async function fetchLatestRelease() {
  const text = await fetchText(RELEASE_API_URL);
  return JSON.parse(text);
}

/** 下载远程文件到本地临时路径。 */
async function downloadFile(url, targetPath) {
  try {
    const response = await fetch(url, {
      headers: buildGitHubHeaders(),
      redirect: "follow"
    });
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}`);
    }

    await pipeline(Readable.fromWeb(response.body), createWriteStream(targetPath));
  } catch (nodeError) {
    await rm(targetPath, { force: true });
    await downloadFileWithCurl(url, targetPath, nodeError);
  }
}

/** 计算下载文件的 sha256，写入 manifest 供运行时校验和排查。 */
async function hashFile(filePath) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

/** 清理旧 SnowLuma 内置包，避免 extraResources 带入多个版本。 */
async function cleanBundleDir(bundleDir, keepAssetName, keepTempName) {
  for (const fileName of await readdir(bundleDir).catch(() => [])) {
    if (fileName === keepAssetName || fileName === keepTempName || fileName === ".gitkeep") {
      continue;
    }

    if (fileName === MANIFEST_FILE || fileName.endsWith(".download") || /^SnowLuma-v.+-win-x64(?:-lite)?\.zip$/i.test(fileName)) {
      await rm(path.join(bundleDir, fileName), { force: true });
    }
  }
}

/** 构造 GitHub 请求头，CI 可通过 GITHUB_TOKEN 提高 rate limit。 */
function buildGitHubHeaders() {
  const headers = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "ChatSundial-Build"
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return headers;
}

/** 读取远程文本，Node fetch 失败时回退到系统 curl。 */
async function fetchText(url) {
  try {
    const response = await fetch(url, {
      headers: buildGitHubHeaders(),
      redirect: "follow"
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.text();
  } catch (nodeError) {
    return fetchTextWithCurl(url, nodeError);
  }
}

/** 使用系统 curl 读取远程文本，适配需要系统代理的打包机。 */
function fetchTextWithCurl(url, previousError) {
  return new Promise((resolve, reject) => {
    const child = spawn(resolveCurlCommand(), [
      "--location",
      "--fail",
      "--show-error",
      "--silent",
      ...buildCurlPlatformArgs(),
      "--connect-timeout",
      "20",
      "--retry",
      "2",
      "--retry-delay",
      "1",
      url
    ], {
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => reject(new Error(`Node fetch ${formatError(previousError)}；curl ${formatError(error)}`)));
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Node fetch ${formatError(previousError)}；curl ${stderr.trim() || `退出码 ${code ?? "unknown"}`}`));
        return;
      }

      resolve(stdout);
    });
  });
}

/** 使用系统 curl 下载文件，适配 Node fetch 无法访问 GitHub asset 的环境。 */
function downloadFileWithCurl(url, targetPath, previousError) {
  return new Promise((resolve, reject) => {
    const child = spawn(resolveCurlCommand(), [
      "--location",
      "--fail",
      "--show-error",
      "--silent",
      ...buildCurlPlatformArgs(),
      "--output",
      targetPath,
      "--connect-timeout",
      "20",
      "--retry",
      "2",
      "--retry-delay",
      "1",
      url
    ], {
      windowsHide: true
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => reject(new Error(`Node fetch ${formatError(previousError)}；curl ${formatError(error)}`)));
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Node fetch ${formatError(previousError)}；curl ${stderr.trim() || `退出码 ${code ?? "unknown"}`}`));
        return;
      }

      resolve();
    });
  });
}

/** 根据平台选择 curl 命令名。 */
function resolveCurlCommand() {
  return process.platform === "win32" ? "curl.exe" : "curl";
}

/** 返回平台专属 curl 参数，Windows 下跳过离线吊销检查。 */
function buildCurlPlatformArgs() {
  return process.platform === "win32" ? ["--ssl-no-revoke"] : [];
}

/** 格式化网络异常，尽量保留底层错误码。 */
function formatError(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const code = error.cause && typeof error.cause === "object" && "code" in error.cause ? error.cause.code : "";
  return code && !error.message.includes(String(code)) ? `${error.message} (${String(code)})` : error.message;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  prepareSnowLumaBundle()
    .then(({ manifest }) => {
      console.log(`Bundled SnowLuma ${manifest.version}: ${manifest.assetName}`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
