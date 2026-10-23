# AGENTS

## Scope

- 本文件适用于：`electron/**`、`scripts/desktop/**`、`scripts/macos/**`、`scripts/windows/**`、`playwright.desktop.config.ts`、桌面运行链路、桌面客户端预览、Electron main / preload / IPC / sqlite 相关任务。
- 进入上述范围工作时，除根 `AGENTS.md` 外，必须同时遵守本文件。

## Desktop Host Rules

- 本项目默认桌面优先，不按纯 Web 方案优先。
- 当前活跃 Foliole library 及其原生宿主是用户数据与主数据库的事实来源；必须从当前运行时、library selection 或用户明确路径解析数据库，不得用历史平台默认路径替代当前主库。
- macOS 与 Windows 分别负责各自当前原生宿主和活跃 library 的数据库核对；Windows 只对 Windows ABI、原生 shell、dialog、tray、notification、安装包与 Windows 路径语义等 Windows 专属结论具有权威性。
- 系统能力优先经 Electron main process 暴露，再由 renderer 通过 bridge 调用；业务层不得散落 `ipcRenderer` 调用。
- 文件路径、数据库路径、日志路径等统一由 Electron main process 解析；前端禁止拼平台绝对路径。
- 持久化主路径统一走 Electron main process 与 sqlite；`localStorage` 仅允许用于可丢失 UI 偏好且必须可审计。
- 桌面窗口已可见但 bridge-backed controls 失效时，默认优先排查 preload / bridge 链路，不得先草率归因为 renderer 未启动。

## Implementation Rules

- `electron/main.ts`、`electron/preload.cjs`、`electron/ipc/**`、`electron/database/**` 只做桌面宿主职责；禁止把桌面宿主规则回灌进 `src/features/**`。
- 任何新增 renderer 可见能力，必须先定义或复用 bridge / IPC contract，再接业务消费；禁止先在 renderer 写假直连调用。
- 涉及 preload、`contextBridge`、`ipcRenderer`、`window.electronAPI` 的改动，必须先核对 Electron 官方 `sandbox` / `contextIsolation` 边界。
- preload 改动必须带一条“sandbox 受限 require 环境下 bridge 仍可暴露”的自动化回归测试。
- `electron/preload.cjs` 不受根规则的单文件行数预算约束，新增 bridge 直接在该文件内追加：sandbox preload 只能 `require('electron')`，官方拆分路线只有构建期打包，其构建、路径与测试成本高于收益，单文件也便于审查安全边界；Electron sandbox 允许加载本地文件或项目已为 preload 引入打包步骤时，本例外失效。
- bridge payload、IPC 参数与返回值的结构变更，必须同步补测试；不得只改 happy path。
- 数据库存储、备份、恢复、同步与设备身份相关改动，默认按永久态处理，不得只修页面即时表现。

## Desktop Startup Troubleshooting

- 客户端启动问题，优先排查日志，没有日志则完善日志功能。
- 判断 Windows Electron runtime 是否可信时，必须以 main path、ready marker、runtime pid、boot session 与 bridge availability 的同轮校验为准；不得用“窗口可见”或“进程存在”替代可信判定。
- 若同一轮日志已出现 `database_init_complete` 与 `bridge_ready`，同时出现 `window_error`、`renderer_error_boundary` 或 `app_ready_timeout`，必须先定位 renderer 错误源码与最近消费契约改动；不得继续优先归因数据库、Windows checkout 或 Electron 启动链路。

## Windows Scripts And Native Modules

- 涉及环境变量、后台进程、重定向、路径拼接、Electron 启动或多步 Windows 命令时，必须优先写成 Node `.mjs` runner；确实需要 Windows 宿主能力时，使用已提交的 `.ps1` / `.cmd` 文件入口，并通过简单 `-File` 或脚本路径调用。
- `electron-dev-native.mjs` 只负责设置 Windows 原生试点的独立 userData / session，然后复用已验证的 `scripts/electron-dev.mjs`；不得为原生试点另写一套 Electron/Vite 启动协议，除非先证明旧 dev runner 在 Windows 原生下不可用。
- 禁止在仓库脚本中新增 `powershell.exe -Command ...`、复杂 `cmd.exe /c ... && ...`、内联 `set VAR=... && npm ...`、或跨 PowerShell / cmd 多层嵌套命令；这些模式必须沉到受测 runner 文件中。临时诊断需要复杂 PowerShell 参数时，使用 `powershell.exe -NoProfile -EncodedCommand` 并把 stdout、stderr、exit code 写入 `.tmp/` 后再读取。
- 遇到 `better-sqlite3` / native module 的 `NODE_MODULE_VERSION` mismatch 时，使用 `npm run electron:rebuild:native` 恢复 Electron ABI；不得使用普通 `npm rebuild better-sqlite3` 替代。
- 根 `node_modules/better-sqlite3` 默认归 Electron ABI 所有；新增真实 sqlite 开发脚本不得用普通 Node 直接加载根 `better-sqlite3`，必须走受控 Electron ABI runner 或先在实施说明中登记例外。
- `npm install` / `npm ci` 后默认重新校验 native ABI；若 Windows 预览入口报 ABI mismatch，预览前检查可以先运行 `npm run electron:rebuild:native` 修复 Electron ABI 并复验，复验失败才允许失败；Electron-as-Node runner 仍应直接提示运行该命令，不得使用普通 `npm rebuild better-sqlite3`。

## Validation

- 升级 Electron major 时，必须把所有 Electron 原生模块作为同一兼容集合联合审查和验证；除 ABI、加载与行为合同外，适用路径必须覆盖进程退出、worker 终止、原生对象回收与资源清理。
- 桌面验收以当前原生宿主为主；只有用户明确要求、目标命中另一平台专属边界、发布/安装包或方案承诺跨宿主一致性时，才追加另一宿主。任何宿主的证据不得外推为另一宿主结论。
- 当前宿主先满足根规则的本地行为测试门槛，并运行 `npm run quality:fast`，再按目标选择 T1 Hidden Native、T2 Visible Native 或 T3 人工检查。默认使用 `npm run test:e2e:desktop:native:hidden -- <spec>`；无显式 spec 的 hidden health 只证明 runner 可用，不构成功能验收。
- 只有目标依赖真实焦点、菜单栏、系统 dialog、拖拽/窗口、tray、notification、installer/updater 或用户明确要求可见预览时，才使用 `npm run test:e2e:desktop:native:visible -- <spec>` 或人工检查；开始前在 commentary 说明会短暂打扰桌面。
- Hidden/Visible spec 只断言稳定用户行为。UI、layout、空白页或视觉回归还必须产出截图或 trace 到 `.tmp/artifacts/`；不得用 DOM 顺序、坐标或文本存在代替视觉证据。最终汇报说明自动断言覆盖的用户效果与未覆盖观察点。
- Desktop Playwright 使用共享 harness、隔离 state root 与 resource gate，并在共享工作区串行执行；并发占用是资源冲突，不得报告为产品失败。不得绕开 runner 直接运行裸 Playwright CLI。
- macOS preview 使用 `npm run electron:dev` 的 `.tmp` sandbox，native preflight 使用 `npm run electron:native:health`。Windows 人工预览使用 `npm run windows:preview:native`，仅在 Windows 专属触发成立时执行。
- Windows 专属证据覆盖 Windows path/`app.getPath`、ABI、native shell/dialog/tray/notification、主数据库、installer/updater 与 Windows preload/IPC 边界；Linux Electron + Xvfb 或 macOS preview 不得替代。
