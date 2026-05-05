# Windows Startup Incident Record (2026-02-28)

- Document intent: standalone incident record for startup failure investigation context handoff.
- Why not reuse existing docs: `iteration-log.md` is chronological and mixed-topic; this incident needs a single, focused source for retries and judgment corrections.
- Relation to existing docs: supplements `iteration-log.md`; does not replace AGENTS/spec truth files.

## 2026-02-28 Windows Startup Incident Full Record (All Attempts + Judgments)
- 任务: 汇总本轮“Windows 客户端无法稳定启动（白屏/黑屏）”的全部尝试、阶段性判断、修正判断。
- 状态: In Progress (root cause not closed)

## Scope
- 目标: 分清是 Tauri 安装/环境问题、项目配置问题、还是项目代码问题。
- 结论标准: 以真实窗口表现 + `native-boot-events.ndjson` 事件链为准，不以单次成功或进程存活代替。

## Baseline Facts (Confirmed)
1. 官方最小样本可正常拉起窗口并渲染。
2. 本项目在部分会话下可正常渲染；在部分会话下白屏/黑屏。
3. 失败会话典型事件链：`tauri_setup` -> `tauri_window_focused`，缺失 `tauri_page_load_started`/`tauri_page_load`/`boot_start`/`app_ready`。
4. 成功会话存在完整事件链：`tauri_page_load_started` -> `tauri_page_load` -> `boot_start` -> `react_render_committed` -> `app_ready`。

## Timeline of Attempts and Judgments

### A. 仅基于 2026-02-28 交接文档的静态判断
- 尝试: 读取 `20260228-0724-windows-black-white-screen-investigation.md`，不做新复现。
- 阶段判断: 卡点在 WebView 页面导航前（前端尚未执行）。
- 结果: 与后续多次失败事件链一致（有效）。

### B. 三层基础排除（环境 / 项目 / 脚本）
- 尝试: 创建并运行官方 Tauri demo；运行项目最小命令；运行 simple 脚本。
- 阶段判断: 环境链路不是“完全损坏”；问题落在项目级链路。
- 结果: 有效，但“项目级链路”仍过宽。

### C. 引入 smoke 模式（静态页）
- 尝试: 在 `src/main.tsx` 增加 `VITE_STARTUP_SMOKE=1`，绕过 App 模块与样式。
- 阶段判断: 若 smoke 可见，可排除 Tauri/WebView 完全不可用。
- 结果: smoke 可见（有效）；但后续出现“窗口被 smoke 进程接管”的混淆。
- 修正: smoke 仅用于对照，不得与日常会话并存。

### D. simple 脚本也白屏（关键反证）
- 尝试: 使用最简 `windows:tauri:simple:*` 仍复现白屏。
- 阶段判断: 不只是 native 主脚本复杂性问题。
- 结果: 有效，推动将关注点转向共同路径（窗口配置 + devUrl 导航）。

### E. 外部 URL 强排除
- 尝试: 临时将 `devUrl` 指向 `https://example.com`，跳过本地 Vite。
- 观察: 窗口显示 Example Domain，事件有 `tauri_page_load_started/tauri_page_load`。
- 阶段判断: Tauri 壳层 / WebView2 不是“完全不可导航”。
- 结果: 有效，问题收敛到本地 `devUrl` 路径或其运行态一致性。

### F. 本地静态服务强排除 (`127.0.0.1:4600`)
- 尝试: 引入本地 `dev-static-server`（无 Vite/App），保持 `devUrl=http://127.0.0.1:4600`。
- 观察: 可显示 `Foliole Local Static Probe`。
- 阶段判断: loopback 本地访问能力存在，不是“127.0.0.1 完全不可用”。
- 结果: 有效。

### G. Vite + 最小 React 探针
- 尝试: `VITE_STARTUP_MIN_REACT=1`，仅保留 Vite + React，不加载 App 模块与样式。
- 初始观察: 用户仍见白屏。
- 深入核对后发现: 当时 4600 实际被旧静态服务占用，且 Windows mirror 中 `tauri.conf` 一度滞后，导致测试路径不一致。
- 修正后观察: 资源检查通过（`/`, `@vite/client`, `/src/main.tsx` 均 200）；事件出现 `startup_min_react_mode_enabled`/`app_ready`。
- 阶段判断: 白屏并非稳定由 App 模块引起；运行态污染可伪造“白屏”。
- 结果: 部分有效（揭示污染问题），但未消除核心间歇故障。

