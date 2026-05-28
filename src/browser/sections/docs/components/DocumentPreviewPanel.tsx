import { Tag, Typography } from "@fangxinyan/lumina";
import { EmptyText } from "@/components/page";
import type { DocumentSubmitTask } from "../lib/documentTaskRegistration";
import { getDocumentPreviewStatus, modeText } from "../lib/documentViewModel";
import { DocumentTaskWebview } from "./DocumentTaskWebview";

interface DocumentPreviewPanelProps {
  activeTask: DocumentSubmitTask;
  webviewTasks: DocumentSubmitTask[];
  canUseElectronView: boolean;
  onReady: (taskId: string, webview: WebviewTagElement) => void;
  onDispose: (taskId: string) => void;
  onLoading: (taskId: string) => void;
  onReadyState: (taskId: string, url: string) => void;
  onPageChanged: (taskId: string, url: string) => void;
  onError: (taskId: string, message: string) => void;
  onTitle: (taskId: string, title: string) => void;
}

/** 渲染文档网页预览面板，并保持所有任务 webview 持续挂载。 */
export function DocumentPreviewPanel({
  activeTask,
  webviewTasks,
  canUseElectronView,
  onReady,
  onDispose,
  onLoading,
  onReadyState,
  onPageChanged,
  onError,
  onTitle
}: DocumentPreviewPanelProps) {
  const previewStatus = getDocumentPreviewStatus(activeTask);

  return (
    <div className="document-preview-column">
      <section className="document-view-panel" aria-label="网页预览">
        <div className="document-view-header">
          <div className="document-view-title">
            <Typography.Text strong>网页预览</Typography.Text>
            <Typography.Text type="secondary">{activeTask.name}</Typography.Text>
            <Typography.Text type="secondary" className="document-view-status-text">
              {previewStatus.description}
            </Typography.Text>
          </div>
          <div className="document-view-status">
            <Tag tone={previewStatus.tone} dot>{previewStatus.label}</Tag>
            <Tag tone={activeTask.status === "running" ? "warning" : "neutral"} dot>{modeText(activeTask.mode)}</Tag>
          </div>
        </div>
        <div className="document-webview-slot">
          {canUseElectronView ? (
            webviewTasks.map((task) => (
              <DocumentTaskWebview
                task={task}
                active={task.id === activeTask.id}
                onReady={(webview) => onReady(task.id, webview)}
                onDispose={() => onDispose(task.id)}
                onLoading={() => onLoading(task.id)}
                onReadyState={(url) => onReadyState(task.id, url || task.url)}
                onPageChanged={(url) => onPageChanged(task.id, url || task.url)}
                onError={(message) => onError(task.id, message)}
                onTitle={(title) => onTitle(task.id, title)}
                key={task.id}
              />
            ))
          ) : (
            <EmptyText>请在 Electron 应用中查看腾讯文档网页</EmptyText>
          )}
        </div>
      </section>
    </div>
  );
}
