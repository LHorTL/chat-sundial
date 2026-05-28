import { afterEach, describe, expect, it, vi } from "vitest";
import { readJson, removeKey, writeJson } from "@/lib/storage";

/** 安装可观察的 localStorage 测试替身，便于断言读写行为。 */
function installLocalStorageStub(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const localStorageStub = {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    })
  };

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: localStorageStub
  });

  return { localStorageStub, store };
}

describe("storage helpers", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "localStorage");
    vi.restoreAllMocks();
  });

  it("returns the fallback when storage is unavailable", () => {
    expect(readJson("missing", { ok: true })).toEqual({ ok: true });
  });

  it("returns the fallback when persisted JSON is invalid", () => {
    installLocalStorageStub({ broken: "not-json" });

    expect(readJson("broken", { count: 1 })).toEqual({ count: 1 });
  });

  it("reads and writes JSON values", () => {
    const { localStorageStub, store } = installLocalStorageStub();

    writeJson("settings", { section: "docs" });

    expect(localStorageStub.setItem).toHaveBeenCalledWith("settings", JSON.stringify({ section: "docs" }));
    expect(readJson("settings", { section: "qq" })).toEqual({ section: "docs" });
    expect(store.get("settings")).toBe(JSON.stringify({ section: "docs" }));
  });

  it("removes persisted keys without throwing", () => {
    const { localStorageStub, store } = installLocalStorageStub({ settings: "{}" });

    removeKey("settings");

    expect(localStorageStub.removeItem).toHaveBeenCalledWith("settings");
    expect(store.has("settings")).toBe(false);
  });
});