### H. 运行态污染修复（多实例 + 端口）
- 尝试: 修改 `run-windows-tauri-simple.ps1`：
  - `start` 防重入（已有 app/launcher 时跳过）
  - 清理工作目录相关的 4600 监听
- 结果: 重复 `start` 不再叠加实例（验证通过）。
- 阶段判断: 能减少“假白屏/抢焦点”，但不是根因闭环。

### I. 同步修复到 `run-windows-native-dev.ps1`
- 尝试: 同步加入防重入/端口清理逻辑，恢复主链路测试。
- 观察: 仍出现 `BOOT_MARKER_TIMEOUT`，失败会话事件仍止于 `tauri_setup`/`tauri_window_focused`。
- 修正判断: 先前“主要问题已解决”结论被推翻；核心故障仍在。

## Judgments That Were Corrected (Explicit)
1. 被推翻: “仅靠脚本防重入即可解决白屏”。
2. 被推翻: “问题主要是 App 代码层导致”。
3. 保留: “核心失败会话卡在 page_load 前，前端未执行”。
4. 保留: “运行态污染（多实例/端口占用/镜像配置滞后）会显著干扰判断并放大失败概率”。

## Current Best Understanding (Not Closed)
- 当前最稳健的解释是双层问题叠加：
  1) 主故障: 间歇性卡在 WebView 导航前（`tauri_setup` 后不触发 page_load）。
  2) 次故障: 启动链路污染（多实例、端口4600被旧服务占用、镜像配置滞后）导致观察噪声和误判。

## Files Touched in This Round
- `src/main.tsx`（诊断模式加回退）
- `package.json`（诊断脚本加回退）
- `src-tauri/tauri.conf.json`（临时对照改动与回退）
- `scripts/windows/run-windows-tauri-simple.ps1`（防重入 + 4600 清理）
- `scripts/windows/run-windows-native-dev.ps1`（防重入 + 4600 清理）
- `scripts/windows/dev-static-server.cjs`（对照脚本，后已删除）

## Verification Snapshots
- 通过: `npm run typecheck`
- 通过: `windows:tauri:simple` 重复 `start` 不再叠加实例
- 未闭环: `windows:dev:native` 仍可复现 `BOOT_MARKER_TIMEOUT`

## Current Risk Statement
- 在未彻底修复“page_load 前卡住”的根因前，白屏/黑屏仍可能复发；
- 任何“单次成功”都不能视为关闭问题。

## 2026-02-28 Dedicated Summary Record: All Attempts and Judgments
- 类型: 独立汇总条目（单独记录）
- 目的: 供后续会话快速读取，不依赖上下文还原。

### 已做尝试（按层级）
1. 官方 demo 冒烟：可启动可渲染。
2. 项目最小链路（`tauri:dev` / simple runner）：可成功也可白屏，呈间歇性。
3. 外部 URL 对照（`https://example.com`）：稳定可渲染。
4. 本地静态页对照（`127.0.0.1:4600`，无 Vite/App）：可渲染。
5. Vite + Min React 探针：在清理污染后可渲染。
6. 启动脚本修复：simple/native 均加入防重入与 4600 清理。

### 历史判断与修正
1. 历史判断“可能是样式/业务代码直接导致白屏”：已修正为不成立（非主因）。
2. 历史判断“脚本复杂度是唯一主因”：已修正为不成立（simple 也可复现）。
3. 保留判断“失败会话卡在 page_load 前”：成立（事件多次验证）。
4. 新增判断“运行态污染会放大并伪造白屏现象”：成立（多实例/端口占用/镜像滞后已实证）。

### 当前统一结论
- 问题尚未闭环，属于“主故障 + 观测污染”叠加：
  - 主故障：间歇性卡在 `tauri_setup` 后、`tauri_page_load_started` 前。
  - 观测污染：多实例并发、4600 残留监听、Windows mirror 配置滞后。
- 现状：已压低污染项，但主故障仍可复现（`windows:dev:native` 仍出现 `BOOT_MARKER_TIMEOUT`）。

### 追踪入口
- 事件日志: `C:\dev\foliole\logs\windows\native-boot-events.ndjson`
- native 主日志: `logs/windows/windows-native-dev-*.log`
- tauri dev 日志: `logs/windows/tauri-dev-*.log`
