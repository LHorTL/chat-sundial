# ChatSundial Architecture Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一次性完成 ChatSundial 当前架构整理，把剩余的大文件、副作用、跨模块契约和样式边界收敛到可长期维护的结构。

**Architecture:** 页面入口只做编排，业务副作用进入 hooks，纯转换进入 lib，展示组件不直接接触持久化和外部实例。QQ、文档、全局任务中心、App 壳、Electron 主进程都按职责拆分，现有交互和 Lumina 助手主题保持不变。

**Tech Stack:** Electron 31, Vite 4, React 18, TypeScript 4.9, Vitest, `@fangxinyan/lumina`.

---

## Current Evidence

- `src/browser/sections/docs/lib/documentAutomation.ts` 769 行，混合时间解析、填充规则、页面检测和注入脚本。
- `src/browser/styles/layout.css` 579 行，混合 workspace、sidebar、通用 item、TaskCenter 和浮层层级。
- `src/browser/styles/docs.css` 513 行，文档布局、配置卡片、webview、任务列表和响应式规则混在一起。
- `src/browser/sections/qq/lib/onebot.ts` 471 行，混合类型、配置归一化、消息构造、事件匹配和群列表归一化。
- `src/browser/sections/qq/QQSection.tsx` 339 行，混合 OneBot 配置、连接检测、群列表加载、倒计时调度、监控 WebSocket 和页面内容。
- `src/browser/sections/docs/pages/DocumentSubmitPage.tsx` 已降到 372 行，但仍包含文档任务 load/start/stop/update/scan 执行动作。
- `src/browser/components/TaskCenter.tsx` 232 行，类型契约、拖拽吸附副作用和展示结构还在同一个文件。

## Non-Goals

- 不改产品交互，不新增板块，不引入 Redux/Zustand/React Query。
- 不兼容旧 localStorage 任务结构之外的历史脏数据，维持当前“不恢复运行态”的策略。
- 不做视觉 redesign，只保留 Lumina 助手主题、mint 强调色和拟态风格。
- 不使用 Playwright。可见 UI 复查使用 Codex 内置浏览器或 Electron CDP。

## Target File Structure

```text
src/browser/
  App.tsx
  hooks/
    useAppNavigation.ts
    useDocumentSidebarTasks.ts
  components/
    AppSidebarItems.tsx
    TaskCenter.tsx
    TaskCenterItem.tsx
    page/
  lib/
    appStorage.ts
    globalTask.ts
    storage.ts
  sections/
    docs/
      components/
      hooks/
        useDocumentTasks.ts
        useDocumentTaskRunner.ts
        useDocumentWebviews.ts
      lib/
        documentAutomation.ts
        documentFillRules.ts
        documentInjectedScripts.ts
        documentPageDetection.ts
        documentTaskRegistration.ts
        documentTime.ts
        documentViewModel.ts
        documentWebviewRuntime.ts
      pages/
        DocumentSubmitPage.tsx
    qq/
      components/
      hooks/
        useCountdownTasks.ts
        useMonitorRules.ts
        useOneBotConfig.ts
        useOneBotGroups.ts
        useQQSidebar.tsx
      lib/
        onebot.ts
        onebotConfig.ts
        onebotEvents.ts
        onebotGroups.ts
        onebotMessages.ts
        onebotTypes.ts
        qqStorage.ts
        qqViewModel.ts
      pages/
src/main/
  icon.ts
  index.ts
  onebotIpc.ts
  webviewPolicy.ts
  window.ts
src/browser/styles/
  base.css
  common-page.css
  docs-config.css
  docs-layout.css
  docs-webview.css
  layout.css
  qq.css
  sidebar.css
  task-center.css
  workspace.css
```

## Public Contract After Refactor

```ts
// src/browser/lib/globalTask.ts
export type GlobalTaskSection = "qq" | "docs";
export type GlobalTaskKind = "qq-countdown" | "qq-monitor" | "docs-submit";
export type GlobalTaskStatus = "idle" | "waiting" | "running" | "success" | "error" | "stopped" | "disabled";

export interface GlobalTaskLog {
  time: string;
  message: string;
}

export interface GlobalTaskRegistration {
  id: string;
  section: GlobalTaskSection;
  kind: GlobalTaskKind;
  title: string;
  status: GlobalTaskStatus;
  statusLabel: string;
  primary: string;
  secondary?: string;
  meta?: string[];
  logs?: GlobalTaskLog[];
  countdownTargetMs?: number;
  updatedAt?: number;
}
```

