/// <reference types="vite/client" />

interface Window {
  chatSundial?: {
    getVersion: () => Promise<string>;
    platform: NodeJS.Platform;
    onebot: {
      action: (request: { url: string; headers: Record<string, string>; body: string }) => Promise<{
        ok: boolean;
        status?: string;
        retcode?: number;
        data?: unknown;
        message?: string;
        wording?: string;
        raw?: unknown;
      }>;
    };
    window: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
    };
  };
}
