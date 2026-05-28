import { useCallback, useEffect, useState } from "react";
import { loadActiveSection, saveActiveSection } from "../lib/appStorage";
import type { QQPage } from "../sections/qq/QQSection";

export type AppSection = "qq" | "docs";
export type AppPage = QQPage | "docs";

/** 管理应用 QQ/文档板块切换和 QQ 子页面选择，并持久化最近板块。 */
export function useAppNavigation() {
  const [activeSection, setActiveSection] = useState<AppSection>(() => loadActiveSection());
  const [activeKey, setActiveKey] = useState<AppPage>(() => loadActiveSection() === "docs" ? "docs" : "countdown");
  const activeQQPage: QQPage = activeKey === "docs" ? "countdown" : activeKey;

  useEffect(() => {
    try {
      saveActiveSection(activeSection);
    } catch {
      // 板块持久化只是 UI 便利能力，失败时不阻塞页面渲染。
    }
  }, [activeSection]);

  /** 切换 QQ/文档板块，并保持当前板块内部页面选择稳定。 */
  const selectSection = useCallback((section: AppSection) => {
    setActiveSection(section);
    setActiveKey((current) => section === "docs" ? "docs" : current === "docs" ? "countdown" : current);
  }, []);

  /** 切换到指定 QQ 子页面。 */
  const selectQQPage = useCallback((page: QQPage) => {
    setActiveSection("qq");
    setActiveKey(page);
  }, []);

  /** 切换到文档板块主页面。 */
  const setDocsActive = useCallback(() => {
    setActiveSection("docs");
    setActiveKey("docs");
  }, []);

  return {
    activeSection,
    activeKey,
    activeQQPage,
    selectSection,
    selectQQPage,
    setDocsActive
  };
}
