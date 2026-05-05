# AGENTS

## 项目总览
- Foliole 采用任务轨道式迭代（Track-Based），默认按“当前主目标 + 最小可验收任务”推进，不再以 M2/M3 阶段号驱动执行。
- 默认按“用户当次最新指令 + 当前代码现状”执行，不强制读取阶段与 backlog 文档。
- 仅当用户明确说“继续”时，才读取 `.lab/agent/TODO.md` 与必要的 `.lab/agent/DONE.md` 作为上下文，不再依赖独立 handoff / `LATEST` 文件。
- 若用户在当次会话中明确给出新的任务范围/优先级，按用户最新决定覆盖所有历史任务排序。

## 目录约定（当前）
- `.lab/specs/`：产品与工程规范来源，任务前必须先读对应条目。
- `.lab/agent/`：任务模板、TODO/DONE 台账、当前执行轨道、迭代日志（执行面文档）。
- `scripts/`：可复用自动化脚本；实验脚本后续放 `.lab/scripts/`。
- `ref/`：外部参考资料（只读，不作为直接实现来源）。

## 开发流程（主干优先）
- 分支策略：
1. 默认在 `dev` 主干连续小步迭代。
2. 默认不创建 feature 分支与 worktree。
3. 仅在高风险重构/并行实验/发布热修时启用分支，并需用户明确要求。
- 任务粒度：
1. 每次只做一个最小可验收任务（30-90 分钟）。
2. 单次改动必须可运行、可验证、可回退。
3. 禁止把无关重构混入当前任务。

## 任务 SOP（执行顺序不可跳）
1. 选任务：以用户当次明确指令为准；若用户未给任务清单，先更新 `.lab/agent/TODO.md`，再从“待办”区第一条可执行任务开始。
2. 定义验收：按 `.lab/agent/task-template.md` 写清 Given/When/Then。
3. 实施：仅改任务相关文件，遵守当前任务边界。
4. 验证：先跑最小可执行验证，再补可补的自动化测试。
5. 记录：仅在提交时记录（执行提交指令前整理并落库）。平时微调不新增迭代日志文件；记录文件路径为 `.lab/agent/iteration-log/entries/YYYYMMDD-HHMM-<slug>.md`，并同步更新索引 `.lab/agent/iteration-log.md`（结果/风险/下一步）。

## 异常与决策升级规则（强制）
1. 当 Agent 声称“问题已解决”，但人工验收发现问题仍存在时，禁止继续按主观猜测反复改动；必须先查阅对应官方文档与最佳实践，再进入下一轮修复。
2. 技术比选任务或中风险及以上改动，实施前必须先查阅官方文档与最佳实践，确认边界条件、推荐做法与已知风险。
3. 以上两类场景的回复必须包含：`已核对来源`、`根因判断`、`修复策略`；未完成三项前不得宣称“已解决”或“可实施”。
4. 中风险及以上至少包括：编辑器渲染链路、持久化与数据模型、跨模块状态联动、可能影响主流程验收的交互改动。
5. 桌面启动/窗口可见但功能失效类问题，禁止先把症状归因为“renderer 未启动”或“导航卡死”；必须先同时核对 `did-start-navigation/dom-ready/did-finish-load`、`renderer-state` 快照、`boot/app_ready/bridge_ready` marker 与 `window.electronAPI` 可用性，再决定问题属于导航层、preload 层还是 bridge/native invoke 层。
6. 若桌面页面已可见、`readyState` 已到 `interactive/complete`、`root` 已存在，但 `app_ready` / `bridge_ready` 缺失或 bridge-backed controls 灰掉，默认优先排查 preload/bridge 链路；在拿到相反证据前，不得继续把问题定性为 Vite/renderer 页面加载失败。

## 工具链基线（强制）
1. 包管理器：按仓库锁文件检测（`pnpm`/`bun`/`yarn`/`npm`），禁止硬编码单一包管理器。
2. 语言：`TypeScript`（严格模式，禁止 `any` 滥用）。
3. Lint：`eslint` + `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin` + `eslint-plugin-import`。
4. 格式化：`prettier`（只负责格式，不替代 lint）。
5. 测试框架：由仓库现状决定（例如 `vitest`/`jest`），以 `package.json` 脚本为准。
6. 提交前检查入口：`scripts/quality-gate-fast.sh`（不包含 `build`）。
7. npm 安装稳定性：默认禁用 `audit/fund`（通过仓库 `.npmrc`），若需手动安装依赖优先使用 `npm install --no-audit --no-fund`；若安装超过 120s 无输出，视为异常并切换到 `--loglevel=verbose` 诊断。

