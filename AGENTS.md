# AGENTS

## Decision Order

- 结果由用户当次最新指令定义；已有审定方案只补充用户已批准的稳定目标，不得扩张授权。代码、测试、fixture 或 controller 不能借当前实现改写目标；现场证据若证伪正式合同，停下交用户并由 `/2` 修订。
- 执行路线先保护用户数据、安全、Mac `dev` 源码真相和结果真实性，再以已核实的当前现场事实选择路径；条件保护只有触发证据成立时高于实现偏好。在这些约束内，默认选择最快、最短、成熟且可复验的路线。
- 规则适用顺序是：根的跨仓硬边界与机械入口由局部规则细化，局部规则由当前任务和现场条件触发；计划只定义目标语义，不能反向定义当前事实。
- 条件保护必须保留条件语气；触发证据不存在或失效证据成立时，不得继续按永久禁令执行。计划、交接与执行不得把“当……时 / 仅在……下”加强成无条件“必须 / 不得”。实现偏好可被更短且同样可靠的成熟路线替换。
- 新增非显然绝对禁令前，必须明确单一 owner、来源、触发条件、失效证据和主要成本；无法说明时，只能写成条件保护或实现偏好。修规则优先删除、压缩、下沉和归一 owner，不另造治理体系。

## Repository And Work Unit

- 当前仓库是 `Electron + React + TypeScript + Vite + Capacitor` 多平台单仓；`electron/`、`android/`、`ios/` 只承载薄宿主，`src/app/` 与 `src/companion/` 承载 renderer shell，跨宿主业务、状态与稳定调用面归 `src/features/`、`src/store/`、`src/shared/`。
- 默认直接在 `dev` 连续小步推进，不创建 feature branch / worktree，除非用户明确要求。Windows 与 LAN Git 日常只消费 Mac `dev` 的精确镜像；用户明确建立的长期专项 branch 只能使用隔离 checkout，不得占用或决定日常源码现场。Windows 不向 Mac 提供、合并或决定源码候选。
- 临时 PR、冻结候选或验收 worktree 必须由 `node scripts/diagnostics/transient-worktree-lifecycle.mjs create --path <path> --kind <development|acceptance> --target <branch>` 创建并登记；development 同时传 `--branch <branch>`。结果进入目标分支或证据收口后，同一流程调用 `finish --path <path>`。异常遗留由正常生产维护触发该入口的 7 天 `sweep`，不得直接删除目录或让 lock 永久保留。
- 正式发布只使用短期 `release` 分支，并按 `foliole-release` skill 执行；禁止版本化 release 分支、cherry-pick、rebase、force-push 和人类 SHA 编排。每个 release 只由一个 pinned 发布主任务持有，公开必须由用户确认。
- 人工创建或交接 Foliole Codex 任务时，使用 saved project 的 local environment；有正式编号时，标题必须原样使用当前工作单元的编号并按实际结果命名，不得退化为 owning plan 总标题；没有正式编号时不得编造编号，直接按实际工作内容命名。同一编号与阶段已有未归档任务时继续原任务，不重复创建。完整提示可读且活动回合已建立后才算交付。自动 monitor 的 paused handoff 只按 `codex-desktop-handoff` skill 执行，根不复述其传输协议。
- 单次交付一个可运行、可验证、可回退的能力闭环；闭环按用户结果、数据语义或迁移语义划分，不按文件、测试、平台、提交数或耗时拆分，也不混入无关重构。
- 共享目标是“共享核心 + 薄宿主适配”；平台差异进入 `src/shared/platform/**` 或对应宿主，不在 feature/store/editor 业务逻辑中复制平台分支。正式图标、菜单与命令必须同源、同名。

## AGENTS Routing

- 启动时先读根 `AGENTS.md`；触及下列范围时再读最近的局部规则。局部规则只细化其路径，不得覆盖根的跨仓硬边界；同层冲突先停下确认 owner。

| 触及范围 | 局部规则 |
| --- | --- |
| `electron/**`、`scripts/desktop/**`、`scripts/macos/**`、`scripts/windows/**`、`playwright.desktop.config.ts`、桌面数据库或运行链路 | `electron/AGENTS.md` |
| `android/**`、`scripts/android/**`、`capacitor.config.ts` | `android/AGENTS.md` |
| `ios/**` | `ios/AGENTS.md` |
| `src/companion/**` | `src/companion/AGENTS.md` |
| `src/features/editor/**` | `src/features/editor/AGENTS.md` |
| `src/app/components/**` | `src/app/components/AGENTS.md` |

