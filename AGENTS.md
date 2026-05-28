# AGENTS.md

## Communication

- 使用中文回答用户。
- 用户偏结果导向，回复应先给结论、改动点和验证结果。

## Project Structure

- 本项目是 Electron + Vite + React + TypeScript 应用。
- Electron 打包结构参考 `/Users/project/jx3-helper`。
- 主进程源码放在 `src/main`，构建产物输出到 `app/main`。
- 渲染进程源码放在 `src/browser`，构建产物输出到 `app/browser`。
- `electron-builder` 以 `app/package.json` 作为应用包入口。

## Architecture & Componentization

- 页面入口只负责页面编排、跨组件状态连接和副作用调度，不承载大段表单、列表、弹窗或脚本细节。
- 新增或重构页面时优先按以下边界拆分：
  - `pages/`：页面容器，组合组件、hooks 和页面级 action。
  - `components/`：纯展示或小交互组件，不直接读写 `localStorage`，不直接持有跨页面业务状态。
  - `hooks/`：管理页面业务状态、外部实例引用、定时器、webview、网络连接等副作用。
  - `lib/`：纯函数、view model、校验、脚本构造、持久化适配和可测试工具。
  - `styles/`：按基础、布局、板块拆分样式，避免继续堆大 `index.css`。
- 状态分层要区分“长期配置”和“运行态”：`localStorage` 只保存可恢复的长期配置，运行中、加载中、错误提示、当前网页 URL 等临时状态不要作为真实运行态恢复。
- 持久化读写统一经过 `src/browser/lib/storage.ts` 或板块自己的 storage 模块，避免在组件内散落 `localStorage` 读写。
- view model 函数负责把业务状态转换成展示文案、标签色、按钮禁用条件和可测试判断，组件内不要重复写复杂判断。
- 全局任务中心契约放在 `src/browser/lib/globalTask.ts` 这类共享 lib 中，展示组件只消费契约，不定义跨板块公共类型。
- 测试文件统一放在 `tests/browser/` 下，按 `shared`、`task-center`、`docs`、`qq` 等业务域分组；源码目录 `src/browser/**` 不再新增 `.test.ts` / `.test.tsx`。
- 测试引用源码时优先使用 `@/` alias，例如 `@/sections/docs/lib/documentAutomation`，不要依赖测试文件相对源码目录的位置。
- 所有新增或迁移后的具名函数、React 组件、hook、工具函数都要加简短中文注释，说明职责、输入输出或关键副作用；极短内联回调不强行注释，必要时抽成具名函数。
- 文档板块的腾讯文档地址属于用户配置，webview 实际跳转地址属于运行态；页面检测、路由监听和自动跳转不应把运行态 URL 写回持久化配置。
- 单个页面文件接近 500 行时应优先拆分；单个纯工具文件接近 500 行时应拆成按职责命名的纯函数模块；单个 CSS 文件接近 500 行时应按组件或板块拆分。

## Frontend Rules

- 前端基础组件优先使用 `@fangxinyan/lumina`。
- 渲染入口必须引入 Lumina 全局样式：

```tsx
import "@fangxinyan/lumina/styles";
```

- 默认主题使用 Lumina 助手主题，强调色使用 mint：

```tsx
<ThemeProvider
  mode="assistant"
  accent="mint"
  themes={{ assistant: THEME_PANEL_DEFAULT_THEME_PRESETS.assistant }}
>
```

- 不要自行添加渐变背景、装饰光斑或大面积自定义背景色，除非用户明确要求。
- UI 应保持 Electron 桌面应用风格，优先使用 `AppShell`、`TitleBar`、`Sidebar`、`StatusBar` 等 Lumina 组件。
- 拟态/新拟态元素依赖外扩阴影和高光，放入可滚动或裁剪容器时必须预留 `8-16px` 安全区，优先在父级设置 padding + 负 margin 或 `overflow: visible`；不要让卡片、空状态、浮层按钮的阴影边缘贴住滚动容器裁剪边界。
- 修复拟态遮挡时先检查真实 Electron renderer 的 `getBoundingClientRect()`、`overflow` 和 `box-shadow`，确认是父级裁剪还是组件自身样式，再做最小 CSS 调整。

## Verification

- 修改 OneBot 逻辑、调度、监控匹配或协议请求构造后，先运行：

```bash
npm test
```

- 修改前端或 Electron 结构后，至少运行：

```bash
npm run prebuild
```

- 修改可见 UI 后，用 Codex 内置浏览器检查 `http://localhost:5174/` 的页面效果；涉及 Electron-only 行为时连接 Electron CDP/真实 renderer 取证，不使用 Playwright 或新开普通浏览器替代。
- 需要验证完整打包时运行：

```bash
npm run build
```

- 当前本机 macOS 打包会跳过签名，这是证书环境问题，不应视为构建失败。