## 质量闸（Zero Tolerance，可执行）
1. 不允许通过“降低检查标准”来过关（例如跳过构建、跳过测试、注释掉关键校验）。
2. 默认质量闸固定检查顺序：`lint` -> `typecheck` -> `test`（不包含 `build`）。
3. 实际执行命令由 `scripts/quality-gate-fast.sh` 按包管理器自动生成（例如 `pnpm run lint` / `yarn lint`）。
4. 以上任一失败即阻断，必须先修复代码本身，再继续任务流转。
5. `build` 属于发布/打包检查：仅在用户明确要求全量交付时执行（`scripts/quality-gate.sh` 或 `npm run windows:deliver:full`）。
6. 在首个功能任务前，必须先完成“工程基线任务”：创建并打通上述脚本。

## 缺陷修复与回归测试（强制）
1. 任意可复现缺陷（Bug）修复，必须新增至少 1 条自动化回归测试；无回归测试不视为完成。
2. 回归测试必须满足“修复前可失败、修复后可通过”的判定价值，禁止仅添加无效覆盖测试。
3. 测试分层按根因就近落位：状态/数据错误优先 `store/model` 单测；交互与焦点问题优先 `app-smoke`/E2E。
4. 重构类任务（含结构拆分、模块迁移）默认视为高回归风险，提交前必须运行关键回归测试清单。
5. 任务汇报或提交说明必须包含：`根因判断`、`对应回归测试`、`剩余风险`。

## Windows Native 客户端同步规则（强制）
1. Windows 端 Tauri 启动由用户手动负责（例如在 `C:\dev\foliole` 执行 `npm run tauri:dev`）。
2. Windows 预览是否默认执行，仅由 `.lab/agent/windows-preview.flag` 控制；该文件是唯一真相来源，只允许写入 `ON` 或 `OFF`。
3. 当 `windows-preview.flag` 为 `ON` 时，每个任务在完成本地质量闸后，默认继续执行 `npm run windows:preview` 再结束验证。
4. 当 `windows-preview.flag` 为 `OFF` 时，默认不执行任何 Windows 客户端联调或同步命令；任务验证只要求本地 `lint` / `typecheck` / `test` 或相关最小子集。
5. 用户说“打开 Windows 预览开关”时，将 `.lab/agent/windows-preview.flag` 改为 `ON`；用户说“关闭 Windows 预览开关”时，将其改为 `OFF`。开关状态跨会话持续生效，直到用户再次修改。
6. 若用户在开关为 `OFF` 时明确要求执行 Windows 验收，仍可按用户指令临时执行一次，但不自动改变开关状态。
7. 对用户宣称“可在 Windows 客户端看到效果/可验收”前，必须回报本次执行的实际命令与最终状态字段（`status: SYNCED` / `status: RESTARTED` / `status: DELIVERED`）。
8. 若质量闸或同步失败，必须先修复失败项再继续功能结论输出；禁止以“代码已改完”替代客户端可见结果。

## Windows Preview Workflow (Effective Immediately)
- Goal: use a persistent hard switch to control whether Windows preview is part of the default validation loop.
- Switch file: `.lab/agent/windows-preview.flag`
- `ON`: local quality checks first, then run `npm run windows:preview`
- `OFF`: local quality checks only
- `windows:preview` does:
  - `windows:sync` (rsync source to `C:\\dev\\foliole`)
  - Ensure Windows `electron:dev` is running (auto-start if stopped)
  - If changes include `electron/**`: restart Windows client; otherwise rely on Vite HMR
- `windows:deliver` is reserved for explicit “deliver/acceptance” checks because it runs full quality gate (`lint + typecheck + test + build`) before syncing and restarting.

## Windows 环境安装目录约定（强制）
1. Windows 侧安装型开发环境（如 `nvm`、`nodejs`、`cargo`、工具链缓存）默认统一落在 `D:\R` 根目录下分子目录管理。
2. 新增或重装 Windows 工具时，优先选择 `D:\R` 作为安装根路径；非必要不使用 `C:\Program Files`、`C:\Users\...\AppData` 作为长期开发安装路径。

## 桌面选型优先级（强制）
1. 本项目默认按桌面应用（Tauri Native）优先选型，不按纯 Web 方案优先。
2. 涉及系统能力枚举（如系统字体、文件系统、原生窗口行为）时，优先通过 Rust/Tauri 命令实现，再由前端 `invoke` 调用。
3. 禁止在主路径依赖会触发浏览器权限弹窗的 Web API 作为桌面能力实现（例如 `queryLocalFonts`）；仅允许作为非主路径降级兜底且需明确标注。

