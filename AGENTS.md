# AGENTS

若存在同目录 `AGENTS.local.md`（本机私有，不进入版本库），与本文件同时读取；子目录同理。

## Decision Order

- 结果由用户当次最新指令定义；已有审定方案只补充用户已批准的稳定目标，不得扩张授权。代码、测试、fixture 或 controller 不能借当前实现改写目标；现场证据若证伪正式合同，停下交用户。
- 执行路线先保护用户数据、安全、`dev` 源码真相和结果真实性，再以已核实的当前现场事实选择路径；条件保护只有触发证据成立时高于实现偏好。在这些约束内，默认选择最快、最短、成熟且可复验的路线。
- 规则适用顺序是：根的跨仓硬边界与机械入口由局部规则细化，局部规则由当前任务和现场条件触发；计划只定义目标语义，不能反向定义当前事实。
- 条件保护必须保留条件语气；触发证据不存在或失效证据成立时，不得继续按永久禁令执行。计划、交接与执行不得把“当……时 / 仅在……下”加强成无条件“必须 / 不得”。实现偏好可被更短且同样可靠的成熟路线替换。

## Repository And Work Unit

- 当前仓库是 `Electron + React + TypeScript + Vite + Capacitor` 多平台单仓；`electron/`、`android/`、`ios/` 只承载薄宿主，`src/app/` 与 `src/companion/` 承载 renderer shell，跨宿主业务、状态与稳定调用面归 `src/features/`、`src/store/`、`src/shared/`。
- 单次交付一个可运行、可验证、可回退的能力闭环；闭环按用户结果、数据语义或迁移语义划分，不按文件、测试、平台、提交数或耗时拆分，也不混入无关重构。
- 产品任务不附带控制面建设。控制面按用途指管理开发、验证、验收或代理执行的 validator、controller、orchestrator、gate、monitor、协议、扫描器与通用工作流，不包括产品运行必需的输入校验、业务控制器或 bridge。新增或扩展控制面，须由用户当次明确要求，或已批准方案明确列为可独立命名、说明收益和验收的交付结果；“完善验证、保证闭环”等泛称不构成授权。
- 产品闭环可运行已有入口、补充最小行为测试及必要 fixture，并修复本轮引入的工具回归以恢复原合同；不借修复扩展工具职责。若删除拟新增的控制机制仍不影响产品目标及数据/安全不变量，其收益应独立说明，不能借“必要实现”带入。每项改动须直接服务用户结果、必要实现或最小行为验证，无须另建归因台账。未授权控制面缺口只作独立待办，可继续的产品工作继续，确实阻断验收时报告待验与具体缺口，不擅建控制面或宣称通过。
- 共享目标是“共享核心 + 薄宿主适配”；平台差异进入 `src/shared/platform/**` 或对应宿主，不在 feature/store/editor 业务逻辑中复制平台分支。正式图标、菜单与命令必须同源、同名。

## AGENTS Routing

- 启动时先读根 `AGENTS.md`；触及下列范围时再读最近的局部规则。局部规则只细化其路径，不得覆盖根的跨仓硬边界；同层冲突先停下确认 owner。

| 触及范围 | 局部规则 |
| --- | --- |
| `electron/**`、`scripts/desktop/**`、`scripts/macos/**`、`scripts/windows/**`、`playwright.desktop.config.ts`、桌面数据库或运行链路 | `electron/AGENTS.md` |
| `android/**`、`scripts/android/**`、`capacitor.config.ts` | `android/AGENTS.md` |
| `ios/**`、`scripts/ios/**` | `ios/AGENTS.md` |
| `src/companion/**` | `src/companion/AGENTS.md` |
| `src/features/editor/**` | `src/features/editor/AGENTS.md` |
| `src/app/components/**` | `src/app/components/AGENTS.md` |

- 跨多个范围时读齐相关局部规则。脚本路径域以 `scripts/lib/path-domains.mjs` 为机械真相；质量、preview、lint 和 pre-push 不另建路由表。

## Read Before Editing

- `docs/i18n/guides/**`：先读 `docs/i18n/guides/README.md`；英文 `en` 是必需源。Demo 可提供浏览器预置体验，但不得暗示为 Web 版、正式数据环境、桌面替代品或长期在线工作区。

## Risk Routing

- sync、schema/migration、preload/IPC/native bridge、Capacitor/宿主生命周期、review queue、delete/restore、import/reimport、持久化、冲突、安全边界、不可逆数据与人工验收失败复修属于高风险触发；评估中建议 High/XHigh，并按适用局部规则核对官方来源。
- 扫描、轮询、自造协议、新依赖、长期双写、运行时迁移、隐式 fallback、局部复制或先污染后清理若成为拟议主路线，先说明其身份、触发证据和退出条件并等待用户确认。

## Architecture And Data