```ts
// src/browser/sections/docs/hooks/useDocumentTaskRunner.ts
export interface DocumentTaskRunnerActions {
  loadDocument(task: DocumentSubmitTask): Promise<void>;
  reloadDocument(task: DocumentSubmitTask): Promise<void>;
  stopTask(task: DocumentSubmitTask): Promise<void>;
  startTask(task: DocumentSubmitTask): Promise<void>;
  updateRunningTask(task: DocumentSubmitTask): Promise<void>;
  scanQuestions(task: DocumentSubmitTask): Promise<void>;
  removeDocumentTask(id: string): Promise<void>;
}
```

```ts
// src/browser/sections/qq/hooks/useOneBotConfig.ts
export interface OneBotConfigState {
  config: OneBotConfig;
  hasSavedConfig: boolean;
  connectionStatus: OneBotConnectionStatus;
  lastError: string;
  saveConfig(nextConfig: OneBotConfig): void;
  testConnection(nextConfig: OneBotConfig): Promise<void>;
}
```

## Task 1: Move Global Task Contract Out Of TaskCenter

**Files:**
- Create: `src/browser/lib/globalTask.ts`
- Modify: `src/browser/components/TaskCenter.tsx`
- Modify: `src/browser/components/TaskCenterItem.tsx`
- Modify: `src/browser/components/TaskCenterViewModel.ts`
- Modify: `src/browser/sections/docs/lib/documentTaskRegistration.ts`
- Modify: `src/browser/sections/docs/hooks/useDocumentTasks.ts`
- Modify: `src/browser/sections/docs/pages/DocumentSubmitPage.tsx`
- Modify: `src/browser/sections/qq/QQSection.tsx`
- Modify: `src/browser/sections/qq/lib/qqViewModel.ts`
- Test: `npm test`

- [ ] **Step 1: Create `src/browser/lib/globalTask.ts`**

```ts
/** 定义 QQ 和文档板块都能注册到全局任务中心的通用任务契约。 */
export type GlobalTaskSection = "qq" | "docs";

/** 区分全局任务中心里的具体任务来源。 */
export type GlobalTaskKind = "qq-countdown" | "qq-monitor" | "docs-submit";

/** 统一任务中心展示和排序使用的状态枚举。 */
export type GlobalTaskStatus = "idle" | "waiting" | "running" | "success" | "error" | "stopped" | "disabled";

export interface GlobalTaskLog {
  time: string;
  message: string;
}

export interface GlobalTaskRegistration {
  id: string;
  section: GlobalTaskSection;
  kind: GlobalTaskKind;
  title: string;
  status: GlobalTaskStatus;
  statusLabel: string;
  primary: string;
  secondary?: string;
  meta?: string[];
  logs?: GlobalTaskLog[];
  countdownTargetMs?: number;
  updatedAt?: number;
}
```

- [ ] **Step 2: Replace all imports from `components/TaskCenter`**

Run:

```bash
rg -n "GlobalTask|components/TaskCenter" src/browser
```

Expected after the edit:

```text
src/browser/App.tsx imports TaskCenter from ./components/TaskCenter
all GlobalTask* imports point to ./lib/globalTask or ../../../lib/globalTask
```

- [ ] **Step 3: Remove type exports from `TaskCenter.tsx`**

`TaskCenter.tsx` should import only:

```ts
import type { GlobalTaskRegistration } from "../lib/globalTask";
```

- [ ] **Step 4: Verify dependency direction**

Run:

```bash
rg -n "from .*components/TaskCenter" src/browser/sections src/browser/lib
```

Expected: no output.

- [ ] **Step 5: Run tests**

Run:

```bash
npm test
```

Expected: all tests pass.

## Task 2: Extract TaskCenter Dock Hook

**Files:**
- Create: `src/browser/components/useTaskCenterDock.ts`
- Modify: `src/browser/components/TaskCenter.tsx`
- Modify: `src/browser/components/TaskCenterViewModel.ts`
- Test: add or extend pure tests if a TaskCenter view-model test file already exists; otherwise rely on existing render and `npm test`.

- [ ] **Step 1: Create `useTaskCenterDock.ts`**

The hook owns:

