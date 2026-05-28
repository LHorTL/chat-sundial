import { Icon, Radio, Sidebar, Tag, type SidebarItem } from "@fangxinyan/lumina";
import type { AppSection } from "../hooks/useAppNavigation";

interface AppSidebarProps {
  items: SidebarItem[];
  activeKey: string;
  activeSection: AppSection;
  version: string;
  onSelect(key: string): void;
  onSectionChange(section: AppSection): void;
}

/** 渲染应用左侧栏、板块切换和底部运行信息。 */
export function AppSidebar({
  items,
  activeKey,
  activeSection,
  version,
  onSelect,
  onSectionChange
}: AppSidebarProps) {
  return (
    <Sidebar
      items={items}
      activeKey={activeKey}
      onSelect={(key) => onSelect(String(key))}
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
              options={[
                { value: "qq", label: "QQ" },
                { value: "docs", label: "文档" }
              ]}
              variant="segmented"
              size="sm"
              onChange={(value) => onSectionChange(value as AppSection)}
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
  );
}
