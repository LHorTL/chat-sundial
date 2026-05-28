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