- open/peek state
- viewport tracking
- dock persistence
- drag context
- pointer handlers
- escape close

Returned shape:

```ts
export interface TaskCenterDockState {
  open: boolean;
  peek: boolean;
  dock: TaskCenterDock;
  dragPosition: TaskCenterDragPosition | null;
  viewport: { width: number; height: number };
  rootStyle: CSSProperties;
  panelStyle: CSSProperties;
  rootClassName: string;
  setPeek(nextPeek: boolean): void;
  handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>): void;
  handleButtonClick(): void;
}
```

- [ ] **Step 2: Move `handlePointerDown`, `handleButtonClick`, resize effect, escape effect and dock persistence effect into the hook**

`TaskCenter.tsx` should keep:

```tsx
const dockState = useTaskCenterDock();
const sortedTasks = useMemo(() => [...tasks].sort(compareTasks), [tasks]);
const attentionCount = sortedTasks.filter(isAttentionTask).length;
```

- [ ] **Step 3: Add `isAttentionTask` to `TaskCenterViewModel.ts`**

```ts
/** 判断任务是否需要在浮层按钮上显示提醒计数。 */
export function isAttentionTask(task: Pick<GlobalTaskRegistration, "status">) {
  return task.status === "waiting" || task.status === "running" || task.status === "error";
}
```

- [ ] **Step 4: Verify TaskCenter remains presentation-focused**

Run:

```bash
wc -l src/browser/components/TaskCenter.tsx src/browser/components/useTaskCenterDock.ts
```

Expected:

- `TaskCenter.tsx` around 100-140 lines.
- `useTaskCenterDock.ts` owns the event-heavy logic.

## Task 3: Extract App Navigation And Document Sidebar State

**Files:**
- Create: `src/browser/hooks/useAppNavigation.ts`
- Create: `src/browser/hooks/useDocumentSidebarTasks.ts`
- Modify: `src/browser/App.tsx`
- Test: `src/browser/App.test.tsx` is optional only if a stable renderer test can be written without brittle Lumina markup; otherwise verify through `npm run prebuild`.

- [ ] **Step 1: Create `useAppNavigation.ts`**

Responsibilities:

- load/save active section
- keep active QQ page stable across section switches
- handle sidebar key selection

Return shape:

```ts
export interface AppNavigationState {
  activeSection: AppSection;
  activeKey: AppPage;
  activeQQPage: QQPage;
  selectSection(section: AppSection): void;
  selectQQPage(page: QQPage): void;
  setDocsActive(): void;
}
```

- [ ] **Step 2: Create `useDocumentSidebarTasks.ts`**

Responsibilities:

- initial document sidebar task loading
- active document task id
- create request counter
- action request object
- document global task snapshots
- document sidebar selection helpers

Return shape:

```ts
export interface DocumentSidebarState {
  activeDocumentTaskId: string;
  documentCreateRequest: number;
  documentActionRequest: DocumentTaskActionRequest | null;
  documentSidebarTasks: DocumentSidebarTask[];
  documentTasks: GlobalTaskRegistration[];
  createDocumentDraft(): void;
  selectDocumentTask(id: string): void;
  requestDocumentTaskAction(taskId: string, action: DocumentTaskAction): void;
  setActiveDocumentTaskId(taskId: string): void;
  setDocumentSidebarTasks(tasks: DocumentSidebarTask[]): void;
  setDocumentTasks(tasks: GlobalTaskRegistration[]): void;
}
```

- [ ] **Step 3: Reduce `App.tsx` to shell composition**

`App.tsx` should only contain:

- theme provider
- title bar
- sidebar
- active panel rendering
- status bar
- task center

- [ ] **Step 4: Verify App file size**

Run:

```bash
wc -l src/browser/App.tsx src/browser/hooks/useAppNavigation.ts src/browser/hooks/useDocumentSidebarTasks.ts
```

Expected:

- `App.tsx` around 150 lines or less.
- Hooks contain state logic.

## Task 4: Split QQ Section Effects Into Hooks

**Files:**
- Create: `src/browser/sections/qq/hooks/useOneBotConfig.ts`
- Create: `src/browser/sections/qq/hooks/useOneBotGroups.ts`
- Create: `src/browser/sections/qq/hooks/useCountdownTasks.ts`
- Create: `src/browser/sections/qq/hooks/useMonitorRules.ts`
- Create: `src/browser/sections/qq/hooks/useQQSidebar.tsx`
- Modify: `src/browser/sections/qq/QQSection.tsx`
- Modify: `src/browser/sections/qq/lib/qqStorage.ts`
- Test: `src/browser/sections/qq/lib/onebot.test.ts`

