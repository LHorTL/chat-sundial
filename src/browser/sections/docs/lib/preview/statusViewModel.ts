import type { TagTone } from "@fangxinyan/lumina";
import type { DocumentPageCheckResult, DocumentSubmitMode } from "../runtime/automation";
import type { DocumentSubmitTask, DocumentViewStatus } from "../task/registration";

export interface DocumentSidebarTask {
  id: string;
  name: string;
  status: DocumentViewStatus;
  statusLabel: string;
}

/** 把完整文档任务转换为侧边栏需要的轻量任务摘要。 */
export function toDocumentSidebarTask(task: DocumentSubmitTask): DocumentSidebarTask {
  return {
    id: task.id,
    name: task.name,
    status: task.status,
    statusLabel: statusLabel(task.status)
  };
}

/** 根据文档任务状态生成网页预览头部展示文案。 */
export function getDocumentPreviewStatus(task: DocumentSubmitTask): { label: string; tone: TagTone; description: string } {
  const readableMessage = getReadableTaskMessage(task.message);

  if (task.status === "loading") {
    return { label: "正在打开", tone: "info", description: "正在加载腾讯文档网页，请稍等。" };
  }

  if (task.status === "ready") {
    return {
      label: "已就绪",
      tone: "success",
      description: getReadyDescription(task)
    };
  }

  if (task.status === "running") {
    return {
      label: "运行中",
      tone: "warning",
      description: task.mode === "scheduled-confirm"
        ? "任务已启动，正在等待目标时间后确认提交。"
        : "任务已启动，正在等待收集开放后填充并提交。"
    };
  }

  if (task.status === "success") {
    if (readableMessage.startsWith("扫描到")) {
      return { label: "扫描完成", tone: "success", description: `${readableMessage}，可继续调整填充内容。` };
    }

    return { label: "已完成", tone: "success", description: readableMessage || "任务执行完成，已按配置完成提交流程。" };
  }

  if (task.status === "error") {
    return { label: "需要处理", tone: "danger", description: readableMessage || "任务执行失败，请检查网页状态和配置。" };
  }

  if (task.status === "stopped") {
    return { label: "已停止", tone: "neutral", description: "任务已停止，点击开始任务可重新运行。" };
  }

  return {
    label: "未加载",
    tone: "neutral",
    description: task.url.trim() ? "按 Enter 加载腾讯文档，或点击开始任务自动加载。" : "先填写腾讯文档地址。"
  };
}

/** 为需要阻塞用户继续操作的文档任务错误生成醒目提示。 */
export function getDocumentBlockingNotice(task: DocumentSubmitTask): { title: string; message: string } | null {
  const message = getReadableTaskMessage(task.message);
  if (task.status !== "error" || !message) {
    return null;
  }

  return {
    title: "需要处理",
    message
  };
}

/** 根据提交模式生成网页就绪后的下一步说明。 */
export function getReadyDescription(task: DocumentSubmitTask) {
  if (task.mode === "scheduled-confirm") {
    return "网页已打开，开始后会先点击提交，再按设置时间确认。";
  }

  return "网页已打开，开始后会等待开放、填充内容并提交。";
}

/** 过滤内部探测状态，只保留用户看得懂的任务消息。 */
export function getReadableTaskMessage(message: string) {
  const value = message.trim();
  if (!value || value === "probe script skipped" || value === "网页已就绪" || value === "任务已重置") {
    return "";
  }

  return value;
}

/** 把文档运行态转换为侧边栏短标签。 */
export function statusLabel(status: DocumentViewStatus) {
  const label: Record<DocumentViewStatus, string> = {
    idle: "未加载",
    loading: "加载中",
    ready: "已就绪",
    running: "运行中",
    success: "已完成",
    error: "错误",
    stopped: "已停止"
  };
  return label[status];
}

/** 判断当前文档地址是否因任务运行而锁定。 */
export function isDocumentUrlLocked(status: DocumentViewStatus | undefined) {
  return status === "running";
}

/** 判断被动 webview 事件是否允许覆盖当前任务状态。 */
export function isPassiveWebviewStatusLocked(status: DocumentViewStatus) {
  return status === "running" || status === "success" || status === "error" || status === "stopped";
}

/** 判断页面检测结果是否允许覆盖当前任务状态。 */
export function isPageDetectionStatusLocked(task: DocumentSubmitTask) {
  if (task.status === "running" || task.status === "success" || task.status === "stopped") {
    return true;
  }

  return task.status === "error" && !isPageDetectionMessage(task.message);
}

/** 判断当前任务是否应该被实时页面检测轮询。 */
export function isRealtimePageMonitorStatus(task: DocumentSubmitTask) {
  return task.status === "loading" ||
    task.status === "ready" ||
    (task.status === "error" && isPageDetectionMessage(task.message));
}

/** 判断错误消息是否来自页面检测流程。 */
export function isPageDetectionMessage(message: string) {
  return message.includes("当前不是腾讯收集表页面") ||
    message.includes("填写页正在渲染") ||
    message.includes("当前在结果/统计页") ||
    message.includes("还没有检测到填写题目和提交按钮") ||
    message.includes("网页加载中") ||
    message.includes("网页重新加载中");
}

/** 把提交模式转换为网页预览状态标签文案。 */
export function modeText(mode: DocumentSubmitMode) {
  if (mode === "scheduled-confirm") {
    return "到点确认";
  }

  return "开放填充";
}

/** 把页面检测结果转换为任务状态补丁，不把运行时 URL 写回长期配置。 */
export function buildDocumentPageStatePatch(result: DocumentPageCheckResult): Partial<DocumentSubmitTask> {
  return {
    status: result.ok ? "ready" : "error",
    message: result.message
  };
}

/** 判断页面检测结果是否需要短暂重试。 */
export function shouldRetryDocumentPageCheck(result: DocumentPageCheckResult) {
  if (result.pageKind === "loading") {
    return true;
  }

  if (result.pageKind !== "result") {
    return false;
  }

  try {
    return !new URL(result.url).hash.startsWith("#/result");
  } catch {
    return false;
  }
}