- 跨多个范围时读齐相关局部规则。脚本路径域以 `scripts/lib/path-domains.mjs` 为机械真相；质量、preview、lint 和 pre-push 不另建路由表。
- 新增、重写或审计 agent 规则必须使用 `agents-maintainer`；根只保留全仓硬边界、风险/文档触发和机械入口，宿主命令、预览与诊断细节归局部 owner。

## Read Before Editing

- 用户可见布局、信息层级或控件组合：先读 `DESIGN.md`；renderer UI 再读 `.lab/specs/shared/ui/llm-ui-rules.md`。
- UI 文案、产品对象命名、空状态、按钮、菜单、队列或阅读单元称呼：再读 `.lab/specs/_product/terminology-and-copy.md`，并按用户效果、轻原理和内部语言分层；不得从变量、数据库字段、IPC/action 名或临时术语直接生成最终文案。
- `docs/i18n/guides/**`：先读 `docs/i18n/guides/README.md`；英文 `en` 是必需源。Demo 可提供浏览器预置体验，但不得暗示为 Web 版、正式数据环境、桌面替代品或长期在线工作区。
- 具体现有规范按任务需要读取对应 `.lab/specs/**`；不全量通读。只有判断停车策略时才读取 `.lab/internal/runtime/park.flag`。

## Task And Risk Routing

- 第一次读文件、跑命令或修改前，将最新请求判为 `DIRECT`、`FOLLOW_PLAN`、`NEEDS_EVAL` 或 `STOP_CONFIRM`；只有 `DIRECT` 可静默执行。`FOLLOW_PLAN` 先读方案；`NEEDS_EVAL` 先说明任务类型、影响范围、已定路线、边界排除和停工点；`STOP_CONFIRM` 等待用户确认。
- 短标题按“本轮点名文件/方案 > active plan > 最近未完成明确指令”解析；仍无唯一目标时只问一个问题。歧义与未确认根因只写现象、假设和待确认点。
- sync、schema/migration、preload/IPC/native bridge、Capacitor/宿主生命周期、review queue、delete/restore、import/reimport、持久化、冲突、安全边界、不可逆数据与人工验收失败复修属于高风险触发；评估中建议 High/XHigh，并按适用局部规则核对官方来源。
- 扫描、轮询、自造协议、新依赖、长期双写、运行时迁移、隐式 fallback、局部复制或先污染后清理若成为拟议主路线，先说明其身份、触发证据和退出条件并进入 `STOP_CONFIRM`。
- 规划、修订与 owner 裁决只由 `/2` 负责；执行审定闭环只由 `/3` 负责。根不复述阶段、合同轴、交接或完成状态机。
- 未获用户当次授权不得使用子代理。获授权后也只分流边界清晰的只读会诊或机械整改；主进程负责根因、语义、最终 diff、验证与提交收口。

## Architecture And Data

- 排查非显然 bug 时先取现场证据；根因必须同时解释触发条件与对照条件。现场与代码推断冲突时，以现场为准；限制输入、延迟、跳过或加锁避让只有明确标为诊断、spike 或临时兜底时才可采用。
- 新跨边界能力先定义或复用稳定 bridge/contract，再接宿主；UI/feature/store 不得新增底层直连。全局设置不得进入 `WorkspaceLayoutProps` props 链；编辑器能力经 `EditorAdapter` 暴露。
- 用户可感知且影响重启后结果、队列、图标、过滤、调度、统计或后续行为的状态默认是永久态；必须覆盖 renderer 写入、bridge/runtime sync、持久化与 hydrate。只有弹窗、hover/focus、当前会话游标、瞬时滚动/选区等纯 UI 过程量可不持久化。
- 数据、同步、合并与冲突处理必须可恢复且不得静默覆盖。不可替代原始事实受保护；可重建副本与明确退役旧状态不得诱发长期双读双写、自动探测回退或运行时兼容迁移，除非用户明确要求。

## Quality, Acceptance, And Preview

