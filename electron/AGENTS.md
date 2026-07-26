# AGENTS

## Scope

- 本文件适用于：`electron/**`、`scripts/desktop/**`、`scripts/macos/**`、`scripts/windows/**`、`playwright.desktop.config.ts`、桌面运行链路、桌面客户端预览、Electron main / preload / IPC / sqlite 相关任务。
- 进入上述范围工作时，除根 `AGENTS.md` 外，必须同时遵守本文件。

## Desktop Host Rules

- 本项目默认桌面优先，不按纯 Web 方案优先。
- 当前 Codex 所在的原生桌面宿主是日常开发与本轮桌面行为的主验收宿主；不得因默认产品视角或另一平台仍有专项风险，就跳过当前宿主验收或把它挂成未来任务。
- 当前活跃 Foliole library 及其原生宿主是用户数据与主数据库的事实来源；必须从当前运行时、library selection 或用户明确路径解析数据库，不得用历史平台默认路径替代当前主库。
- macOS 与 Windows 分别负责各自当前原生宿主和活跃 library 的数据库核对；Windows 只对 Windows ABI、原生 shell、dialog、tray、notification、安装包与 Windows 路径语义等 Windows 专属结论具有权威性。
- 诊断主数据库时必须先使用 `query-foliole-db` skill 的当前宿主只读流程；显式路径优先，自动解析只允许在候选唯一时采用，多候选必须停下确认。读取活库必须使用能观察 WAL 的只读连接，`immutable` 只用于已停止写入的快照。
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
- 若同一轮日志已出现 `database_init_complete` 与 `bridge_ready`，同时出现 `window_error`、`renderer_error_boundary` 或 `app_ready_timeout`，必须先定位 renderer 错误源码与最近消费契约改动；不得继续优先归因数据库、Windows checkout 或 Electron 启动链路。

## Windows Native Shell Policy

- Windows Android Lab 的 forced-command dispatcher 只负责 envelope 校验、原子 claim 与 scheduled worker 投递；ADB、Windows client、仓库 runner、Lab 文件读取及 run-scoped 诊断都由 limited interactive worker 执行，并记录实际 argv、声明 cwd、环境键、stdout、stderr、exit code、时限与终止原因。
- Lab 自动化必须绑定 fixed commit / checkout 和目标 A5 identity；诊断脚本只写入当前 run evidence sandbox。清数据、re-pair、Lab 根外读取、提权、防火墙或系统级修改必须在执行前返回 `approval_required`，不得提供远程 approval bypass。
- Windows 原生 Codex 会话可以使用 PowerShell 作为默认交互 shell，但 PowerShell 只用于短命令、文件读取、状态检查和运行已存在脚本；不得把 PowerShell 当成通用脚本语言来内联复杂流程。
- 涉及环境变量、后台进程、重定向、路径拼接、Electron 启动或多步 Windows 命令时，必须优先写成 Node `.mjs` runner；确实需要 Windows 宿主能力时，使用已提交的 `.ps1` / `.cmd` 文件入口，并通过简单 `-File` 或脚本路径调用。
- Windows 原生 Codex 检查或控制 Windows Electron dev runtime 时，优先使用 `npm run windows:client:native -- <status|start|stop|restart|full-restart>`；该入口参照既有 ready marker / bridge marker 信任语义，但用 Node 原生进程控制直接启动 `electron-dev-native.mjs`，避免旧 PowerShell client wrapper 和 inline command 转义。
- Windows 原生 Codex 会话直接站在 Windows checkout 内诊断时，使用 `npm run windows:preview:native`；该入口复用既有 client control、restart intent、renderer reload intent、ready marker 与 native ABI preflight 语义。
- Windows 原生 Codex 需要快速确认本机环境与脚本入口时，优先使用 `npm run windows:native:check`；该入口覆盖 native preflight 与核心路径测试，不替代本轮能力闭环所需的最小相关验证。
- `electron-dev-native.mjs` 只负责设置 Windows 原生试点的独立 userData / session，然后复用已验证的 `scripts/electron-dev.mjs`；不得为原生试点另写一套 Electron/Vite 启动协议，除非先证明旧 dev runner 在 Windows 原生下不可用。
- 禁止在仓库脚本中新增 `powershell.exe -Command ...`、复杂 `cmd.exe /c ... && ...`、内联 `set VAR=... && npm ...`、或跨 PowerShell / cmd 多层嵌套命令；这些模式必须沉到受测 runner 文件中。临时诊断需要复杂 PowerShell 参数时，使用 `powershell.exe -NoProfile -EncodedCommand` 并把 stdout、stderr、exit code 写入 `.tmp/` 后再读取。
- 遇到 `better-sqlite3` / native module 的 `NODE_MODULE_VERSION` mismatch 时，使用 `npm run electron:rebuild:native` 恢复 Electron ABI；不得使用普通 `npm rebuild better-sqlite3` 替代。
- 根 `node_modules/better-sqlite3` 默认归 Electron ABI 所有；新增真实 sqlite 开发脚本不得用普通 Node 直接加载根 `better-sqlite3`，必须走受控 Electron ABI runner 或先在实施说明中登记例外。
- `npm install` / `npm ci` 后默认重新校验 native ABI；若 Windows 预览入口报 ABI mismatch，预览前检查可以先运行 `npm run electron:rebuild:native` 修复 Electron ABI 并复验，复验失败才允许失败；Electron-as-Node runner 仍应直接提示运行该命令，不得使用普通 `npm rebuild better-sqlite3`。

