import { readJson, writeJson } from "@/lib/storage";
import { DEFAULT_ONEBOT_CONFIG, normalizeOneBotConfig } from "./onebot";
import type { MonitorRule, OneBotConfig } from "./onebot";

const ONEBOT_CONFIG_STORAGE_KEY = "chat-sundial:onebot-config";
const MONITOR_RULES_STORAGE_KEY = "chat-sundial:monitor-rules";

/** 判断用户是否已经保存过 OneBot 配置。 */
export function hasSavedOneBotConfig() {
  return readJson<OneBotConfig | null>(ONEBOT_CONFIG_STORAGE_KEY, null) !== null;
}

/** 读取并归一化 OneBot 配置，缺失时使用默认本地 HTTP 配置。 */
export function loadOneBotConfig(): OneBotConfig {
  return normalizeOneBotConfig(readJson<Partial<OneBotConfig> | null>(ONEBOT_CONFIG_STORAGE_KEY, DEFAULT_ONEBOT_CONFIG));
}

/** 保存 OneBot 配置，写入前统一归一化 HTTP 和 WebSocket 地址。 */
export function saveOneBotConfig(config: OneBotConfig): OneBotConfig {
  const normalized = normalizeOneBotConfig(config);
  writeJson(ONEBOT_CONFIG_STORAGE_KEY, normalized);
  return normalized;
}

/** 读取群状态监控规则，过滤掉缺少关键字段的脏数据。 */
export function loadMonitorRules(): MonitorRule[] {
  const value = readJson<unknown[]>(MONITOR_RULES_STORAGE_KEY, []);
  return Array.isArray(value) ? value.filter(isMonitorRuleLike).map(normalizeMonitorRule) : [];
}

/** 保存群状态监控规则列表。 */
export function saveMonitorRules(rules: MonitorRule[]) {
  writeJson(MONITOR_RULES_STORAGE_KEY, rules);
}

/** 补齐监控规则运行模式，旧值或空值统一视为循环运行。 */
function normalizeMonitorRule(rule: MonitorRule): MonitorRule {
  return {
    ...rule,
    runMode: rule.runMode === "once" ? "once" : "repeat"
  };
}

/** 判断未知对象是否具备监控规则所需的关键字段。 */
function isMonitorRuleLike(value: unknown): value is MonitorRule {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<MonitorRule>;
  return Boolean(record.id && record.sourceGroupId && record.trigger && record.recipientType && record.targetId && record.message);
}