## 跨平台能力与存储抽象（强制）
1. 文件、数据库、索引、日志等路径解析统一由 Rust 端提供（如 `PathService`/同等命令层）；前端禁止拼接平台相关绝对路径、用户目录路径与分隔符逻辑。
2. 权限请求、文件对话框、外链打开、全局/窗口快捷键、原生窗口控制统一走单一 `PlatformBridge` 模块；业务与 UI 层不得直接散落 `@tauri-apps/api/*` 调用。
3. 持久化主路径统一通过 Rust 端落盘（app data + 文件或数据库）；`localStorage` 仅允许用于“可丢失的 UI 偏好”且必须进入白名单（键名集中定义、可审计）。
4. 新增系统能力时，必须同时提供“平台能力接口 + 非桌面降级路径”；降级路径不得成为桌面主路径。
5. 涉及 macOS/iOS 的能力设计必须预留 sandbox 选项：应用容器目录、用户授权目录（security-scoped/bookmark 等）与权限声明位；未预留前不得宣称“已具备全平台可迁移性”。
6. 新功能评审必须显式标注“是否依赖 WebView 专有行为”；若依赖，则需提供替代实现或淘汰计划，不得进入主流程闭环。
7. Electron preload 属于平台桥接层真相入口；涉及 `contextBridge` / `ipcRenderer` / `window.electronAPI` 的改动，必须先核对 Electron 官方 `sandbox` / `contextIsolation` 文档边界，再实施。
8. 当 Electron `BrowserWindow` 开启 `sandbox: true` 时，preload 禁止依赖未被官方允许的 Node.js `require` 能力；尤其禁止为获取 `process`、路径或调试信息引入 `require('node:process')`、`require.resolve(...)` 等写法。需要运行态元数据时，优先使用 sandbox 已提供的全局对象（如 `process`、`__filename`）或由 main 显式注入。
9. 任意 Electron preload 改动，必须新增或更新一条“sandbox 受限 require 环境下仍能成功暴露 bridge”的自动化回归测试；无此回归，不视为完成。

## 架构与代码约束
1. 编辑器能力通过 `EditorAdapter` 抽象暴露，避免业务层散落具体编辑器 API。
2. 状态与存储在领域层统一管理，UI 不直接拼接底层数据结构。
3. 所有关键数据变更优先可恢复，避免不可逆破坏。
4. 复杂逻辑优先模块化拆分，避免单文件持续膨胀。

## 语法版本与迁移策略（强制）
1. 语法升级按“新版本前向实现”执行：仅保证新写入、新编辑路径符合当前语法规范。
2. 当前阶段不做历史语法迁移：禁止新增自动迁移脚本、禁止在 `rehydrate`/导入/启动流程中做兼容转换。
3. 遇到历史旧语法数据时，不以“补迁移”作为当次任务前置条件；按当前任务范围继续实施。

## 数据迁移与兼容策略（强制）
1. 数据格式切换不进入产品代码：转换由人工离线一次性完成，不在仓库主流程中实现迁移逻辑。
2. 转换完成后立即进入新格式单一路径，禁止长期兼容。
3. 禁止保留双写、双读、运行时回退链路、启动时自动探测与反复迁移代码。
4. 兼容不作为目标：不为历史格式新增或保留维护代码。

## 结构与规模约束（强制）
1. 目录基线（前端）：
- `src/app/`：应用壳与路由/页面装配。
- `src/features/`：按业务能力分模块（如 `editor`, `nodes`, `review`）。
- `src/shared/`：跨 feature 复用组件/工具/类型。
- `src/store/`：全局状态与持久化适配。
2. 文件行数限制：
- 目标：单文件 <= 220 行。
- 硬上限：单文件 > 260 行必须拆分。
3. 函数行数限制：
- 目标：单函数 <= 40 行。
- 硬上限：单函数 > 60 行必须拆分或提取子函数。
4. 单文件职责：每个文件只承载一个核心职责，禁止“UI + 数据访问 + 业务规则”混写。
5. 禁止通过“压缩为超长单行/极端紧凑写法”规避行数限制；若文件或函数超限，必须执行结构化拆分（提取模块、提取子函数），不得以可读性换取过闸。

## 安全与稳定性
1. 外部输入（含 Markdown）必须走既有解析链路，禁止直接注入不可信 HTML。
2. 高频交互（输入、滚动、筛选）应考虑性能开销，必要时使用节流/防抖。
3. 调试日志应可控，避免把噪音日志带入稳定版本路径。

