import { readJson, writeJson } from "./storage";

export type StoredAppSection = "qq" | "docs";

const ACTIVE_SECTION_STORAGE_KEY = "chat-sundial:active-section";

/** 读取上次打开的应用板块，异常或未知值统一回退到 QQ 板块。 */
export function loadActiveSection(): StoredAppSection {
  return readJson<StoredAppSection>(ACTIVE_SECTION_STORAGE_KEY, "qq") === "docs" ? "docs" : "qq";
}

/** 保存当前应用板块，用于下次启动恢复侧边栏上下文。 */
export function saveActiveSection(section: StoredAppSection) {
  writeJson(ACTIVE_SECTION_STORAGE_KEY, section);
}
