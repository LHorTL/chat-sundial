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
- 新增或重构页面时优先按职责边界拆分：
  - `pages/`：页面容器，组合组件、hooks 和页面级 action。
  - `components/`：纯展示或小交互组件，不直接读写 `localStorage`，不直接持有跨页面业务状态。
  - `hooks/`：管理页面业务状态、外部实例引用、定时器、webview、网络连接等副作用。
  - `lib/`：纯函数、view model、校验、脚本构造、持久化适配和可测试工具。
  - `styles/`：按基础、布局、板块或组件拆分样式，避免继续堆大文件。
- 目录整理默认优先在现有结构内局部收敛；如需引入新的顶层分层或跨模块迁移，应先说明动机、影响范围和迁移计划，确认后再执行。
- 当文件名存在重复上下文时，可以用目录承载上下文、用文件名表达职责；命名调整应服务于查找和维护，不为统一而统一。
- 结构调整应尽量保持行为等价；如果需要同时调整业务逻辑、交互、样式或数据结构，应在计划或回复中单独标明。
- 对外入口和测试依赖的导出应尽量保持稳定；确需变更时，同步更新调用方、测试和说明。
- 状态分层要区分“长期配置”和“运行态”：`localStorage` 只保存可恢复的长期配置，运行中、加载中、错误提示、当前网页 URL 等临时状态不要作为真实运行态恢复。
- 持久化读写统一经过公共 storage 工具或模块自己的 storage 适配，避免在组件内散落 `localStorage` 读写。
- view model 函数负责把业务状态转换成展示文案、标签色、按钮禁用条件和可测试判断，组件内不要重复写复杂判断。
- 跨模块共享契约放在共享 lib 中，展示组件只消费契约，不定义跨模块公共类型。
- 测试文件统一放在 `tests/browser/` 下，按源码结构或业务域镜像分组；源码目录 `src/browser/**` 不再新增 `.test.ts` / `.test.tsx`。
- 测试引用源码时优先使用 `@/` alias，不要依赖测试文件相对源码目录的位置。
- 所有新增或迁移后的具名函数、React 组件、hook、工具函数都要加简短中文注释，说明职责、输入输出或关键副作用；极短内联回调不强行注释，必要时抽成具名函数。
- 用户输入的配置和外部页面/进程产生的运行态要明确区分；检测、监听和自动跳转不应把运行态数据误写回持久化配置。
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
- 拟态/新拟态元素依赖外扩阴影和高光，放入可滚动或裁剪容器时必须预留 `8-16px` 安全区；优先通过布局留白、父级 padding 或局部 `overflow: visible` 处理，不要让卡片、空状态、浮层按钮的阴影边缘贴住裁剪边界。
- 修复拟态遮挡时先检查真实 Electron renderer 的 `getBoundingClientRect()`、`overflow` 和 `box-shadow`，确认是父级裁剪还是组件自身样式，再做最小 CSS 调整。

## Git & Remote Operations

- 未经用户明确要求，不自动提交、推送、合并、强推、创建或更新远端 PR。
- 如果用户只要求“实现”“修改”“看看”，默认停在本地未提交改动；需要 Git 远端操作时先确认。
- 已经执行的 Git 远端操作如需撤回，先说明将影响的分支和提交范围，再执行最小撤回操作。

## Verification

- 修改 OneBot 逻辑、调度、监控匹配或协议请求构造后，先运行：

```bash
npm test
```

- 修改前端或 Electron 结构后，至少运行：

```bash
npm run prebuild
```

- 修改可见 UI 后，根据 dev server 输出用 Codex 内置浏览器检查真实页面效果；涉及 Electron-only 行为时连接 Electron CDP/真实 renderer 取证，不使用 Playwright 或新开普通浏览器替代。
- 需要验证完整打包时运行：

```bash
npm run build
```

- 当前本机 macOS 打包会跳过签名，这是证书环境问题，不应视为构建失败。