- [ ] **Step 1: Extract `useOneBotConfig`**

Move these responsibilities out of `QQSection.tsx`:

- `config`
- `hasSavedConfig`
- `connectionStatus`
- `lastError`
- `checkConnection`
- `saveConfig`
- `testConnection`
- skip-next auto check guard

The hook must keep the current behavior: saving config should not immediately test unless `testConnection` is called.

- [ ] **Step 2: Extract `useOneBotGroups`**

Inputs:

```ts
{
  config: OneBotConfig;
  hasSavedConfig: boolean;
}
```

Outputs:

```ts
{
  groups: OneBotGroupInfo[];
  groupsLoading: boolean;
  groupsError: string;
}
```

The hook must preserve cancellation behavior so stale `get_group_list` responses do not overwrite new state.

- [ ] **Step 3: Extract `useCountdownTasks`**

Inputs:

```ts
{
  sendTarget(target: SendMessageTarget): Promise<unknown>;
}
```

Outputs:

```ts
{
  tasks: CountdownTask[];
  createTask(task: CountdownTask): void;
  removeTask(id: string): void;
  registrations: GlobalTaskRegistration[];
}
```

Countdown tasks remain runtime-only. Do not persist them unless product behavior changes later.

- [ ] **Step 4: Extract `useMonitorRules`**

Inputs:

```ts
{
  config: OneBotConfig;
  hasSavedConfig: boolean;
  sendTarget(target: SendMessageTarget): Promise<unknown>;
}
```

Outputs:

```ts
{
  rules: MonitorRule[];
  eventStatus: "idle" | "connected" | "disconnected" | "error";
  createRule(rule: MonitorRule): void;
  removeRule(id: string): void;
  toggleRule(id: string, enabled: boolean): void;
  registrations: GlobalTaskRegistration[];
}
```

The WebSocket listener must close on cleanup and must still use current rules through a ref.

- [ ] **Step 5: Extract `useQQSidebar`**

Inputs:

```ts
{
  tasksCount: number;
  rulesCount: number;
  connectionStatus: OneBotConnectionStatus;
}
```

Output: Lumina sidebar item array for QQ pages.

- [ ] **Step 6: Reduce `QQSection.tsx`**

`QQSection.tsx` should become a composition hook:

- call the four hooks
- build `sendTarget`
- return sidebar items, global task registrations, content and status bar fields

Expected size: around 120-180 lines.

- [ ] **Step 7: Verify QQ behavior**

Run:

```bash
npm test -- src/browser/sections/qq/lib/onebot.test.ts
npm run prebuild
```

Expected: both pass.

## Task 5: Split OneBot Pure Library

**Files:**
- Create: `src/browser/sections/qq/lib/onebotTypes.ts`
- Create: `src/browser/sections/qq/lib/onebotConfig.ts`
- Create: `src/browser/sections/qq/lib/onebotMessages.ts`
- Create: `src/browser/sections/qq/lib/onebotEvents.ts`
- Create: `src/browser/sections/qq/lib/onebotGroups.ts`
- Modify: `src/browser/sections/qq/lib/onebot.ts`
- Modify: `src/browser/sections/qq/lib/onebot.test.ts`

- [ ] **Step 1: Move types to `onebotTypes.ts`**

Move all exported types and interfaces from `onebot.ts` without changing names.

- [ ] **Step 2: Move config helpers to `onebotConfig.ts`**

Move:

- `DEFAULT_ONEBOT_CONFIG`
- `normalizeOneBotConfig`
- `normalizeOneBotLocalPort`
- `buildOneBotActionRequest`
- `buildOneBotWebSocketActionPayload`
- `buildOneBotWebSocketUrl`
- private URL normalization helpers

- [ ] **Step 3: Move message helpers to `onebotMessages.ts`**

Move:

- `buildSendMessageAction`
- `parseNumericId`

- [ ] **Step 4: Move event helpers to `onebotEvents.ts`**

Move:

- `isCountdownDue`
- `matchMonitorEvent`
- `getEventMessageText`
- `safeRegexTest`

- [ ] **Step 5: Move group helpers to `onebotGroups.ts`**

