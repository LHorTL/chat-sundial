import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppShell,
  ContextMenu,
  type ContextMenuItem,
  Divider,
  Icon,
  Radio,
  Sidebar,
  StatusBar,
  Tag,
  ThemeProvider,
  THEME_PANEL_DEFAULT_THEME_PRESETS,
  TitleBar,
  Typography
} from "@fangxinyan/lumina";
import { TaskCenter, type GlobalTaskRegistration } from "./components/TaskCenter";
import { buildDocumentTaskRegistration, loadDocumentTasks, type DocumentSubmitTask } from "./sections/docs/lib/documentTaskRegistration";
import { DocumentSubmitPage, type DocumentTaskAction, type DocumentTaskActionRequest } from "./sections/docs/pages/DocumentSubmitPage";
import { useQQSection, type QQPage } from "./sections/qq/QQSection";

type AppSection = "qq" | "docs";
type AppPage = QQPage | "docs";
interface DocumentSidebarTask {
  id: string;
  name: string;
  status: DocumentSubmitTask["status"];
  statusLabel: string;
}

const ACTIVE_SECTION_STORAGE_KEY = "chat-sundial:active-section";

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

export default function App() {
  const [now, setNow] = useState(() => new Date());
  const [version, setVersion] = useState("0.0.0");
  const [activeSection, setActiveSection] = useState<AppSection>(() => loadActiveSection());
  const [activeKey, setActiveKey] = useState<AppPage>(() => loadActiveSection() === "docs" ? "docs" : "countdown");
  const initialDocumentSidebarTasks = useMemo(() => loadDocumentTasks().map(toDocumentSidebarTask), []);
  const [activeDocumentTaskId, setActiveDocumentTaskId] = useState(() => initialDocumentSidebarTasks[0]?.id ?? "");
  const [documentSidebarTasks, setDocumentSidebarTasks] = useState<DocumentSidebarTask[]>(initialDocumentSidebarTasks);
  const [documentCreateRequest, setDocumentCreateRequest] = useState(0);
  const [documentActionRequest, setDocumentActionRequest] = useState<DocumentTaskActionRequest | null>(null);
  const [documentTasks, setDocumentTasks] = useState<GlobalTaskRegistration[]>(() => createInitialDocumentTasks());

  const bridge = window.chatSundial;
  const platform = bridge?.platform ?? "browser";
  const shellPlatform = platform === "darwin" ? "mac" : "windows";
  const activeQQPage: QQPage = activeKey === "docs" ? "countdown" : activeKey;
  const qqSection = useQQSection(activeQQPage);
  const canUseElectronDocs = Boolean(bridge && platform !== "browser");

  const requestDocumentTaskAction = useCallback((taskId: string, action: DocumentTaskAction) => {
    setActiveKey("docs");
    setActiveDocumentTaskId(taskId);
    setDocumentActionRequest({ taskId, action, nonce: Date.now() + Math.random() });
  }, []);

  const docsSidebarItems = useMemo(
    () => [
      { key: "docs-new", label: <NavLabel group="文档" label="自助提交" />, icon: <Icon name="file" size={16} /> },
      ...(documentSidebarTasks.length > 0
        ? [{ key: "docs-task-divider", label: <SidebarDivider /> }]
        : []),
      ...documentSidebarTasks.map((task) => ({
        key: `docs-task:${task.id}`,
        label: (
          <DocumentTaskNavLabel
            task={task}
            canUseElectronView={canUseElectronDocs}
            onAction={requestDocumentTaskAction}
          />
        ),
        icon: <Icon name="file" size={14} />,
        badge: task.statusLabel === "未加载" ? undefined : task.statusLabel
      }))
    ],
    [canUseElectronDocs, documentSidebarTasks, requestDocumentTaskAction]
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    bridge?.getVersion().then(setVersion).catch(() => setVersion("dev"));
    return () => window.clearInterval(timer);
  }, [bridge]);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_SECTION_STORAGE_KEY, activeSection);
    } catch {
      // Section persistence is a UI convenience and should never block rendering.
    }
  }, [activeSection]);

  const selectSection = useCallback((section: AppSection) => {
    setActiveSection(section);
    setActiveKey((current) => section === "docs" ? "docs" : current === "docs" ? "countdown" : current);
  }, []);

  const handleSidebarSelect = useCallback((key: string) => {
    if (activeSection === "docs") {
      if (key === "docs-new") {
        setActiveKey("docs");
        setActiveDocumentTaskId("");
        setDocumentCreateRequest((current) => current + 1);
        return;
      }

      if (key === "docs-task-divider") {
        return;
      }

      if (key.startsWith("docs-task:")) {
        setActiveKey("docs");
        setActiveDocumentTaskId(key.slice("docs-task:".length));
        return;
      }
    }

    setActiveKey(key as AppPage);
  }, [activeSection]);

  const sidebarItems = activeSection === "docs" ? docsSidebarItems : qqSection.sidebarItems;
  const sidebarActiveKey = activeSection === "docs" ? activeDocumentTaskId ? `docs-task:${activeDocumentTaskId}` : "docs-new" : activeQQPage;
  const globalTasks = useMemo(
    () => [...qqSection.taskRegistrations, ...documentTasks],
    [documentTasks, qqSection.taskRegistrations]
  );

  return (
    <ThemeProvider
      mode="assistant"
      accent="mint"
      themes={{ assistant: THEME_PANEL_DEFAULT_THEME_PRESETS.assistant }}
    >
      <AppShell
        titleBar={
          <TitleBar
            platform={shellPlatform}
            title={<Typography.Text strong>ChatSundial</Typography.Text>}
            onClose={() => bridge?.window.close()}
            onMaximize={() => bridge?.window.maximize()}
            onMinimize={() => bridge?.window.minimize()}
            className="titlebar-shell"
          />
        }
        sidebar={
          <Sidebar
            items={sidebarItems}
            activeKey={sidebarActiveKey}
            onSelect={(key) => handleSidebarSelect(String(key))}
            header={
              <div className="sidebar-header-stack">
                <div className="sidebar-brand">
                  <span className="sidebar-brand__icon">
                    <Icon name="sun" size={18} />
                  </span>
                  <span>
                    <strong>ChatSundial</strong>
                    <small>Desktop preview</small>
                  </span>
                </div>
                <div className="section-switch">
                  <Radio.Group
                    value={activeSection}
                    onChange={(value) => selectSection(value as AppSection)}
                    options={[
                      { value: "qq", label: "QQ" },
                      { value: "docs", label: "文档" }
                    ]}
                    variant="segmented"
                    size="sm"
                  />
                </div>
              </div>
            }
            footer={
              <div className="sidebar-footer-card">
                <Tag tone="success" dot>
                  Electron ready
                </Tag>
                <span>v{version}</span>
              </div>
            }
          />
        }
      >
        <div className="workspace" aria-label="主内容区">
          <div className="workspace-stack">
            <section
              className={`workspace-panel workspace-panel--qq ${activeSection === "qq" ? "is-active" : "is-hidden"}`}
              aria-hidden={activeSection !== "qq"}
            >
              {qqSection.content}
            </section>
            <section
              className={`workspace-panel workspace-panel--docs ${activeSection === "docs" ? "is-active" : "is-hidden"}`}
              aria-hidden={activeSection !== "docs"}
            >
              <DocumentSubmitPage
                createRequest={documentCreateRequest}
                selectedTaskId={activeDocumentTaskId}
                actionRequest={documentActionRequest}
                onActiveTaskChange={setActiveDocumentTaskId}
                onSidebarTasksChange={setDocumentSidebarTasks}
                onTaskSnapshotChange={setDocumentTasks}
              />
            </section>
          </div>
        </div>

        <StatusBar
          left={activeSection === "docs" ? (
            <StatusBar.Item icon={<Icon name="file" size={12} />} tone="accent">
              文档板块
            </StatusBar.Item>
          ) : qqSection.statusLeft}
          center={<StatusBar.Item tone="accent">{activeSection === "docs" ? "腾讯文档自助提交" : qqSection.statusCenter}</StatusBar.Item>}
          right={
            activeSection === "docs" ? (
              <StatusBar.Item tone="muted">{formatTime(now)}</StatusBar.Item>
            ) : (
              <>
                <StatusBar.Item tone="muted">事件流 {qqSection.eventStatusLabel}</StatusBar.Item>
                <StatusBar.Item tone="muted">{formatTime(now)}</StatusBar.Item>
              </>
            )
          }
        />
        <TaskCenter tasks={globalTasks} now={now} />
      </AppShell>
    </ThemeProvider>
  );
}

