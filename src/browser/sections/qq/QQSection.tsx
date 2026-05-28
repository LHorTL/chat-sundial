import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, StatusBar, Tag } from "@fangxinyan/lumina";
import type { GlobalTaskRegistration, GlobalTaskStatus } from "../../components/TaskCenter";
import { ConfigPage } from "./pages/ConfigPage";
import { CountdownPage } from "./pages/CountdownPage";
import { MonitorPage } from "./pages/MonitorPage";
import {
  buildOneBotWebSocketUrl,
  DEFAULT_ONEBOT_CONFIG,
  isCountdownDue,
  matchMonitorEvent,
  normalizeOneBotConfig,
  parseOneBotGroupList,
  type CountdownTask,
  type MonitorRule,
  type OneBotConfig,
  type OneBotConnectionStatus,
  type OneBotEvent,
  type OneBotGroupInfo
} from "./lib/onebot";
import { callOneBotAction, sendOneBotMessage } from "./lib/onebotClient";

export type QQPage = "countdown" | "monitor" | "config";

const ONEBOT_CONFIG_STORAGE_KEY = "chat-sundial:onebot-config";
const MONITOR_RULES_STORAGE_KEY = "chat-sundial:monitor-rules";

export function useQQSection(activePage: QQPage) {
  const [config, setConfig] = useState<OneBotConfig>(() => loadOneBotConfig());
  const [hasSavedConfig, setHasSavedConfig] = useState(() => Boolean(localStorage.getItem(ONEBOT_CONFIG_STORAGE_KEY)));
  const [connectionStatus, setConnectionStatus] = useState<OneBotConnectionStatus>(() =>
    localStorage.getItem(ONEBOT_CONFIG_STORAGE_KEY) ? "checking" : "idle"
  );
  const [eventStatus, setEventStatus] = useState<"idle" | "connected" | "disconnected" | "error">("idle");
  const [lastError, setLastError] = useState("");
  const [groups, setGroups] = useState<OneBotGroupInfo[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState("");
  const [tasks, setTasks] = useState<CountdownTask[]>([]);
  const [rules, setRules] = useState<MonitorRule[]>(() => loadMonitorRules());

  const configRef = useRef(config);
  const tasksRef = useRef(tasks);
  const rulesRef = useRef(rules);
  const sendingTaskIdsRef = useRef(new Set<string>());
  const sendingRuleIdsRef = useRef(new Set<string>());
  const connectionCheckSeqRef = useRef(0);
  const skipNextAutoCheckRef = useRef(false);

  const sidebarItems = useMemo(
    () => [
      { key: "countdown", label: <NavLabel group="QQ" label="倒计时发送" />, icon: <Icon name="clock" size={16} />, badge: tasks.length || undefined },
      { key: "monitor", label: <NavLabel group="QQ" label="群状态监控" />, icon: <Icon name="bell" size={16} />, badge: rules.length || undefined },
      { key: "config", label: <NavLabel group="QQ" label="OneBot 配置" />, icon: <Icon name="settings" size={16} />, badge: connectionStatus === "connected" ? "OK" : undefined }
    ],
    [connectionStatus, rules.length, tasks.length]
  );
  const taskRegistrations = useMemo(
    () => [
      ...tasks.map(buildCountdownRegistration),
      ...rules.map(buildMonitorRegistration)
    ],
    [rules, tasks]
  );

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const checkConnection = useCallback(async (nextConfig: OneBotConfig) => {
    const checkSeq = ++connectionCheckSeqRef.current;
    setConnectionStatus("checking");
    setLastError("");

    const response = await callOneBotAction(nextConfig, "get_status", {});
    if (checkSeq !== connectionCheckSeqRef.current) {
      return response.ok;
    }

    if (response.ok) {
      setConnectionStatus("connected");
      setLastError("");
      return true;
    }

    setConnectionStatus("error");
    setLastError(formatOneBotActionError(response, "get_status"));
    return false;
  }, []);

  useEffect(() => {
    if (!hasSavedConfig) {
      setConnectionStatus("idle");
      return;
    }

    if (skipNextAutoCheckRef.current) {
      skipNextAutoCheckRef.current = false;
      return;
    }

    void checkConnection(config);
  }, [checkConnection, config, hasSavedConfig]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    rulesRef.current = rules;
  }, [rules]);

  useEffect(() => {
    try {
      localStorage.setItem(MONITOR_RULES_STORAGE_KEY, JSON.stringify(rules));
    } catch {
      // Persistence is best-effort; runtime behavior should not break if storage is unavailable.
    }
  }, [rules]);

  useEffect(() => {
    if (!hasSavedConfig) {
      setGroups([]);
      setGroupsError("");
      setGroupsLoading(false);
      return;
    }

    let cancelled = false;
    setGroupsLoading(true);
    setGroupsError("");

    callOneBotAction(config, "get_group_list", {})
      .then((response) => {
        if (cancelled) {
          return;
        }

        if (response.ok) {
          setGroups(parseOneBotGroupList(response.data));
          setGroupsError("");
          return;
        }

        setGroups([]);
        setGroupsError(response.wording || response.message || `get_group_list 失败: ${response.retcode ?? "unknown"}`);
      })
      .catch((error) => {
        if (!cancelled) {
          setGroups([]);
          setGroupsError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setGroupsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [config, hasSavedConfig]);

  const sendTarget = useCallback(async (target: Pick<MonitorRule, "recipientType" | "targetId" | "message">) => {
    const response = await sendOneBotMessage(configRef.current, target);
    if (!response.ok) {
      throw new Error(response.wording || response.message || `OneBot 调用失败: ${response.retcode ?? "unknown"}`);
    }
    return response;
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const dueTasks = tasksRef.current.filter(
        (task) => task.status === "waiting" && isCountdownDue(task, Date.now()) && !sendingTaskIdsRef.current.has(task.id)
      );

      dueTasks.forEach((task) => {
        sendingTaskIdsRef.current.add(task.id);
        sendTarget(task)
          .then(() => {
            setTasks((current) => current.filter((item) => item.id !== task.id));
          })
          .catch((error) => {
            setTasks((current) =>
              current.map((item) =>
                item.id === task.id
                  ? { ...item, status: "failed", lastError: error instanceof Error ? error.message : String(error) }
                  : item
              )
            );
          })
          .finally(() => {
            sendingTaskIdsRef.current.delete(task.id);
          });
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [sendTarget]);

  useEffect(() => {
    if (!hasSavedConfig || !config.wsUrl || rules.length === 0) {
      setEventStatus("idle");
      return;
    }

    const ws = new WebSocket(buildOneBotWebSocketUrl(config));
    setEventStatus("disconnected");

    ws.addEventListener("open", () => setEventStatus("connected"));
    ws.addEventListener("error", () => setEventStatus("error"));
    ws.addEventListener("close", () => setEventStatus("disconnected"));
    ws.addEventListener("message", (message) => {
      let event: OneBotEvent;
      try {
        event = JSON.parse(String(message.data)) as OneBotEvent;
      } catch {
        return;
      }

      rulesRef.current
        .filter((rule) => rule.enabled !== false && !sendingRuleIdsRef.current.has(rule.id) && matchMonitorEvent(rule, event))
        .forEach((rule) => {
          sendingRuleIdsRef.current.add(rule.id);
          sendTarget(rule)
            .then(() => {
              setRules((current) =>
                current.map((item) =>
                  item.id === rule.id
                    ? {
                        ...item,
                        enabled: (item.runMode ?? "repeat") === "once" ? false : item.enabled,
                        lastMatchedAt: Date.now()
                      }
                    : item
                )
              );
            })
            .catch((error) => {
              setLastError(error instanceof Error ? error.message : String(error));
            })
            .finally(() => {
              sendingRuleIdsRef.current.delete(rule.id);
            });
        });
    });

    return () => {
      ws.close();
    };
  }, [config, hasSavedConfig, rules.length, sendTarget]);

  const persistConfig = (nextConfig: OneBotConfig) => {
    const normalized = normalizeOneBotConfig(nextConfig);
    localStorage.setItem(ONEBOT_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
    setConfig(normalized);
    setHasSavedConfig(true);
    return normalized;
  };

  const saveConfig = (nextConfig: OneBotConfig) => {
    persistConfig(nextConfig);
    setConnectionStatus("idle");
    setLastError("");
  };

  const testConnection = async (nextConfig: OneBotConfig) => {
    skipNextAutoCheckRef.current = true;
    const normalized = persistConfig(nextConfig);
    await checkConnection(normalized);
  };

  const content = useMemo(() => {
    if (activePage === "monitor") {
      return (
        <MonitorPage
          rules={rules}
          groups={groups}
          groupsLoading={groupsLoading}
          groupsError={groupsError}
          eventStatus={eventStatus}
          onCreateRule={(rule) => setRules((current) => [rule, ...current])}
          onRemoveRule={(id) => setRules((current) => current.filter((rule) => rule.id !== id))}
          onToggleRule={(id, enabled) => setRules((current) => current.map((rule) => rule.id === id ? { ...rule, enabled } : rule))}
        />
      );
    }

    if (activePage === "config") {
      return (
        <ConfigPage
          config={config}
          connectionStatus={connectionStatus}
          lastError={lastError}
          onSave={saveConfig}
          onTest={testConnection}
        />
      );
    }

    return (
      <CountdownPage
        tasks={tasks}
        groups={groups}
        groupsLoading={groupsLoading}
        groupsError={groupsError}
        onCreateTask={(task) => setTasks((current) => [task, ...current])}
        onRemoveTask={(id) => setTasks((current) => current.filter((task) => task.id !== id))}
      />
    );
  }, [activePage, config, connectionStatus, eventStatus, groups, groupsError, groupsLoading, lastError, rules, tasks]);

  return {
    sidebarItems,
    taskRegistrations,
    content,
    statusLeft: (
      <StatusBar.Item icon={<Icon name="sync" size={12} />} tone={statusTone(connectionStatus)}>
        OneBot {statusLabel(connectionStatus)}
      </StatusBar.Item>
    ),
    statusCenter: config.protocol === "websocket" ? config.wsUrl : config.httpUrl,
    eventStatusLabel: eventStatusLabel(eventStatus)
  };
}

function buildCountdownRegistration(task: CountdownTask): GlobalTaskRegistration {
  const targetMs = getCountdownTargetMs(task);
  const status = countdownStatus(task.status);
  const lastErrorLog = task.lastError
    ? [{ time: new Date().toISOString(), message: task.lastError }]
    : undefined;

  return {
    id: `qq-countdown-${task.id}`,
    section: "qq",
    kind: "qq-countdown",
    title: task.name,
    status,
    statusLabel: task.status === "failed" ? "发送失败" : task.status === "sent" ? "已发送" : "等待中",
    primary: targetMs ? `目标 ${formatDateTime(targetMs)}` : `${task.seconds ?? 0} 秒倒计时`,
    secondary: `${task.recipientType === "group" ? "群聊" : "私聊"} ${task.targetId}`,
    meta: [
      task.mode === "schedule" ? "指定时间" : "倒计时",
      task.message.slice(0, 42) || "空消息"
    ],
    logs: lastErrorLog,
    countdownTargetMs: targetMs,
    updatedAt: targetMs ?? task.startedAt ?? 0
  };
}

function buildMonitorRegistration(rule: MonitorRule): GlobalTaskRegistration {
  const completed = rule.enabled === false && rule.runMode === "once" && Boolean(rule.lastMatchedAt);
  const status: GlobalTaskStatus = completed ? "success" : rule.enabled === false ? "disabled" : "waiting";

  return {
    id: `qq-monitor-${rule.id}`,
    section: "qq",
    kind: "qq-monitor",
    title: rule.name || "未命名监控",
    status,
    statusLabel: completed ? "已完成" : rule.enabled === false ? "已停用" : "监控中",
    primary: describeMonitorTrigger(rule),
    secondary: `来源群 ${rule.sourceGroupId}`,
    meta: [
      `发送到 ${rule.recipientType === "group" ? "群聊" : "私聊"} ${rule.targetId}`,
      rule.runMode === "once" ? "触发后关闭" : "持续监控"
    ],
    logs: rule.lastMatchedAt ? [{ time: new Date(rule.lastMatchedAt).toISOString(), message: "监控规则已触发" }] : undefined,
    updatedAt: rule.lastMatchedAt ?? 0
  };
}

function countdownStatus(status: CountdownTask["status"]): GlobalTaskStatus {
  if (status === "failed") return "error";
  if (status === "sent") return "success";
  return "waiting";
}

function getCountdownTargetMs(task: CountdownTask) {
  if (task.mode === "schedule" && task.runAt) {
    const value = Date.parse(task.runAt);
    return Number.isFinite(value) ? value : undefined;
  }

  if (task.mode === "countdown" && task.startedAt && task.seconds) {
    return task.startedAt + task.seconds * 1000;
  }

  return undefined;
}

function describeMonitorTrigger(rule: MonitorRule) {
  if (rule.trigger === "regex") {
    return `群消息 /${rule.pattern || ""}/`;
  }

  return rule.trigger === "mute_on" ? "群禁言开启" : "群禁言关闭";
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function NavLabel({ group, label }: { group: string; label: string }) {
  return (
    <span className="nav-label">
      <small>{group}</small>
      <span>{label}</span>
    </span>
  );
}

function loadOneBotConfig(): OneBotConfig {
  try {
    const raw = localStorage.getItem(ONEBOT_CONFIG_STORAGE_KEY);
    return raw ? normalizeOneBotConfig(JSON.parse(raw) as Partial<OneBotConfig>) : DEFAULT_ONEBOT_CONFIG;
  } catch {
    return DEFAULT_ONEBOT_CONFIG;
  }
}

function loadMonitorRules(): MonitorRule[] {
  try {
    const raw = localStorage.getItem(MONITOR_RULES_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(isMonitorRuleLike).map(normalizeMonitorRule) : [];
  } catch {
    return [];
  }
}

function normalizeMonitorRule(rule: MonitorRule): MonitorRule {
  return {
    ...rule,
    runMode: rule.runMode === "once" ? "once" : "repeat"
  };
}

function isMonitorRuleLike(value: unknown): value is MonitorRule {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<MonitorRule>;
  return Boolean(record.id && record.sourceGroupId && record.trigger && record.recipientType && record.targetId && record.message);
}

function statusTone(status: OneBotConnectionStatus) {
  if (status === "connected") return "success";
  if (status === "error") return "danger";
  if (status === "checking") return "warning";
  return "muted";
}

function statusLabel(status: OneBotConnectionStatus) {
  if (status === "connected") return "已连接";
  if (status === "checking") return "检测中";
  if (status === "error") return "连接失败";
  return "未连接";
}

function eventStatusLabel(status: "idle" | "connected" | "disconnected" | "error") {
  if (status === "connected") return "已连接";
  if (status === "disconnected") return "已断开";
  if (status === "error") return "错误";
  return "未启用";
}

function formatOneBotActionError(response: { httpStatus?: number; retcode?: number; message?: string; wording?: string }, action: string) {
  if (response.wording) return response.wording;
  if (response.message) return response.message;
  if (response.retcode != null) return `${action} 返回 retcode=${response.retcode}`;
  if (response.httpStatus != null) return `${action} HTTP ${response.httpStatus}`;
  return `${action} 调用失败`;
}