Move:

- `parseOneBotGroupList`
- group numeric normalization helper

- [ ] **Step 6: Keep `onebot.ts` as a facade**

`onebot.ts` should only re-export:

```ts
export * from "./onebotTypes";
export * from "./onebotConfig";
export * from "./onebotMessages";
export * from "./onebotEvents";
export * from "./onebotGroups";
```

- [ ] **Step 7: Run OneBot tests**

Run:

```bash
npm test -- src/browser/sections/qq/lib/onebot.test.ts
```

Expected: all OneBot helper tests pass unchanged or with import-only updates.

## Task 6: Extract Document Task Runner Hook

**Files:**
- Create: `src/browser/sections/docs/hooks/useDocumentTaskRunner.ts`
- Modify: `src/browser/sections/docs/pages/DocumentSubmitPage.tsx`
- Modify: `src/browser/sections/docs/hooks/useDocumentTasks.ts`
- Modify: `src/browser/sections/docs/hooks/useDocumentWebviews.ts`
- Test: `src/browser/sections/docs/pages/DocumentSubmitPage.test.tsx`
- Test: `src/browser/sections/docs/lib/documentAutomation.test.ts`

- [ ] **Step 1: Move runner actions from `DocumentSubmitPage.tsx`**

Move these functions into `useDocumentTaskRunner`:

- `applyScriptResult`
- `ensureDocumentFillPage`
- `buildTaskRunRequest`
- `removeDocumentTask`
- `loadDocument`
- `reloadDocument`
- `stopTask`
- `startTask`
- `updateRunningTask`
- `scanQuestions`

- [ ] **Step 2: Pass dependencies into the hook**

Input shape:

```ts
interface UseDocumentTaskRunnerOptions {
  canUseElectronView: boolean;
  updateTaskState: (id: string, updater: (task: DocumentSubmitTask) => DocumentSubmitTask) => void;
  patchTask: (id: string, patch: Partial<DocumentSubmitTask>) => void;
  appendLog: (id: string, message: string) => void;
  patchDocumentPageState: (id: string, patch: Partial<DocumentSubmitTask>) => void;
  saveTaskSnapshot: (task: DocumentSubmitTask) => DocumentSubmitTask;
  removeTask: (id: string) => Promise<void>;
  deleteWebviewRef: (taskId: string) => void;
  getTaskWebview: (taskId: string) => WebviewTagElement;
  waitForTaskWebview: (taskId: string) => Promise<WebviewTagElement>;
  loadWebviewUrl: (taskId: string, url: string) => Promise<{ ok: boolean; message?: string }>;
  markDocumentPageState: (taskId: string, fallbackUrl?: string, retry?: boolean) => Promise<DocumentPageCheckResult>;
}
```

- [ ] **Step 3: Keep `DocumentSubmitPage.tsx` as orchestration only**

After the move, the page should:

- call `useDocumentTasks`
- call `useDocumentWebviews`
- call `useDocumentTaskRunner`
- process `actionRequest`
- render `DocumentTaskConfigCard` and `DocumentPreviewPanel`

Expected size: around 170-230 lines.

- [ ] **Step 4: Preserve action request behavior**

The `actionRequest` effect must still handle:

```ts
"start" | "update" | "reload" | "reset" | "duplicate" | "openDevTools" | "stop" | "remove"
```

No action should run twice for the same nonce.

- [ ] **Step 5: Run document tests**

Run:

```bash
npm test -- src/browser/sections/docs/pages/DocumentSubmitPage.test.tsx src/browser/sections/docs/lib/documentAutomation.test.ts
```

Expected: all tests pass.

## Task 7: Split Document Automation Pure Modules

**Files:**
- Create: `src/browser/sections/docs/lib/documentTime.ts`
- Create: `src/browser/sections/docs/lib/documentFillRules.ts`
- Create: `src/browser/sections/docs/lib/documentPageDetection.ts`
- Create: `src/browser/sections/docs/lib/documentInjectedScripts.ts`
- Modify: `src/browser/sections/docs/lib/documentAutomation.ts`
- Modify: `src/browser/sections/docs/lib/documentAutomation.test.ts`

- [ ] **Step 1: Move time helpers to `documentTime.ts`**

Move:

- `getDateInputValue`
- `getTimeInputValue`
- `parseDocumentTargetTime`
- `validateDocumentRunStartTime`
- private `pad2`

