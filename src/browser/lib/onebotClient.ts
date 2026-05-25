import {
  buildOneBotActionRequest,
  buildSendMessageAction,
  type OneBotActionResponse,
  type OneBotConfig,
  type SendMessageTarget
} from "./onebot";

export async function callOneBotAction(
  config: OneBotConfig,
  action: string,
  params: Record<string, unknown>
): Promise<OneBotActionResponse> {
  const request = buildOneBotActionRequest(config, action, params);

  if (window.chatSundial?.onebot) {
    return window.chatSundial.onebot.action(request);
  }

  try {
    const response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: request.body
    });
    const raw = await response.json().catch(() => null);

    return {
      ok: response.ok && (raw?.status == null || raw.status === "ok"),
      status: raw?.status,
      retcode: raw?.retcode,
      data: raw?.data,
      message: raw?.message,
      wording: raw?.wording,
      raw
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function sendOneBotMessage(config: OneBotConfig, target: SendMessageTarget) {
  const { action, params } = buildSendMessageAction(target);
  return callOneBotAction(config, action, params);
}
