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