## 语言与文案规则（强制）
1. 代码、注释、提交信息、UI 文案、配置键名统一使用英文。
2. 非翻译任务下，不引入多语言资源文件；默认仅英文单语。
3. 规格文档（`.lab/specs/**`）文件名使用英文 slug，正文内容默认使用中文；如需保留英文术语，可在中文语境中直接使用。
4. 对外沟通可以中文；除代码、注释、提交信息、UI 文案、配置键名外，其他落库文档默认使用中文，除非用户当次明确要求英文。

## 文档与沟通
1. 对内沟通与任务汇报使用中文，必要术语保留英文。
2. 重要边界决策与异常处理结论写入 `.lab/specs/` 或 `.lab/agent/iteration-log/entries/*.md`（并在索引中可检索）。
3. 任务完成汇报至少包含：功能摘要、验收步骤、风险提示。
4. 文档默认视为参考而非绝对真相；若文档与当前代码/用户最新决策冲突，以用户最新决策和可运行代码现状为准。
5. 提交相关请求（如“提交”“commit”“执行提交指令”）一律触发 `commit-note` skill；推荐口令为“执行提交指令”。
6. UI 设计规范采用“双层文档”：
- 快速入口：`.lab/specs/ui.md`（仅保留 checklist 与链接，不重复细则）
- 详细真相：`.lab/specs/18-ui-design-system-execution-v1.md`（唯一可定义 UI 规则的文件）

## 迭代日志规则（强制）
1. 迭代日志采用“每次提交一个文件”，禁止继续把完整记录堆积到单一大文件。
2. 文件路径固定为 `.lab/agent/iteration-log/entries/YYYYMMDD-HHMM-<slug>.md`。
3. `.lab/agent/iteration-log.md` 仅作为索引入口，内容保持精简（最近摘要 + 文件清单）。
4. 每次新增迭代文件后，必须同步更新索引；未更新索引视为记录不完整。
5. 历史大文件仅允许放在 `.lab/agent/iteration-log/archive/`，不得继续追加写入。
6. 同一会话内连续小改不单独记日志，提交时统一汇总为一条提交日志。

## 文档最小化治理（强制）
1. 默认入口仅 `AGENTS.md`；其他文档按需读取，不做会话启动必读。
- `current-phase.md`（现作为当前执行轨道文件）不再是默认启动入口，仅在用户明确要求查看当前轨道时读取。
- `.lab/agent/windows-preview.flag` 是执行开关，不是任务文档；当任务涉及验证策略判断时读取。
- `.lab/agent/TODO.md` 是未完成工作的唯一真实来源；用户提供新任务/新反馈，或新会话首条有效指令为“继续”时读取并更新。
- `.lab/agent/DONE.md` 仅在需要确认最近完成项、整理提交说明或会话收尾时读取并更新。
2. 保留三份核心文档用于按需场景：
- `AGENTS.md`（执行规则）
- `.lab/agent/TODO.md`（未完成任务台账）
- `.lab/agent/DONE.md`（完成任务记录）
3. 不再维护独立 handoff 文档或 `LATEST` 指针；会话交接统一回写到 `TODO.md` / `DONE.md`。
4. 其他文档默认视为归档资料，不在每次任务中全量阅读，仅按需检索。
5. 单一主题只能有一个“真相文件”，其他文件只允许引用，不允许重复定义规则。
6. 新增文档必须注明“替代了哪个旧文档”或“为何不能复用现有文档”。
7. 每周至少一次文档收敛：合并重复、归档过期、删除冲突说明。
8. Agent 默认阅读顺序为：`AGENTS.md`；仅在需要任务上下文时读取 `TODO.md`，必要时补 `DONE.md`。
9. `.lab/**` 被忽略是有意设计：默认不提交执行过程文档；禁止使用 `git add -f` 强制提交 `.lab/**`，除非用户在当次会话中明确要求纳入版本管理。

