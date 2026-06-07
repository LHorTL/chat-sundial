/// <reference types="vite/client" />

interface Window {
  chatSundial?: {
    getVersion: () => Promise<string>;
    platform: NodeJS.Platform;
    onebot: {
      action: (request: { url: string; headers: Record<string, string>; body: string }) => Promise<{
        ok: boolean;
        httpStatus?: number;
        status?: string;
        retcode?: number;
        data?: unknown;
        message?: string;
        wording?: string;
        raw?: unknown;
        rawText?: string;
      }>;
    };
    snowluma: {
      status: () => Promise<import("./sections/qq/lib/snowluma").SnowLumaStatus>;
      logs: () => Promise<import("./sections/qq/lib/snowluma").SnowLumaLogSnapshot>;
      installLatest: () => Promise<import("./sections/qq/lib/snowluma").SnowLumaActionResult>;
      installBundled: () => Promise<import("./sections/qq/lib/snowluma").SnowLumaActionResult>;
      uninstall: () => Promise<import("./sections/qq/lib/snowluma").SnowLumaActionResult>;
      start: (mode?: import("./sections/qq/lib/snowluma").SnowLumaStartMode) => Promise<import("./sections/qq/lib/snowluma").SnowLumaActionResult>;
      stop: () => Promise<import("./sections/qq/lib/snowluma").SnowLumaActionResult>;
      restart: () => Promise<import("./sections/qq/lib/snowluma").SnowLumaActionResult>;
      listAccounts: () => Promise<import("./sections/qq/lib/snowluma").SnowLumaAccountsResult>;
      selectAccount: (uin: string) => Promise<import("./sections/qq/lib/snowluma").SnowLumaSelectAccountResult>;
      openInstallFolder: () => Promise<import("./sections/qq/lib/snowluma").SnowLumaActionResult>;
      openDownloadUrl: () => Promise<import("./sections/qq/lib/snowluma").SnowLumaActionResult>;
      openQqDownloadUrl: () => Promise<import("./sections/qq/lib/snowluma").SnowLumaActionResult>;
      openWebUi: () => Promise<import("./sections/qq/lib/snowluma").SnowLumaActionResult>;
    };
    window: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
    };
  };
}

type WebviewEvent = Event & {
  url?: string;
  title?: string;
  message?: string;
  errorCode?: number;
  errorDescription?: string;
  validatedURL?: string;
};

type WebviewTagElement = HTMLElement & {
  src: string;
  loadURL: (url: string) => Promise<void> | void;
  reload: () => void;
  stop: () => void;
  executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>;
  openDevTools: () => void;
  getURL: () => string;
};

declare namespace JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<React.HTMLAttributes<WebviewTagElement>, WebviewTagElement> & {
      src?: string;
      partition?: string;
      webpreferences?: string;
      allowpopups?: string;
    };
  }
}
