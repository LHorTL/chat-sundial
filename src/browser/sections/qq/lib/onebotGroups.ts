import type { OneBotGroupInfo } from "./onebotTypes";

/** 把 OneBot get_group_list 响应归一化为选择器可用的群列表。 */
export function parseOneBotGroupList(value: unknown): OneBotGroupInfo[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;
    const groupId = String(record.group_id ?? "").trim();
    if (!groupId) {
      return [];
    }

    const rawName = String(record.group_name ?? "").trim();

    return [{
      groupId,
      groupName: rawName || `群聊 ${groupId}`,
      memberCount: normalizeOptionalNumber(record.member_count),
      maxMemberCount: normalizeOptionalNumber(record.max_member_count)
    }];
  });
}

/** 把 OneBot 群人数等可选数字字段归一化为 number。 */
function normalizeOptionalNumber(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}
