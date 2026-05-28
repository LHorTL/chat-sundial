import { ipcMain } from "electron";

interface OneBotActionRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

interface OneBotRawResponse {
  status?: string;
  retcode?: number;
  data?: unknown;
  message?: string;
  wording?: string;
}

/** 注册 OneBot HTTP action 代理，让渲染进程避免直接受跨域限制影响。 */
export function registerOneBotIpc() {
  ipcMain.handle("onebot:action", async (_event, request: OneBotActionRequest) => {
    try {
      const response = await fetch(request.url, {
        method: "POST",
        headers: request.headers,
        body: request.body
      });
      const text = await response.text();
      let raw: OneBotRawResponse | null = null;

      if (text) {
        try {
          raw = JSON.parse(text) as OneBotRawResponse;
        } catch {
          return {
            ok: false,
            httpStatus: response.status,
            message: buildNonJsonOneBotMessage(text),
            rawText: text
          };
        }
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
  });
}

/** 把 OneBot 非 JSON 响应转换成用户能理解的错误文案。 */
function buildNonJsonOneBotMessage(text: string) {
  const normalized = text.trim();
  if (/upgrade required/i.test(normalized)) {
    return "当前端口返回了 WebSocket 升级提示，不是 OneBot HTTP API 端口。请填写 HTTP 服务端口，或在 OneBot/NapCat 中开启 HTTP API。";
  }

  return normalized ? `OneBot 返回了非 JSON 响应：${normalized.slice(0, 120)}` : "OneBot 返回了空响应";
}
