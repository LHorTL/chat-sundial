import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GlobalTaskRegistration } from "@/lib/globalTask";
import {
  buildOneBotWebSocketUrl,
  matchMonitorEvent,
  type MonitorRule,
  type OneBotConfig,
  type OneBotEvent,
  type SendMessageTarget
} from "../../lib/onebot";
import { loadMonitorRules, saveMonitorRules } from "../../lib/qqStorage";
import { buildMonitorRegistration } from "../../lib/qqViewModel";

interface UseMonitorRulesOptions {
  config: OneBotConfig;
  hasSavedConfig: boolean;
  sendTarget(target: SendMessageTarget): Promise<unknown>;
  onError(message: string): void;
}

/** 管理群状态监控规则、规则持久化和 OneBot 事件流监听。 */
export function useMonitorRules({ config, hasSavedConfig, sendTarget, onError }: UseMonitorRulesOptions) {
  const [rules, setRules] = useState<MonitorRule[]>(() => loadMonitorRules());
  const [eventStatus, setEventStatus] = useState<"idle" | "connected" | "disconnected" | "error">("idle");
  const rulesRef = useRef(rules);
  const sendingRuleIdsRef = useRef(new Set<string>());
  const registrations = useMemo<GlobalTaskRegistration[]>(() => rules.map(buildMonitorRegistration), [rules]);

  useEffect(() => {
    rulesRef.current = rules;
  }, [rules]);

  useEffect(() => {
    saveMonitorRules(rules);
  }, [rules]);

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
              onError(error instanceof Error ? error.message : String(error));
            })
            .finally(() => {
              sendingRuleIdsRef.current.delete(rule.id);
            });
        });
    });

    return () => {
      ws.close();
    };
  }, [config, hasSavedConfig, onError, rules.length, sendTarget]);

  /** 新增一条群状态监控规则。 */
  const createRule = useCallback((rule: MonitorRule) => {
    setRules((current) => [rule, ...current]);
  }, []);

  /** 删除指定群状态监控规则。 */
  const removeRule = useCallback((id: string) => {
    setRules((current) => current.filter((rule) => rule.id !== id));
  }, []);

  /** 启停指定群状态监控规则。 */
  const toggleRule = useCallback((id: string, enabled: boolean) => {
    setRules((current) => current.map((rule) => rule.id === id ? { ...rule, enabled } : rule));
  }, []);

  return {
    rules,
    eventStatus,
    registrations,
    createRule,
    removeRule,
    toggleRule
  };
}
