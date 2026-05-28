/** 获取当前可用的 localStorage，SSR/测试环境不可用时返回空值。 */
function getLocalStorage(): Storage | Pick<Storage, "getItem" | "setItem" | "removeItem"> | null {
  if (typeof localStorage !== "undefined") {
    return localStorage;
  }

  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }

  return null;
}

/** 从 localStorage 读取 JSON，读取失败或解析失败时返回调用方提供的兜底值。 */
export function readJson<T>(key: string, fallback: T): T {
  const storage = getLocalStorage();
  if (!storage) {
    return fallback;
  }

  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

/** 把可序列化数据写入 localStorage，写入失败时吞掉异常避免阻塞主流程。 */
export function writeJson(key: string, value: unknown) {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // 本地持久化只是增强能力，失败时不应打断用户正在进行的任务。
  }
}

/** 删除 localStorage 指定键，删除失败时保持静默。 */
export function removeKey(key: string) {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(key);
  } catch {
    // 清理缓存失败不影响当前运行态。
  }
}
