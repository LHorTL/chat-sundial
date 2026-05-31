import {
  buildOneBotActionRequest,
  buildOneBotWebSocketActionPayload,
  buildOneBotWebSocketUrl,
  buildSendMessageAction,
  type OneBotActionResponse,
  type OneBotConfig,
  type SendMessageTarget
} from ".";

export async function callOneBotAction(
  config: OneBotConfig,
  action: string,
  params: Record<string, unknown>
): Promise<OneBotActionResponse> {
  if (config.protocol === "websocket") {
    return callOneBotWebSocketAction(config, action, params);
  }

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
    const text = await response.text();
    const raw = parseOneBotJson(text);

    if (text && !raw) {
      return {
        ok: false,
        httpStatus: response.status,
        message: buildNonJsonOneBotMessage(text),
        rawText: text
      };
    }

    return {
      ok: response.ok && (raw?.status == null || raw.status === "ok"),
      httpStatus: response.status,
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

function callOneBotWebSocketAction(
  config: OneBotConfig,
  action: string,
  params: Record<string, unknown>
): Promise<OneBotActionResponse> {
  return new Promise((resolve) => {
    const payload = buildOneBotWebSocketActionPayload(action, params);
    const ws = new WebSocket(buildOneBotWebSocketUrl(config));
    let settled = false;

    const finish = (response: OneBotActionResponse) => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeout);
      ws.close();
      resolve(response);
    };

    const timeout = window.setTimeout(() => {
      finish({
        ok: false,
        message: "WebSocket 调用超时，请确认 OneBot WebSocket action 可用"
      });
    }, 8000);

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify(payload));
    });

    ws.addEventListener("message", (message) => {
      const raw = parseOneBotJson(String(message.data));
      if (!raw || raw.echo !== payload.echo) {
        return;
      }

      finish({
        ok: raw.status == null || raw.status === "ok",
        status: raw.status,
        retcode: raw.retcode,
        data: raw.data,
        message: raw.message,
        wording: raw.wording,
        raw
      });
    });

    ws.addEventListener("error", () => {
      finish({
        ok: false,
        message: "WebSocket 连接失败，请确认地址、端口和 Access Token"
      });
    });

    ws.addEventListener("close", () => {
      finish({
        ok: false,
        message: "WebSocket 已关闭，未收到 OneBot action 响应"
      });
    });
  });
}

function parseOneBotJson(text: string) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as {
      status?: string;
      retcode?: number;
      data?: unknown;
      message?: string;
      wording?: string;
      echo?: string;
    };
  } catch {
    return null;
  }
}

function buildNonJsonOneBotMessage(text: string) {
  const normalized = text.trim();
  if (/upgrade required/i.test(normalized)) {
    return "当前端口返回了 WebSocket 升级提示，不是 OneBot HTTP API 端口。请填写 HTTP 服务端口，或在 OneBot/NapCat 中开启 HTTP API。";
  }

  return normalized ? `OneBot 返回了非 JSON 响应：${normalized.slice(0, 120)}` : "OneBot 返回了空响应";
}
