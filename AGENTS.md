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

## Verification

- 修改 OneBot 逻辑、调度、监控匹配或协议请求构造后，先运行：

```bash
npm test
```

- 修改前端或 Electron 结构后，至少运行：

```bash
npm run prebuild
```

- 修改可见 UI 后，用浏览器检查 `http://localhost:5174/` 的真实页面效果。
- 需要验证完整打包时运行：

```bash
npm run build
```

- 当前本机 macOS 打包会跳过签名，这是证书环境问题，不应视为构建失败。