function NavLabel({ group, label }: { group: string; label: string }) {
  return (
    <span className="nav-label">
      <small>{group}</small>
      <span>{label}</span>
    </span>
  );
}

function DocumentTaskNavLabel({
  task,
  canUseElectronView,
  onAction
}: {
  task: DocumentSidebarTask;
  canUseElectronView: boolean;
  onAction: (taskId: string, action: DocumentTaskAction) => void;
}) {
  const menuItems: ContextMenuItem[] = [
    {
      key: "start",
      label: "开始任务",
      icon: <Icon name="play" size={14} />,
      disabled: !canUseElectronView || task.status === "running",
      onSelect: () => onAction(task.id, "start")
    },
    {
      key: "update",
      label: "更新运行配置",
      icon: <Icon name="sync" size={14} />,
      disabled: !canUseElectronView || task.status !== "running",
      onSelect: () => onAction(task.id, "update")
    },
    {
      key: "reload",
      label: "刷新网页",
      icon: <Icon name="sync" size={14} />,
      disabled: !canUseElectronView,
      onSelect: () => onAction(task.id, "reload")
    },
    {
      key: "stop",
      label: "停止任务",
      icon: <Icon name="pause" size={14} />,
      disabled: !canUseElectronView || task.status !== "running",
      onSelect: () => onAction(task.id, "stop")
    },
    { key: "run-divider", type: "divider" },
    {
      key: "reset",
      label: "重新开始",
      icon: <Icon name="reload" size={14} />,
      onSelect: () => onAction(task.id, "reset")
    },
    {
      key: "duplicate",
      label: "复制任务",
      icon: <Icon name="copy" size={14} />,
      onSelect: () => onAction(task.id, "duplicate")
    },
    {
      key: "devtools",
      label: "开发者工具",
      icon: <Icon name="code" size={14} />,
      disabled: !canUseElectronView,
      onSelect: () => onAction(task.id, "openDevTools")
    },
    { key: "danger-divider", type: "divider" },
    {
      key: "remove",
      label: "删除任务",
      icon: <Icon name="trash" size={14} />,
      danger: true,
      onSelect: () => onAction(task.id, "remove")
    }
  ];

  return (
    <ContextMenu items={menuItems} minWidth={188}>
      <span className="nav-label nav-label--context">
        <small>任务</small>
        <span>{task.name || "未命名任务"}</span>
      </span>
    </ContextMenu>
  );
}

function SidebarDivider() {
  return (
    <span className="sidebar-divider-label" aria-hidden="true">
      <Divider className="sidebar-section-divider" sunken />
    </span>
  );
}

function loadActiveSection(): AppSection {
  if (typeof localStorage === "undefined") {
    return "qq";
  }

  try {
    return localStorage.getItem(ACTIVE_SECTION_STORAGE_KEY) === "docs" ? "docs" : "qq";
  } catch {
    return "qq";
  }
}

function createInitialDocumentTasks(): GlobalTaskRegistration[] {
  return loadDocumentTasks().map(buildDocumentTaskRegistration);
}

function toDocumentSidebarTask(task: DocumentSubmitTask): DocumentSidebarTask {
  return {
    id: task.id,
    name: task.name,
    status: task.status,
    statusLabel: documentStatusLabel(task.status)
  };
}

function documentStatusLabel(status: DocumentSubmitTask["status"]) {
  const label: Record<DocumentSubmitTask["status"], string> = {
    idle: "未加载",
    loading: "加载中",
    ready: "就绪",
    running: "运行中",
    success: "完成",
    error: "错误",
    stopped: "停止"
  };
  return label[status];
}