- 排查非显然 bug 时先取现场证据；根因必须同时解释触发条件与对照条件。现场与代码推断冲突时，以现场为准；限制输入、延迟、跳过或加锁避让只有明确标为诊断、spike 或临时兜底时才可采用。
- 新跨边界能力先定义或复用稳定 bridge/contract，再接宿主；UI/feature/store 不得新增底层直连。全局设置不得进入 `WorkspaceLayoutProps` props 链；编辑器能力经 `EditorAdapter` 暴露。
- 用户可感知且影响重启后结果、队列、图标、过滤、调度、统计或后续行为的状态默认是永久态；必须覆盖 renderer 写入、bridge/runtime sync、持久化与 hydrate。只有弹窗、hover/focus、当前会话游标、瞬时滚动/选区等纯 UI 过程量可不持久化。
- 数据、同步、合并与冲突处理必须可恢复且不得静默覆盖。不可替代原始事实受保护；可重建副本与明确退役旧状态不得诱发长期双读双写、自动探测回退或运行时兼容迁移，除非用户明确要求。

## Quality And Tests

- 使用 `npm` 与 `package.json` 中登记的入口，不用不存在的 `npm test` 兜底，也不得降低检查标准。普通本地优先 `npm run quality:fast`，或显式 `npm run test:files -- <files>`、`npm run test:sqlite:electron -- <files>`、`npm run lint:files -- <files>`。
- `test:changed`、`quality:desktop`、`quality:android`、`quality:shared`、`quality:full`、`quality:release`、`quality:ios*` 只在 hosted lane 执行。`scripts/quality/quality-command-contracts.mjs` 是命令分类真相；dev hosted recheck 只用 `npm run quality:remote -- --scope <desktop|shared|android|ios|full>`。
- 测试按风险分档，由 Agent 在每个闭环自行决定，不逐个请用户确认：触及 Risk Routing 所列高风险范围的行为，使用真实 SQLite 或生产链路的集成测试；其他新增或改变的可观察行为维护一个最小、独立于实现方式的测试 contract；纯文案/视觉若无稳定自动化 contract，按宿主规则做可见验收并说明跳过测试原因。修复任何来源（本地、远程、真机、用户）发现的 bug 都补一个修复前会失败的回归测试。证明本次差异的测试应因旧行为不符合目标而失败、因新行为符合目标而通过，不能以缺少新 helper 或文件代替行为失败。保护未改变行为的回归测试可以前后都通过；无法安全复跑旧版时如实说明证据限制。不以 DOM 顺序、坐标、像素、当前文案分组或文件数量固化偶然结构，也不由测试合同推导控制面建设授权。
- 测试只在以下情形删除或合并：与另一测试守同一 contract；守已退役语义；反复不稳定且当轮无法修复（先按 skip 规则标注，30 天内修复或删除）；只锁函数名、源码文本或偶然结构。删除时在提交的 `context` 写明它守的 contract 现由哪个测试覆盖；不得为缩短运行时间删除唯一守着某 contract 的测试。
- **本地行为测试门槛**：本轮全部适用本地行为测试必须通过。Agent 主动从本轮验收目标确定场景，不等待用户指定测试方法；所有可本地复现的场景须覆盖初始状态、操作序列和结果断言。涉及多实例交互时，使用独立实例与临时数据运行生产链路的确定性集成测试，断言各端最终持久化结果；不得用 mock 替掉本次待验证链路。单元测试、lint、构建或独立原型通过不能替代该集成覆盖。“全部”限本轮验收范围，不要求每次全仓测试。
- 新增/拆分文件或修复规模问题时先跑 `node scripts/check-file-budget.mjs <files>` 再跑窄 lint。新增/升级依赖由 hosted `deps:hardening:check` 覆盖；已点名漏洞可定向绕过 release-age 窗口并用 `npm ls` 与 `npm audit --omit=dev` 复验。
- `it.skip` / `test.skip` 必须紧邻 `// SKIP: <reason> | <date YYYY-MM-DD> | revive: <condition>`，超过 30 天复查。E2E 不进入质量闸，按宿主局部规则单独执行。
- 测试耗时与超期 skip 只记录和报警，不限制开发：hosted 耗时摘要在总耗时或单个 job 比最近成功运行慢 25% 以上且至少 1 分钟时标出报警，skip lint 报告超过 30 天的 skip，二者都不改变质检结论。

## Structure, Language, And Files

- 单文件目标不超过 220 行，超过 260 行必须拆分；单函数目标不超过 40 行，超过 60 行必须拆分。规划列出候选文件后先运行 `node scripts/check-file-budget.mjs <files>`；删除、搬移或微修可继续处理被判 `split` 的原文件。
- 每个文件只承载一个核心职责；不得用压缩格式、合并语句或删留白规避规模约束。
- 代码、注释、提交信息、UI 文案与配置键使用英文；对外沟通默认中文。
- 临时 HTML、截图、样例、日志、一次性产物放 `.tmp/artifacts/`。只有 Foliole 自管且可重建的跨运行缓存可放根 `.cache/`；不得枚举或清理不属于当前任务的缓存。
- 全仓临时产物与缓存清理独立于 DEV 启动、构建、缓存准备和验收。仅在没有构建或验收运行时按需显式执行：普通临时产物先运行 `node scripts/diagnostics/cleanup-local-artifacts.mjs --dry-run`，核对候选后用 `--apply` 替换 `--dry-run`；缓存及验收产物先运行 `node scripts/diagnostics/local-artifact-cache-retention.mjs`，核对候选后加 `--apply`。临时 worktree 使用其登记入口的 `sweep`，不由普通目录清理代替。