## “继续”对齐协议（强制）
1. 仅当“新会话/新进程”的首个有效指令为“继续”时，才读取 `.lab/agent/TODO.md`，必要时补读 `.lab/agent/DONE.md` 与最近提交记录恢复上下文。
2. 在同一会话进行中，用户再次输入“继续”仅表示“继续当前上下文任务”，不得重新读取台账去抢占当前任务。
3. 触发恢复流程后，必须核对最近提交记录（至少 `git log --oneline -n 5`），确认 TODO 首项与 DONE 最近记录没有被后续提交覆盖。
4. 在任何代码改动前，必须先向用户发送“准备实施清单”（本轮拟做 1 个最小任务 + 验收标准 + 不做项），等待用户确认对齐。
5. 若用户未确认或提出修正，先更新 TODO 与清单再实施；禁止按旧理解直接开工。
6. 仅在用户确认后进入实施与验证；实施后如任务已完成则从 TODO 移除并迁入 DONE；若已实现但仍待确认，则留在 TODO 的“待验证”区。
7. 例外：当任务来源是 `agent loop` / `full-auto` / 无人值守自动执行时，若“待办”首条为 `[auto]`，禁止输出“准备实施清单”或任何等待用户确认的话术；必须直接按该主线 `[auto]` 最小任务实施、验证并提交。若“待办”首条为阻塞型 `[gate]` 且人工暂时无法处理，则允许改为执行“可选”区首条 `[auto]`。
8. 上述自动执行例外仅适用于 `[auto]`；`[gate]` 任务、用户明确要求先对齐范围的任务、以及缺少关键外部信息会导致高风险误改的任务，仍必须停在人工确认点。执行“可选”区任务时，仍必须满足“不影响当前主线验收口径”的约束。

## 任务台账规则（强制）
1. `.lab/agent/TODO.md` 是所有未完成工作的唯一真实来源。
2. `.lab/agent/TODO.md` 必须分为“待办”“待验证”“可选”三区；“待办”承载当前主线，“待验证”表示已实现但仍待验收、观察或用户确认，“可选”承载在不影响当前主线前提下可由自动化先行消化的低抢占任务。
3. `.lab/agent/DONE.md` 是已完成工作的追加式记录。
4. `.lab/agent/TODO.md` 与 `.lab/agent/DONE.md` 的条目正文默认统一使用中文；仅代码标识、命令名、路径、协议字段等必须保留英文的内容可内嵌英文。
5. “待办”“待验证”“可选”三区中的每条任务都必须以执行模式前缀开头，且首标签只能是 `[auto]` 或 `[gate]`；禁止省略，禁止用其他方括号标签占用首位。
6. `[auto]` 仅表示可由 CLI / 脚本连续完成并自行验证的任务；默认不依赖人工点击、人工观察或 Windows 人工验收。
7. `[gate]` 仅表示必须人工介入、人工观察、外部确认或显式暂停等待的任务；凡需人工 Windows 预览、肉眼确认、交互体验判断的任务，一律标记为 `[gate]`。
8. 任务内容分类不得再使用方括号前缀与执行模式并列；如需标注领域，统一写成普通文本前缀，例如 `infra:`、`editor:`、`review:`。
9. 拆任务时，必须先按“是否可纯 CLI 完成”切分，再按功能子项细化；禁止把自动化步骤与人工验收混写在同一条任务中。
10. 当用户提供新任务、新反馈或实施中发现新的结构性问题时，必须先更新 `.lab/agent/TODO.md`，再开始实施或汇报。
11. 当某条任务已实现并完成最小相关验证，且没有被显式保留在“待验证”区时，必须立即从 `.lab/agent/TODO.md` 移除，并追加记录到 `.lab/agent/DONE.md`。
12. 读取 `.lab/agent/TODO.md` 时，默认只应看到尚未完成的任务；不得把已完成任务继续留在“待办”区充当历史记录。
13. 对当前改动有直接阻塞或高复发风险的结构性问题，默认应提升到 TODO 更高优先级；不得只在口头汇报中提示而不落库。
14. `.lab/**` 台账文件默认不纳入版本管理；仅在用户明确要求时才允许提交。
15. `[auto]` 任务文案必须能被无人值守执行，不得隐含“先与用户确认范围/方案/验收口径”的前置条件；若存在该前置条件，必须先拆出单独 `[gate]` 条目或改写为更小的纯自动化任务。
16. “可选”区只允许放不会改变当前主线验收口径、不会抢占当前主目标、且可独立验证回退的小任务；典型包括补回归、样本夹具、模型抽象、脚本/诊断增强、文档收敛。
17. 当“待办”首条为 `[gate]` 且人工暂时无法处理时，允许自动化改为执行“可选”区第一条 `[auto]`，以避免空转；但一旦人工 gate 可继续，必须立即回到主线，不得长期绕行。
18. 会话交接统一通过更新 `TODO.md` / `DONE.md` 完成：未完成项留在 TODO，已完成项迁入 DONE，下一轮所需的根因、证据、命令和风险直接写进相应条目；禁止再创建独立 handoff 文档或 `LATEST` 指针。