- [ ] **Step 2: Move fill rule helpers to `documentFillRules.ts`**

Move:

- `DocumentQuestionType`
- `DocumentFillRuleDraft`
- `DocumentFillRule`
- `normalizeDocumentFillRules`
- `shouldToggleChoiceOption`
- value parsing helpers

- [ ] **Step 3: Move page detection to `documentPageDetection.ts`**

Move:

- `DocumentPageKind`
- `DocumentPageSnapshot`
- `DocumentPageCheckResult`
- `DOCUMENT_PAGE_MONITOR_EVENT`
- `resolveDocumentPageState`

- [ ] **Step 4: Move injected script sources to `documentInjectedScripts.ts`**

Move:

- `buildDocumentRunScript`
- `buildDocumentUpdateScript`
- `buildDocumentPageCheckScript`
- `buildDocumentPageMonitorScript`
- `buildDocumentScanScript`
- all `*ScriptSource` functions

- [ ] **Step 5: Keep `documentAutomation.ts` as a facade and request builder**

`documentAutomation.ts` should export the public API and keep only:

- `DocumentSubmitMode`
- `DocumentRunConfig`
- `DocumentRunRequest`
- `DocumentRunLog`
- `DocumentRunResult`
- `ScannedDocumentQuestion`
- `buildDocumentRunRequest`
- re-exports from split modules

- [ ] **Step 6: Split tests by concern**

Create or update:

- `documentTime.test.ts`
- `documentFillRules.test.ts`
- `documentPageDetection.test.ts`
- `documentInjectedScripts.test.ts`

Keep `documentAutomation.test.ts` only for `buildDocumentRunRequest` integration assertions.

- [ ] **Step 7: Run document automation tests**

Run:

```bash
npm test -- src/browser/sections/docs/lib
```

Expected: all document lib tests pass.

## Task 8: Split Document View Model If It Stays Over 250 Lines

**Files:**
- Create if needed: `src/browser/sections/docs/lib/documentStatusViewModel.ts`
- Create if needed: `src/browser/sections/docs/lib/documentUrlViewModel.ts`
- Modify: `src/browser/sections/docs/lib/documentViewModel.ts`
- Test: existing document tests.

- [ ] **Step 1: Inspect `documentViewModel.ts` after Task 7**

Run:

```bash
wc -l src/browser/sections/docs/lib/documentViewModel.ts
```

If it is over 250 lines, continue this task. If it is 250 lines or less, record in the PR summary that no split was needed.

- [ ] **Step 2: Move status/tag/message helpers**

Move status-only helpers to `documentStatusViewModel.ts`, including:

- status label functions
- status tone functions
- blocking notice builder
- lock checks

- [ ] **Step 3: Move URL/page loading helpers**

Move URL-only helpers to `documentUrlViewModel.ts`, including:

- Tencent Docs URL normalization
- configured document load checks
- pending load expiry checks
- runtime URL checks

- [ ] **Step 4: Keep facade exports stable**

`documentViewModel.ts` may re-export split modules so existing imports can be adjusted gradually in this same refactor.

## Task 9: Split CSS By Ownership

**Files:**
- Create: `src/browser/styles/workspace.css`
- Create: `src/browser/styles/sidebar.css`
- Create: `src/browser/styles/common-page.css`
- Create: `src/browser/styles/task-center.css`
- Create: `src/browser/styles/docs-layout.css`
- Create: `src/browser/styles/docs-config.css`
- Create: `src/browser/styles/docs-webview.css`
- Modify: `src/browser/styles/layout.css`
- Modify: `src/browser/styles/docs.css`
- Modify: `src/browser/main.tsx`
- Test: Electron/Codex browser visual inspection.

- [ ] **Step 1: Split workspace styles**

Move from `layout.css`:

- `.app-shell-main`
- `.workspace`
- `.workspace-stack`
- `.workspace-panel`
- `.workspace-panel--qq`
- `.workspace-panel--docs`
- `.workspace-panel.is-active`
- `.workspace-panel.is-hidden`

into `workspace.css`.

- [ ] **Step 2: Split sidebar styles**

Move from `layout.css`:

- `.nav-label`
- `.sidebar-*`
- `.section-switch`

into `sidebar.css`.

- [ ] **Step 3: Split common page styles**

Move from `layout.css`:

