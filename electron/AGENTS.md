# AGENTS

## Scope

- 本文件适用于：`electron/**`、`scripts/windows/**`、`playwright.desktop.config.ts`、桌面运行链路、Windows 客户端预览、Electron main / preload / IPC / sqlite 相关任务。
- 进入上述范围工作时，除根 `AGENTS.md` 外，必须同时遵守本文件。

## Desktop Host Rules

- 本项目默认桌面优先，不按纯 Web 方案优先。
- 默认客户端视角就是 Windows 客户端；未特别说明时，运行态、预览验收、数据库核对与人工补数据都以 Windows 客户端为准，不以 WSL 内临时路径或其他本机副本为准。
- 默认主数据库固定视为 `D:\X\U\Foliole\Data\foliole.db`；在 WSL 内对应路径为 `/mnt/d/X/U/Foliole/Data/foliole.db`。未获用户明确批准前，不得自行改查其他数据库路径。
- 系统能力优先经 Electron main process 暴露，再由 renderer 通过 bridge 调用；业务层不得散落 `ipcRenderer` 调用。
- 文件路径、数据库路径、日志路径等统一由 Electron main process 解析；前端禁止拼平台绝对路径。
- 持久化主路径统一走 Electron main process 与 sqlite；`localStorage` 仅允许用于可丢失 UI 偏好且必须可审计。
- 桌面窗口已可见但 bridge-backed controls 失效时，默认优先排查 preload / bridge 链路，不得先草率归因为 renderer 未启动。

## Read Before Editing

- 任务涉及 Electron 信任边界、preload、IPC、bridge 时，先读 `.lab/specs/desktop/electron/runtime-trust.md`。
- 任务涉及 Windows 预览、桌面启动、热重启、镜像同步或桌面验收时，先读 `.lab/specs/desktop/electron/windows-dev-loop.md`。
- 任务涉及 workspace 桌面表面或桌面 UI 验收时，按需补读 `.lab/specs/desktop/workspace/**` 对应条目。

## Implementation Rules

- `electron/main.ts`、`electron/preload.cjs`、`electron/ipc/**`、`electron/database/**` 只做桌面宿主职责；禁止把桌面宿主规则回灌进 `src/features/**`。
- 任何新增 renderer 可见能力，必须先定义或复用 bridge / IPC contract，再接业务消费；禁止先在 renderer 写假直连调用。
- 涉及 preload、`contextBridge`、`ipcRenderer`、`window.electronAPI` 的改动，必须先核对 Electron 官方 `sandbox` / `contextIsolation` 边界。
- preload 改动必须带一条“sandbox 受限 require 环境下 bridge 仍可暴露”的自动化回归测试。
- bridge payload、IPC 参数与返回值的结构变更，必须同步补测试；不得只改 happy path。
- 数据库存储、备份、恢复、同步与设备身份相关改动，默认按永久态处理，不得只修页面即时表现。

## Desktop Startup Troubleshooting

- 客户端启动问题，优先排查日志，没有日志则完善日志功能。
- 判断 Windows Electron runtime 是否可信时，必须以 main path、ready marker、runtime pid、boot session 与 bridge availability 的同轮校验为准；不得用“窗口可见”或“进程存在”替代可信判定。

## Validation

- 桌面相关改动默认先执行与本次改动直接相关的最小验证，并在汇报前执行 `npm run windows:preview`；只有当改动触及桌面根链路、桌面多子系统联动、共享层 / 依赖、或你无法用相关验证证明影响已被覆盖时，才升级为 `npm run quality:desktop`、`npm run quality:shared` 或 `npm run quality:full`。
- 只要改动触及 `electron/**`、`scripts/windows/**`、桌面 bridge、桌面数据库或 Windows 桌面运行链路，对话协作模式下汇报前必须执行 `npm run windows:preview`。
- Electron Playwright、桌面自动化回归、性能诊断与时序采样默认一律走 Windows 侧现成脚本链路：`scripts/windows/windows-desktop-test.sh`、`scripts/windows/run-playwright-desktop.ps1` 与 `playwright.desktop.config.ts`；除非用户当次明确要求排查 WSL 本地运行时，否则不得把 WSL 内直接拉起的 Electron 当成默认诊断或验收入口。
- `npm run electron:dev` 仅用于直接拉起 Electron dev runtime 的调试场景，不作为默认 Windows 验收命令。
