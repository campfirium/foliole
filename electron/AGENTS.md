# AGENTS

## Scope

- 本文件适用于：`electron/**`、`scripts/windows/**`、`playwright.desktop.config.ts`、桌面运行链路、Windows 客户端预览、Electron main / preload / IPC / sqlite 相关任务。
- 进入上述范围工作时，除根 `AGENTS.md` 外，必须同时遵守本文件。

## Desktop Host Rules

- 本项目默认桌面优先，不按纯 Web 方案优先。
- 默认客户端视角就是 Windows 客户端；未特别说明时，数据库核对、人工补数据、发布 / 安装包验收与 Windows 原生能力确认都以 Windows 客户端为准，不以 WSL 内临时路径或其他本机副本为准。
- 默认主数据库固定视为 `D:\X\U\Foliole\Data\foliole.db`；在 WSL 内对应路径为 `/mnt/d/X/U/Foliole/Data/foliole.db`。未获用户明确批准前，不得自行改查其他数据库路径。
- 诊断主数据库时必须先使用 `query-foliole-db` skill 的固定只读流程；不得先用 WSL `sqlite3`、WSL `better-sqlite3`、仓库 Node 依赖或直接打开 `/mnt/d/.../foliole.db` 查询正在运行的 Windows 活库，避免 WAL / SHM 跨宿主 I/O 误判。若固定流程覆盖不了，再走 Windows 侧只读 runtime 或停进程后的快照查询，并说明原因。
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
- 若同一轮日志已出现 `database_init_complete` 与 `bridge_ready`，同时出现 `window_error`、`renderer_error_boundary` 或 `app_ready_timeout`，必须先定位 renderer 错误源码与最近消费契约改动；不得继续优先归因数据库、Windows mirror 或 Electron 启动链路。

## Windows Native Shell Policy

- Windows 原生 Codex 会话可以使用 PowerShell 作为默认交互 shell，但 PowerShell 只用于短命令、文件读取、状态检查和运行已存在脚本；不得把 PowerShell 当成通用脚本语言来内联复杂流程。
- 涉及环境变量、后台进程、重定向、路径拼接、Electron 启动或多步 Windows 命令时，必须优先写成 Node `.mjs` runner；确实需要 Windows 宿主能力时，使用已提交的 `.ps1` / `.cmd` 文件入口，并通过简单 `-File` 或脚本路径调用。
- Windows 原生 Codex 检查或控制 Windows Electron dev runtime 时，优先使用 `npm run windows:client:native -- <status|start|stop|restart|full-restart>`；该入口参照既有 ready marker / bridge marker 信任语义，但用 Node 原生进程控制直接启动 `electron-dev-native.mjs`，避免 Bash `wslpath`、WSL mirror 默认目录、旧 PowerShell client wrapper 和 inline command 转义。
- WSL 主开发会话执行 Windows 桌面人工预览或 Windows 专属验收时，统一使用 `npm run windows:preview`；该入口先把 WSL 主仓库同步到 Windows 验收 mirror，再复用既有 client control、restart intent、renderer reload intent、ready marker 与 native ABI preflight 语义。
- Windows 原生 Codex 会话直接站在 Windows checkout 内诊断时，才使用 `npm run windows:preview:native`；该入口复用既有 client control、restart intent、renderer reload intent、ready marker 与 native ABI preflight 语义，但不做 WSL mirror 同步，不得作为 WSL 主开发会话的默认预览入口。
- Windows 原生 Codex 需要快速确认本机环境与脚本入口时，优先使用 `npm run windows:native:check`；该入口覆盖 native preflight 与核心路径测试，不替代本轮能力闭环所需的最小相关验证。
- `electron-dev-native.mjs` 只负责设置 Windows 原生试点的独立 userData / session，然后复用已验证的 `scripts/electron-dev.mjs`；不得为原生试点另写一套 Electron/Vite 启动协议，除非先证明旧 dev runner 在 Windows 原生下不可用。
- 禁止在仓库脚本中新增 `powershell.exe -Command ...`、复杂 `cmd.exe /c ... && ...`、内联 `set VAR=... && npm ...`、或跨 PowerShell / cmd 多层嵌套命令；这些模式必须沉到受测 runner 文件中。
- 遇到 `better-sqlite3` / native module 的 `NODE_MODULE_VERSION` mismatch 时，使用 `npm run electron:rebuild:native` 恢复 Electron ABI；不得使用普通 `npm rebuild better-sqlite3` 替代。
- 根 `node_modules/better-sqlite3` 默认归 Electron ABI 所有；新增真实 sqlite 开发脚本不得用普通 Node 直接加载根 `better-sqlite3`，必须走受控 Electron ABI runner 或先在实施说明中登记例外。
- `npm install` / `npm ci` 后默认重新校验 native ABI；若 Windows 预览入口报 ABI mismatch，预览前检查可以先运行 `npm run electron:rebuild:native` 修复 Electron ABI 并复验，复验失败才允许失败；Electron-as-Node runner 仍应直接提示运行该命令，不得使用普通 `npm rebuild better-sqlite3`。

