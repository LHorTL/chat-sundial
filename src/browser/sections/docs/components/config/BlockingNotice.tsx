import { Alert, Button } from "@fangxinyan/lumina";

interface DocumentBlockingNoticeProps {
  notice: { title: string; message: string } | null;
  canUseElectronView: boolean;
  onRecheck: () => void;
}

/** 渲染阻塞任务启动的醒目提示，并提供重新检测入口。 */
export function DocumentBlockingNotice({ notice, canUseElectronView, onRecheck }: DocumentBlockingNoticeProps) {
  if (!notice) {
    return null;
  }

  return (
    <Alert
      className="document-blocking-alert"
      tone="danger"
      title={notice.title}
      icon="alert"
      action={
        canUseElectronView ? (
          <Button size="sm" variant="danger" icon="search" onClick={onRecheck}>
            重新检测
          </Button>
        ) : null
      }
    >
      {notice.message}
    </Alert>
  );
}
