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

- Windows 开发机使用普通局域网 SSH 进入 PowerShell；Mac 只通过 `scripts/windows/windows-dev-control.mjs` 调用 registry 当前登记的具名动作，将 Mac `dev` 精确覆盖到 LAN Git 同名镜像，再覆盖固定 `D:\C\foliole`。registry 是动作清单的机械真相，AGENTS 不复制枚举。Windows 不决定候选；trusted runtime revision 只证明产品 runtime 等价，最终验收源码 revision 仍取 controller 已同步的当前 Mac 完整提交。不得从 Windows 回传或合并源码。
- Windows DEV receiver 与 build 只允许使用 `C:\Program Files\nodejs\node.exe`，不得回退到 PATH 自动发现、portable Node、第二 checkout 或其他 source/build 控制面。
- A5 设备自动化必须由 Mac DEV controller 的具名 action 调用固定 device adapter，消费 Windows 单仓 pull 后的 `dev` 和固定 A5 identity。清数据、re-pair、既定数据根外读取、提权、防火墙或系统级修改必须在执行前返回 `approval_required`，不得提供 direct device CLI 或远程 approval bypass。
- Windows 原生 Codex 会话可以使用 PowerShell 作为默认交互 shell，但 PowerShell 只用于短命令、文件读取、状态检查和运行已存在脚本；不得把 PowerShell 当成通用脚本语言来内联复杂流程。
- 涉及环境变量、后台进程、重定向、路径拼接、Electron 启动或多步 Windows 命令时，必须优先写成 Node `.mjs` runner；确实需要 Windows 宿主能力时，使用已提交的 `.ps1` / `.cmd` 文件入口，并通过简单 `-File` 或脚本路径调用。
- Windows 原生 Codex 检查或控制 Windows Electron dev runtime 时，优先使用 `npm run windows:client:native -- <status|start|stop|restart|full-restart>`；该入口参照既有 ready marker / bridge marker 信任语义，但用 Node 原生进程控制直接启动 `electron-dev-native.mjs`，避免旧 PowerShell client wrapper 和 inline command 转义。
- Windows 原生 Codex 会话直接站在 Windows checkout 内诊断时，使用 `npm run windows:preview:native`；该入口复用既有 client control、restart intent、renderer reload intent、ready marker 与 native ABI preflight 语义。
- Windows 使用 `D:\C\foliole` 普通 `dev` Git 仓库作为 Windows 桌面与 A5 Android 的唯一开发现场；每次固定动作先成功 fetch Mac 权威 LAN 镜像，再 `reset --hard` 到该结果并用 `git clean -fd` 清除非忽略的 untracked 源码漂移，最后复核工作区干净。fetch 失败时不得先覆盖本地内容。
- Windows 固定仓库不得 commit / push 回 `dev` 或任何源码上游；本地源码改动不保留、不 stash、不合并、不回传，也不交给用户处理。`git clean` 不使用 `-x`，不得清理 ignored runtime、library、证据或工具缓存。
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

- 桌面验收以当前原生宿主为主；只有用户明确要求、目标命中另一平台专属边界、发布/安装包或方案承诺跨宿主一致性时，才追加另一宿主。任何宿主的证据不得外推为另一宿主结论。
- 当前宿主先运行 `npm run quality:fast`，再按目标选择 T1 Hidden Native、T2 Visible Native 或 T3 人工检查。默认使用 `npm run test:e2e:desktop:native:hidden -- <spec>`；无显式 spec 的 hidden health 只证明 runner 可用，不构成功能验收。
- 只有目标依赖真实焦点、菜单栏、系统 dialog、拖拽/窗口、tray、notification、installer/updater 或用户明确要求可见预览时，才使用 `npm run test:e2e:desktop:native:visible -- <spec>` 或人工检查；开始前在 commentary 说明会短暂打扰桌面。
- Hidden/Visible spec 只断言稳定用户行为。UI、layout、空白页或视觉回归还必须产出截图或 trace 到 `.tmp/artifacts/`；不得用 DOM 顺序、坐标或文本存在代替视觉证据。最终汇报说明自动断言覆盖的用户效果与未覆盖观察点。
- Desktop Playwright 使用共享 harness、隔离 state root 与 resource gate，并在共享工作区串行执行；并发占用是资源冲突，不得报告为产品失败。不得绕开 runner 直接运行裸 Playwright CLI。
- macOS preview 使用 `npm run electron:dev` 的 `.tmp` sandbox，native preflight 使用 `npm run electron:native:health`。Windows 人工预览使用 `npm run windows:preview:native`，仅在 Windows 专属触发成立时执行。
- Windows 专属证据覆盖 Windows path/`app.getPath`、ABI、native shell/dialog/tray/notification、主数据库、installer/updater 与 Windows preload/IPC 边界；Linux Electron + Xvfb 或 macOS preview 不得替代。