- 使用 `npm` 与 `package.json` 中登记的入口，不用不存在的 `npm test` 兜底，也不得降低检查标准。普通本地优先 `npm run quality:fast`，或显式 `npm run test:files -- <files>`、`npm run test:sqlite:electron -- <files>`、`npm run lint:files -- <files>`。
- `test:changed`、`quality:desktop`、`quality:android`、`quality:shared`、`quality:full`、`quality:release`、`quality:ios*` 只在 hosted lane 执行。`scripts/quality/quality-command-contracts.mjs` 是命令分类真相；dev hosted recheck 只用 `npm run quality:remote -- --scope <desktop|shared|android|ios|full>`。
- 新增或改变可观察行为时维护独立于实现方式仍需长期成立的测试 contract；不以 DOM 顺序、坐标、像素、当前文案分组或文件数量固化偶然结构。纯文案/视觉若无稳定自动化 contract，按宿主规则做可见验收并说明跳过测试原因。
- 运行时或用户可见行为改动必须先完成相关窄验证，再按局部规则完成受影响宿主的可见验收。文档、agent 规则、只读诊断、测试或脚本内部改动且不改变运行时行为时可跳过宿主验收，并在最终汇报说明。
- 本机开发、诊断和提交前宿主试跑可消费当前工作区。最终验收若方案或宿主入口要求冻结候选，必须绑定精确 revision；多宿主结论绑定同一 accepted tip，不得拼接不同 revision 的局部证据。源码、成功判据或会影响结论的基线变化，只使受影响证据失效并从新基线复验；具体方案可明确要求整轮重跑。
- 改 sync-pack 相关 manifest/schema/apply 或登记路径时先跑 `npm run test:sync-pack`。新增/拆分文件或修复规模问题时先跑 `node scripts/check-file-budget.mjs <files>` 再跑窄 lint。新增/升级依赖由 hosted `deps:hardening:check` 覆盖；已点名漏洞可定向绕过 release-age 窗口并用 `npm ls` 与 `npm audit --omit=dev` 复验。
- `it.skip` / `test.skip` 必须紧邻 `// SKIP: <reason> | <date YYYY-MM-DD> | revive: <condition>`，超过 30 天复查。E2E 不进入质量闸，按宿主局部规则单独执行。
- 长命令返回非终态、heartbeat 或仍在运行时使用 `quiet-wait`，不得用 agent 回合轮询。
- 用户明确要求某宿主预览或“阶段验收”时，验证通过后按局部规则执行；Demo 可见改动刷新已打开的 Demo，无法控制时明确报告，不用 Hidden Native 替代。普通情况不读取持久 preview flag 自动开窗。
- 最终汇报默认使用 `C / V / R / pushed`：`C` 写用户结果与已确认根因，`V` 写验证结论或跳过原因，`R` 只写真正剩余风险。证据文件使用绝对路径 Markdown 链接。

## Structure, Language, And Files

- 单文件目标不超过 220 行，超过 260 行必须拆分；单函数目标不超过 40 行，超过 60 行必须拆分。规划列出候选文件后先运行 `node scripts/check-file-budget.mjs <files>`；删除、搬移或微修可继续处理被判 `split` 的原文件。
- 每个文件只承载一个核心职责；不得用压缩格式、合并语句或删留白规避规模约束。
- 代码、注释、提交信息、UI 文案与配置键使用英文；对外沟通默认中文。`.lab/specs/**` 文件名用英文 slug、正文默认中文；其他落库文档默认中文。
- Markdown 工作文档默认放 `.lab/atlas/0active/`，临时 HTML、截图、样例、日志与一次性产物放 `.tmp/artifacts/`。只有 Foliole 自管且可重建的跨运行缓存可放根 `.cache/`；不得枚举或清理不属于当前任务的缓存。
- `.lab/**` 是本地工作文档，默认忽略且不提交。重要且持久的产品边界决策才写入对应 `.lab/specs/**`；不要把背景、施工历史或临时争论写入 AGENTS。
- 用户要求提交时必须使用 `commit-note` skill。

## Detail Pointers

- 方法论与治理：`.lab/specs/_product/methodology.md`、`.lab/specs/_governance/`
- UI 与文案：`DESIGN.md`、`.lab/specs/shared/ui/llm-ui-rules.md`、`.lab/specs/_product/terminology-and-copy.md`
- 宿主架构：`.lab/specs/desktop/electron/windows-dev-loop.md`、`.lab/specs/desktop/workspace/shell-layout.md`、`.lab/specs/architecture/multi-target-repo-layout-expectation.md`
