import {
  DOCUMENT_PAGE_MONITOR_EVENT,
  resolveDocumentPageState,
  type DocumentPageCheckResult,
  type DocumentPageSnapshot
} from "./documentPageDetection";

/** 序列化页面状态检测脚本，用于识别填写页、结果页和加载态。 */
export function buildDocumentPageCheckScript(): string {
  return `(${documentPageCheckScriptSource})(${documentPageSnapshotSource}, ${resolveDocumentPageState})`;
}

/** 序列化页内路由和内容变化监听脚本。 */
export function buildDocumentPageMonitorScript(): string {
  return `(${documentPageMonitorScriptSource})(${JSON.stringify(DOCUMENT_PAGE_MONITOR_EVENT)})`;
}

/** 采集腾讯文档页面的路由、题目数量和提交按钮快照。 */
function documentPageSnapshotSource(): DocumentPageSnapshot {
  const questionCount = document.querySelectorAll(".question-main-content").length;
  const submitButton = document.querySelector(".question-commit button") as HTMLElement | null;
  const bodyTextSample = (document.body?.textContent || "").trim().replace(/\s+/g, " ").slice(0, 180);

  return {
    href: window.location.href,
    hash: window.location.hash,
    pathname: window.location.pathname,
    questionCount,
    hasSubmitButton: Boolean(submitButton),
    bodyTextSample
  };
}

/** 在页面内组合快照采集和状态识别，返回归一化检测结果。 */
function documentPageCheckScriptSource(
  createSnapshot: () => DocumentPageSnapshot,
  resolveState: (snapshot: DocumentPageSnapshot) => DocumentPageCheckResult
): DocumentPageCheckResult {
  return resolveState(createSnapshot());
}

/** 安装页内路由和 DOM 变化监听，并通过 console-message 通知外层。 */
function documentPageMonitorScriptSource(eventName: string): boolean {
  const monitorKey = "__chatSundialDocumentPageMonitor";
  type PageMonitor = { dispose: () => void };
  const globalScope = window as unknown as Record<string, PageMonitor | undefined>;
  globalScope[monitorKey]?.dispose();

  const cleanup: Array<() => void> = [];
  let scheduled = false;
  const emit = () => {
    if (scheduled) {
      return;
    }

    scheduled = true;
    window.setTimeout(() => {
      scheduled = false;
      console.log(`${eventName} ${Date.now()} ${window.location.href}`);
    }, 120);
  };

  const wrapHistoryMethod = (name: "pushState" | "replaceState") => {
    const original = window.history[name];
    window.history[name] = function wrappedHistoryMethod(this: History, ...args: Parameters<typeof original>) {
      const result = original.apply(this, args);
      emit();
      return result;
    } as typeof original;
    cleanup.push(() => {
      window.history[name] = original;
    });
  };

  wrapHistoryMethod("pushState");
  wrapHistoryMethod("replaceState");

  const handleRouteChange = () => emit();
  window.addEventListener("hashchange", handleRouteChange);
  window.addEventListener("popstate", handleRouteChange);
  cleanup.push(() => {
    window.removeEventListener("hashchange", handleRouteChange);
    window.removeEventListener("popstate", handleRouteChange);
  });

  const root = document.documentElement || document.body;
  if (root) {
    const observer = new MutationObserver(emit);
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true
    });
    cleanup.push(() => observer.disconnect());
  }

  globalScope[monitorKey] = {
    dispose: () => {
      cleanup.splice(0).forEach((dispose) => dispose());
    }
  };
  emit();
  return true;
}