- `.page`
- `.page-heading`
- `.page-grid`
- `.form-grid`
- `.field`
- `.action-row`
- `.item-*`
- `.empty-text`
- floating panel z-index rules

into `common-page.css`.

- [ ] **Step 4: Split TaskCenter styles**

Move all `.task-center-*` and `.task-kind-icon*` rules into `task-center.css`.

- [ ] **Step 5: Split document styles**

Move from `docs.css`:

- layout shell into `docs-layout.css`
- config card and command bar into `docs-config.css`
- preview panel and webview into `docs-webview.css`

`docs.css` should either be deleted or only import/comment as a compatibility file if Vite CSS import ordering requires it.

- [ ] **Step 6: Update `main.tsx` import order**

Use this order:

```ts
import "./styles/base.css";
import "./styles/workspace.css";
import "./styles/common-page.css";
import "./styles/sidebar.css";
import "./styles/task-center.css";
import "./styles/qq.css";
import "./styles/docs-layout.css";
import "./styles/docs-config.css";
import "./styles/docs-webview.css";
```

- [ ] **Step 7: Preserve拟态安全区**

After the split, verify `.workspace-panel--qq` still contains:

```css
--neumorphic-safe-space: 12px;
width: calc(100% + var(--neumorphic-safe-space) * 2);
height: calc(100% + var(--neumorphic-safe-space) * 2);
margin: calc(var(--neumorphic-safe-space) * -1);
padding: var(--neumorphic-safe-space);
```

- [ ] **Step 8: Verify no deleted CSS import remains**

Run:

```bash
rg -n "index\\.css|docs\\.css|layout\\.css" src/browser
```

Expected: only active imports that still exist.

## Task 10: Split Main Process Responsibilities

**Files:**
- Create: `src/main/icon.ts`
- Create: `src/main/window.ts`
- Create: `src/main/onebotIpc.ts`
- Create: `src/main/webviewPolicy.ts`
- Modify: `src/main/index.ts`
- Test: `npm run prebuild`

- [ ] **Step 1: Move icon helpers to `icon.ts`**

Move:

- `getWindowIconPath`
- `configureDockIcon`

- [ ] **Step 2: Move webview policy to `webviewPolicy.ts`**

Move:

- `configureWebviewPolicy`

The function should keep these guarantees:

- deny `window.open`
- open normal external links with `shell.openExternal`
- strip webview preload
- keep node integration off
- keep context isolation on
- keep webview background throttling off

- [ ] **Step 3: Move OneBot IPC to `onebotIpc.ts`**

Move:

- `ipcMain.handle("onebot:action", ...)`
- `buildNonJsonOneBotMessage`

Export:

```ts
export function registerOneBotIpc() {
  ipcMain.handle("onebot:action", async (_event, request) => {
    // existing implementation
  });
}
```

- [ ] **Step 4: Move BrowserWindow creation to `window.ts`**

Move:

- `createWindow`
- window options
- dev server URL vs packaged file loading

Export:

```ts
export function createMainWindow(): BrowserWindow {
  // existing implementation
}
```

- [ ] **Step 5: Keep `index.ts` as lifecycle composition**

`index.ts` should keep:

- app lifecycle
- `mainWindow` variable
- version IPC
- window control IPC
- calls to `registerOneBotIpc`, `configureDockIcon`, `createMainWindow`

Expected size: around 80-120 lines.

## Task 11: Add Architecture Regression Tests

**Files:**
- Create: `src/browser/components/TaskCenterViewModel.test.ts`
- Create: `src/browser/sections/docs/lib/documentTime.test.ts`
- Create: `src/browser/sections/docs/lib/documentFillRules.test.ts`
- Create: `src/browser/sections/docs/lib/documentPageDetection.test.ts`
- Modify: existing tests as imports move.

- [ ] **Step 1: Test TaskCenter docking**

Test cases:

- left/right side selection
- y coordinate clamps between top and bottom guards
- panel style stays inside viewport
- attention count helper identifies waiting/running/error only

- [ ] **Step 2: Test document time helpers**

Test cases:

- valid date/time parsing
- invalid date rejected
- invalid time rejected
- past scheduled task rejected

- [ ] **Step 3: Test document fill helpers**

Test cases:

- text/radio/checkbox normalization
- disabled rule filtered out
- checkbox JSON and comma syntax
- negative option index rejected
- selected checkbox toggle logic

