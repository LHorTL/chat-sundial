import { ContextMenu, Divider, Icon, type ContextMenuItem } from "@fangxinyan/lumina";
import type { DocumentSidebarTask } from "@/sections/docs/lib/task/viewModel";
import type { DocumentTaskAction } from "@/sections/docs/pages/DocumentSubmitPage";

/** 渲染侧边栏两行式导航标签。 */
export function NavLabel({ group, label }: { group: string; label: string }) {
  return (
    <span className="nav-label">
      <small>{group}</small>
      <span>{label}</span>
    </span>
  );
}

/** 渲染文档任务侧边栏项，并挂载任务右键菜单。 */
export function DocumentTaskNavLabel({
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

/** 渲染侧边栏任务列表和主入口之间的分隔线。 */
export function SidebarDivider() {
  return (
    <span className="sidebar-divider-label" aria-hidden="true">
      <Divider className="sidebar-section-divider" sunken />
    </span>
  );
}