## Validation

- 桌面相关改动默认先执行覆盖本轮能力闭环的最小验证；只有当能力闭环触及桌面根链路、桌面多子系统联动、共享层 / 依赖、或你无法用相关验证证明影响已被覆盖时，才升级为 `npm run quality:desktop`、`npm run quality:shared` 或 `npm run quality:full`；需要 Android 原生宿主一起验收时才升级到 `npm run quality:release`。
- WSL 主开发会话执行 Windows 桌面人工预览时，统一使用 `npm run windows:preview`；Windows 原生 Codex 会话直接诊断 Windows checkout 时才使用 `npm run windows:preview:native`。根 `AGENTS.md` 决定是否需要人工预览：用户明确要求 Windows 预览、阶段验收、发布 / 安装包验收、或本节 Windows 专属风险命中时，相关验证通过后执行对应入口；连续推进期间除非用户当次明确要求，否则不自动执行。
- Agent 日常自动化验收先按验收目标选入口：纯 renderer / Web UI 行为可用 WSL headless Playwright；桌面 Electron 行为默认使用 `npm run test:e2e:desktop:agent` 或等价 `xvfb-run --auto-servernum npx playwright test -c playwright.desktop.config.ts ...`，在 WSL/Linux + Xvfb 中启动 Linux Electron，避免可见窗口、闪屏或抢焦点。
- WSL/Linux desktop Playwright 必须从当前 WSL 仓库启动，不得默认解析到 Windows mirror 或 `electron.exe`；若出现 Electron inspector / localhost 连接到 Windows executable、stale renderer build、ABI mismatch、构建产物缺失或首次提示遮挡，应修复入口或测试前置，不得改走 Windows 侧后报告为本轮自动验收通过。
- Desktop Playwright 应把用户预期转成具体断言；若验收目标不是“物理键盘快捷键”，测试可以用页面内事件、debug bridge 或命令入口打开前置 UI，避免 Xvfb 焦点差异污染主断言。最终汇报必须说明 Playwright 断言覆盖的用户效果和未覆盖的人工观察点。
- Windows 侧 Electron Playwright、Windows 预览和 Windows 桌面脚本链路只用于 Windows 专属验收：用户明确要求 Windows 预览、阶段 / 最终人工验收、发布 / 安装包、Windows 路径或 `app.getPath` 语义、`better-sqlite3` Windows ABI、Windows 原生 shell / dialog / tray / notification、Windows 主数据库路径、preload sandbox / IPC 在 Windows 上的边界风险、以及其他必须证明 Windows 客户端真实行为的任务。Linux Electron + Xvfb 不得宣称为 Windows 专属行为已验收。
- `npm run electron:dev` 仅用于直接拉起 Electron dev runtime 的调试场景，不作为默认 Windows 验收命令。
