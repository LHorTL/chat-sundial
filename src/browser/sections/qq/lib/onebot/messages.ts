import type { SendMessageAction, SendMessageTarget } from "./types";

/** 把用户配置的发送目标转换成 OneBot send_* action。 */
export function buildSendMessageAction(target: SendMessageTarget): SendMessageAction {
  const numericTargetId = parseNumericId(target.targetId);
  const common = {
    message: target.message,
    auto_escape: target.autoEscape ?? false
  };

  if (target.recipientType === "group") {
    return {
      action: "send_group_msg",
      params: {
        group_id: numericTargetId,
        ...common
      }
    };
  }

  return {
    action: "send_private_msg",
    params: {
      user_id: numericTargetId,
      ...common
    }
  };
}

/** 把文本 ID 转成 OneBot 需要的正整数。 */
export function parseNumericId(value: string): number {
  const id = Number(value.trim());
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("目标 ID 必须是正数");
  }

  return id;
}
