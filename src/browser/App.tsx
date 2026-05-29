import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppShell,
  Icon,
  ThemeProvider,
  THEME_PANEL_DEFAULT_THEME_PRESETS,
  TitleBar,
  Typography
} from "@fangxinyan/lumina";
import { AppSidebar } from "./components/app-shell/Sidebar";
import { DocumentTaskNavLabel, NavLabel, SidebarDivider } from "./components/app-shell/SidebarItems";
import { AppStatusBar } from "./components/app-shell/StatusBar";
import { TaskCenter } from "./components/task-center/TaskCenter";
import { useAppNavigation } from "./hooks/useAppNavigation";
import { useDocumentSidebarTasks } from "./hooks/useDocumentSidebarTasks";
import { DocumentSubmitPage } from "./sections/docs/pages/DocumentSubmitPage";
import { useQQSection, type QQPage } from "./sections/qq/QQSection";

/** 渲染应用壳，负责板块切换、侧边栏和全局任务中心聚合。 */
export default function App() {
  const [now, setNow] = useState(() => new Date());
  const [version, setVersion] = useState("0.0.0");
  const navigation = useAppNavigation();
  const documentSidebar = useDocumentSidebarTasks();

  const bridge = window.chatSundial;
  const platform = bridge?.platform ?? "browser";
  const shellPlatform = platform === "darwin" ? "mac" : "windows";
  const qqSection = useQQSection(navigation.activeQQPage);
  const canUseElectronDocs = Boolean(bridge && platform !== "browser");

  const docsSidebarItems = useMemo(
    () => [
      { key: "docs-new", label: <NavLabel group="文档" label="自助提交" />, icon: <Icon name="file" size={16} /> },
      ...(documentSidebar.documentSidebarTasks.length > 0
        ? [{ key: "docs-task-divider", label: <SidebarDivider /> }]
        : []),
      ...documentSidebar.documentSidebarTasks.map((task) => ({
        key: `docs-task:${task.id}`,
        label: (
          <DocumentTaskNavLabel
            task={task}
            canUseElectronView={canUseElectronDocs}
            onAction={(taskId, action) => {
              navigation.setDocsActive();
              documentSidebar.requestDocumentTaskAction(taskId, action);
            }}
          />
        ),
        icon: <Icon name="file" size={14} />,
        badge: task.statusLabel === "未加载" ? undefined : task.statusLabel
      }))
    ],
    [canUseElectronDocs, documentSidebar, navigation]
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    bridge?.getVersion().then(setVersion).catch(() => setVersion("dev"));
    return () => window.clearInterval(timer);
  }, [bridge]);

  /** 处理侧边栏点击，文档新建入口只创建草稿，不立即保存任务。 */
  const handleSidebarSelect = useCallback((key: string) => {
    if (navigation.activeSection === "docs") {
      if (key === "docs-new") {
        navigation.setDocsActive();
        documentSidebar.createDocumentDraft();
        return;
      }

      if (key === "docs-task-divider") {
        return;
      }

      if (key.startsWith("docs-task:")) {
        navigation.setDocsActive();
        documentSidebar.selectDocumentTask(key.slice("docs-task:".length));
        return;
      }
    }

    navigation.selectQQPage(key as QQPage);
  }, [documentSidebar, navigation]);

  const sidebarItems = navigation.activeSection === "docs" ? docsSidebarItems : qqSection.sidebarItems;
  const sidebarActiveKey = navigation.activeSection === "docs" ? documentSidebar.activeDocumentTaskId ? `docs-task:${documentSidebar.activeDocumentTaskId}` : "docs-new" : navigation.activeQQPage;
  const globalTasks = useMemo(
    () => [...qqSection.taskRegistrations, ...documentSidebar.documentTasks],
    [documentSidebar.documentTasks, qqSection.taskRegistrations]
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
          <AppSidebar
            items={sidebarItems}
            activeKey={sidebarActiveKey}
            activeSection={navigation.activeSection}
            version={version}
            onSelect={handleSidebarSelect}
            onSectionChange={navigation.selectSection}
          />
        }
      >
        <div className="workspace" aria-label="主内容区">
          <div className="workspace-stack">
            <section
              className={`workspace-panel workspace-panel--qq ${navigation.activeSection === "qq" ? "is-active" : "is-hidden"}`}
              aria-hidden={navigation.activeSection !== "qq"}
            >
              {qqSection.content}
            </section>
            <section
              className={`workspace-panel workspace-panel--docs ${navigation.activeSection === "docs" ? "is-active" : "is-hidden"}`}
              aria-hidden={navigation.activeSection !== "docs"}
            >
              <DocumentSubmitPage
                createRequest={documentSidebar.documentCreateRequest}
                selectedTaskId={documentSidebar.activeDocumentTaskId}
                actionRequest={documentSidebar.documentActionRequest}
                onActiveTaskChange={documentSidebar.setActiveDocumentTaskId}
                onSidebarTasksChange={documentSidebar.setDocumentSidebarTasks}
                onTaskSnapshotChange={documentSidebar.setDocumentTasks}
              />
            </section>
          </div>
        </div>

        <AppStatusBar
          activeSection={navigation.activeSection}
          qqStatusLeft={qqSection.statusLeft}
          qqStatusCenter={qqSection.statusCenter}
          qqEventStatusLabel={qqSection.eventStatusLabel}
          now={now}
        />
        <TaskCenter tasks={globalTasks} now={now} />
      </AppShell>
    </ThemeProvider>
  );
}
