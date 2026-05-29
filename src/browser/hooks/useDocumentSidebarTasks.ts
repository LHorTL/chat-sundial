import { useCallback, useMemo, useState } from "react";
import type { GlobalTaskRegistration } from "@/lib/globalTask";
import { buildDocumentTaskRegistration, loadDocumentTasks } from "@/sections/docs/lib/task/registration";
import { toDocumentSidebarTask, type DocumentSidebarTask } from "@/sections/docs/lib/task/viewModel";
import type { DocumentTaskAction, DocumentTaskActionRequest } from "@/sections/docs/pages/DocumentSubmitPage";

/** 管理文档侧栏任务、当前任务选择、草稿创建请求和外部任务操作请求。 */
export function useDocumentSidebarTasks() {
  const initialDocumentSidebarTasks = useMemo(() => loadDocumentTasks().map(toDocumentSidebarTask), []);
  const [activeDocumentTaskId, setActiveDocumentTaskId] = useState(() => initialDocumentSidebarTasks[0]?.id ?? "");
  const [documentSidebarTasks, setDocumentSidebarTasks] = useState<DocumentSidebarTask[]>(initialDocumentSidebarTasks);
  const [documentCreateRequest, setDocumentCreateRequest] = useState(0);
  const [documentActionRequest, setDocumentActionRequest] = useState<DocumentTaskActionRequest | null>(null);
  const [documentTasks, setDocumentTasks] = useState<GlobalTaskRegistration[]>(() => createInitialDocumentTasks());

  /** 创建文档任务草稿，只增加请求计数，由文档页面消费。 */
  const createDocumentDraft = useCallback(() => {
    setActiveDocumentTaskId("");
    setDocumentCreateRequest((current) => current + 1);
  }, []);

  /** 选中已保存的文档任务。 */
  const selectDocumentTask = useCallback((id: string) => {
    setActiveDocumentTaskId(id);
  }, []);

  /** 向文档页面发送任务操作请求，并同步切换到对应任务。 */
  const requestDocumentTaskAction = useCallback((taskId: string, action: DocumentTaskAction) => {
    setActiveDocumentTaskId(taskId);
    setDocumentActionRequest({ taskId, action, nonce: Date.now() + Math.random() });
  }, []);

  return {
    activeDocumentTaskId,
    documentCreateRequest,
    documentActionRequest,
    documentSidebarTasks,
    documentTasks,
    createDocumentDraft,
    selectDocumentTask,
    requestDocumentTaskAction,
    setActiveDocumentTaskId,
    setDocumentSidebarTasks,
    setDocumentTasks
  };
}

/** 从文档任务持久化配置创建初始全局任务中心数据。 */
function createInitialDocumentTasks(): GlobalTaskRegistration[] {
  return loadDocumentTasks().map(buildDocumentTaskRegistration);
}