## macOS Desktop Interaction

- macOS Codex 会话调试或操作桌面客户端时，默认不得抢占用户当前桌面；优先使用日志 / CLI、应用级后台状态读取或不激活窗口的 Computer Use 操作，能在后台完成时不得将 Foliole 拉到前台。
- 只有验收目标依赖真实焦点、键盘输入、菜单栏、拖拽或窗口呈现，或用户当次明确要求可见预览时，才允许前台操作；执行前必须先在 commentary 说明会短暂打扰桌面，结束后只停止或隐藏本轮启动的窗口，不得关闭用户原有窗口。

## Validation

- 桌面验收先按当前原生宿主路由：macOS 会话用 macOS Hidden / Visible Native 或 `npm run electron:dev` 人工预览完成本轮主验收；Windows 原生会话用对应 Windows Native 入口。只有用户明确要求、行为命中另一平台专属边界、发布 / 安装包验收或任务承诺跨宿主一致性时，才追加另一宿主验证，不得把普通桌面任务默认挂到未来 Windows 验收。
- macOS 与 Windows 的日常 Electron 自动验收共用 `test:e2e:desktop:native:hidden` / `test:e2e:desktop:native:visible` 能力名、共享 harness、隔离 state root 和 resource gate；hidden 必须保持屏外可渲染且不抢焦点，visible 必须显式传入当前任务 spec。成功截图写入 `.tmp/artifacts/desktop-acceptance/`，失败继续保留 diagnostics 与 trace。
- macOS 开发预览使用 `npm run electron:dev`，该入口必须默认进入仓库 `.tmp` 下的 preview sandbox；macOS native preflight 使用 `npm run electron:native:health`，只验证 compile 与 Electron ABI，不得复用 Windows GUI health、真实 userData、Windows marker 或 renderer reload 语义。
- macOS hidden / visible 与人工 preview 只能证明 macOS Electron 宿主行为，不得声明 Windows 主数据库、Windows ABI、native shell、dialog、tray、notification、安装包或发布链路已验收。
- 当前原生桌面宿主的本地快检使用 `npm run quality:fast:native`：macOS / Linux 进入共享 fast kernel，Windows 进入 Windows Native T0 adapter。该检查不启动真实 Electron 窗口，也不自动运行 `quality:desktop` / `quality:shared` / `quality:android` / `quality:full`；当它提示后置综合门 deferred 时，按风险、交接或 push 需要再显式运行对应综合机械门。
- 凡本轮改动会进入当前桌面宿主运行时或改变桌面用户可见行为，必须先完成本轮相关前置验证并运行 `npm run quality:fast:native`，再完成一次 T1 / T2 / T3 检查。首选 T1 隐藏检查：新增或复用本轮任务相关 spec，并运行 `npm run test:e2e:desktop:native:hidden -- <spec>`；若行为不适合 hidden-capable 自动化，再升级到 T2 可见检查 `npm run test:e2e:desktop:native:visible -- <spec>` 或 T3 人工检查。命中根 `AGENTS.md` 的非运行时改动豁免时，可跳过桌面 T0 / T1 / T2 / T3，并在最终汇报写明原因。
- 桌面相关改动仍应先执行覆盖本轮能力闭环的最小前置验证；只有当能力闭环触及桌面根链路、桌面多子系统联动、共享层 / 依赖、或你无法用相关验证证明影响已被覆盖时，才升级为 `npm run quality:desktop`、`npm run quality:shared`、`npm run quality:android` 或 `npm run quality:full`；同时进入发布候选、安装包或跨宿主发布验收时才升级到 `npm run quality:release`。
- Windows 原生 Codex 会话执行 Windows 桌面人工预览时使用 `npm run windows:preview:native`。桌面人工预览只在用户明确要求 Windows 预览、阶段验收、发布 / 安装包验收、或本节 Windows 专属风险命中时执行；不再读取持久 preview flag 自动升级日常桌面可见改动。
- Agent 日常 T1 / T2 自动化验收先按验收目标选入口：纯 renderer / Web UI 行为若属于桌面产品表面，仍优先使用 `npm run test:e2e:desktop:native:hidden -- <spec>` 覆盖真实 Electron renderer；只有非桌面表面才使用 headless browser。Windows 原生 Codex 会话必须运行本轮任务相关的 hidden-capable Playwright spec，不得用无参 hidden health 替代功能验收。
- Hidden Native 是不打扰用户的桌面 Electron 执行模式，不是固定测试内容；无显式 spec 时 `npm run test:e2e:desktop:native:hidden` 只运行 hidden mode health，用来证明 runner / 窗口呈现链路可用，不构成本轮功能验收。
- T1 隐藏检查只覆盖 renderer / preload bridge / IPC / 临时 sqlite / navigation / layout 等不依赖真实桌面 focus 的当前任务行为；本轮若存在适合长期锁定的 hidden-capable 产品 contract，必须新增或复用 targeted spec 并运行，但“当前 DOM 或画面可以被查询”本身不构成新增断言的理由。涉及用户可见 UI / layout / 空白页 / 视觉回归的 T1 必须同时产出至少一张当前任务页面截图或 Playwright trace 附件，截图默认写入 `.tmp/artifacts/`，最终汇报必须给出可点击截图路径或可见证据；不得用 DOM 顺序、坐标或文本存在断言替代视觉证据。若本轮没有 hidden-capable 桌面行为，最终汇报说明跳过 T1 的原因；若行为依赖 focus、窗口拖拽、系统 dialog、tray、notification、installer / updater、真实菜单栏，则必须升级到 T2 可见检查、T3 人工检查或发布专项验收。
- T2 可见检查使用 `npm run test:e2e:desktop:native:visible -- <spec>`，必须显式传入当前任务相关 spec；它会短暂打扰桌面，但仍是自动化断言，不得汇报成人工验收，也不得复用 `windows:preview:native` 人工预览入口。
- 桌面 Electron Playwright 在共享工作区内默认串行执行；若 `desktopSession` setup 卡住且发现另一条桌面 Playwright / 预览正在持有运行资源，必须等待或清理 stale 进程后重跑，不得把并发抢占汇报为产品失败。hidden native 入口必须通过 resource gate 或等价串行保护。
- Desktop Playwright 只把稳定的用户行为 contract 转成具体断言，不把当前排版、DOM 结构或实现路径改写成测试 contract；测试前置状态优先用页面内事件、debug bridge 或命令入口建立，避免把导航和面板点击噪声混进主断言。只有验收目标本身是鼠标点击、命中区域、菜单/面板可达性、拖拽、物理键盘快捷键或普通用户路径完整性时，才把真实 UI 操作作为主动作。最终汇报必须说明 Playwright 断言覆盖的用户效果和未覆盖的人工观察点。
- Windows 侧 Electron Playwright、Windows 预览和 Windows 桌面脚本链路只用于 Windows 专属验收：用户明确要求 Windows 预览、阶段 / 最终人工验收、发布 / 安装包、Windows 路径或 `app.getPath` 语义、`better-sqlite3` Windows ABI、Windows 原生 shell / dialog / tray / notification、Windows 主数据库路径、preload sandbox / IPC 在 Windows 上的边界风险、以及其他必须证明 Windows 客户端真实行为的任务。Linux Electron + Xvfb 不得宣称为 Windows 专属行为已验收。
- `npm run electron:dev` 仅用于直接拉起 Electron dev runtime 的调试场景，不作为默认 Windows 验收命令。