- [ ] **Step 4: Test document page detection**

Test cases:

- actual fill DOM wins even if hash is `#/result`
- result page asks user to switch to filling
- submitted fill-detail page without submit button is not accepted
- non Tencent form page is rejected

- [ ] **Step 5: Run all tests**

Run:

```bash
npm test
```

Expected: all tests pass.

## Task 12: Update Project Rules

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Add architecture guardrails**

Ensure `AGENTS.md` includes:

- page files should stay orchestration-focused
- feature hooks own side effects
- view model functions own display decisions
- global task contracts live outside display components
- long CSS files should be split by ownership
- Electron CDP or Codex browser is required for visible UI verification
-拟态 elements require safe space in clipping containers

- [ ] **Step 2: Add file-size review rule**

Add:

```md
- 单个页面文件接近 500 行时应优先拆分；单个纯工具文件接近 500 行时应拆成按职责命名的纯函数模块；单个 CSS 文件接近 500 行时应按组件或板块拆分。
```

- [ ] **Step 3: Verify no conflict with existing rules**

Run:

```bash
sed -n '1,220p' AGENTS.md
```

Expected: rules are consistent with Lumina-first frontend guidance and Electron verification guidance.

## Task 13: Full Verification And Runtime UI Review

**Files:**
- No planned source edits unless verification exposes defects.

- [ ] **Step 1: Run unit tests**

Run:

```bash
npm test
```

Expected: all test files pass.

- [ ] **Step 2: Run Electron/browser prebuild**

Run:

```bash
npm run prebuild
```

Expected: TypeScript and both Vite builds pass.

- [ ] **Step 3: Check whitespace**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 4: Verify current file sizes**

Run:

```bash
find src/browser src/main -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) | sort | xargs wc -l | sort -nr | head -35
```

Expected:

- no page file over 500 lines
- no CSS file over 500 lines
- `documentAutomation.ts` no longer over 500 lines
- `onebot.ts` becomes a small facade

- [ ] **Step 5: Verify Electron UI without Playwright**

Use Codex built-in browser if viewing Vite is enough. For Electron-only behavior, connect to the running Electron CDP port and inspect:

- QQ countdown page card shadows are not clipped.
- QQ, 文档 section switching does not destroy document webviews.
- 文档 task with URL opens automatically after reload.
- TaskCenter still drags, docks and peeks from edge.
- Date/Time picker overlays stay above webview and panels.

Suggested CDP evidence command:

```bash
lsof -nP -iTCP -sTCP:LISTEN | rg "Electron|ChatSundial|923|922|517"
curl -s http://127.0.0.1:9233/json
```

Then evaluate `getBoundingClientRect()`, `overflow`, `boxShadow` and webview count in the ChatSundial target.

## Completion Checklist

- [ ] `GlobalTaskRegistration` no longer lives in `TaskCenter.tsx`.
- [ ] `TaskCenter.tsx` is display-focused; dragging/docking is in a hook.
- [ ] `App.tsx` is shell-focused; navigation/sidebar state is in hooks.
- [ ] `QQSection.tsx` no longer owns all OneBot side effects directly.
- [ ] `onebot.ts` is split by config/message/event/group/type responsibility.
- [ ] `DocumentSubmitPage.tsx` no longer owns runner action internals.
- [ ] `documentAutomation.ts` is split by time/fill/page/injected-script responsibility.
- [ ] CSS is split by workspace/sidebar/common/task-center/docs ownership.
- [ ] Main process is split by icon/window/webview-policy/OneBot IPC.
- [ ] All新增或迁移后的具名函数、React 组件、hook、工具函数有简短中文注释。
- [ ] `npm test` passes.
- [ ] `npm run prebuild` passes.
- [ ] `git diff --check` passes.
- [ ] Electron/Codex visible UI review confirms no拟态裁剪回归 and no webview lifecycle regression.

## Self-Review

- Spec coverage: this plan covers the requested one-shot architecture cleanup for QQ, Docs, App, TaskCenter, CSS, storage boundaries and Electron main process.
- Placeholder scan: 未发现占位标记或空泛执行项。
- Type consistency: shared task contract is defined once in `src/browser/lib/globalTask.ts`; docs and qq consume it through view model or registration helpers.
- Scope control: countdown task persistence is explicitly kept runtime-only because changing it would alter product behavior; the rule is documented instead of silently changing behavior.
