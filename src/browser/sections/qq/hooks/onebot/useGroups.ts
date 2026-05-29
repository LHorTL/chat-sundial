import { useEffect, useState } from "react";
import { callOneBotAction } from "../../lib/onebot/client";
import { parseOneBotGroupList, type OneBotConfig, type OneBotGroupInfo } from "../../lib/onebot";

interface UseOneBotGroupsOptions {
  config: OneBotConfig;
  hasSavedConfig: boolean;
}

/** 根据当前 OneBot 配置加载群列表，并防止过期请求覆盖最新状态。 */
export function useOneBotGroups({ config, hasSavedConfig }: UseOneBotGroupsOptions) {
  const [groups, setGroups] = useState<OneBotGroupInfo[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState("");

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

  return {
    groups,
    groupsLoading,
    groupsError
  };
}
