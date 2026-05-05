# AGENTS

- 若规则与用户当次最新指令冲突，以用户最新指令为准；若与当前代码现状冲突，以可运行代码现状为准。

## Project Baseline

- 当前仓库是多平台单仓：`Electron + React + TypeScript + Vite + Capacitor`。
- 当前已存在的主要宿主与表面为：`electron/`、`android/`、`src/app/`、`src/companion/`、`src/shared/platform/`。
- 默认按 Track-Based 迭代推进，以“当前主目标 + 最小可验收任务”为单位。
- 默认在 `dev` 主干连续小步迭代；不创建 feature branch / worktree，除非用户明确要求。
- 单次只做一个 30-90 分钟内可运行、可验证、可回退的最小任务；禁止混入无关重构。
- 共享目标是“共享核心 + 薄宿主适配”，不是为每个平台复制一套业务逻辑。
- 所有正式图标入口、正式菜单入口默认都必须有对应命令；设计与实现时必须从“图标 / 菜单 / 命令同源且命名一致”出发，禁止先做孤立入口、后补命令。详见 `.lab/specs/_product/methodology.md`。

## AGENTS Routing

- 启动时先读根 `AGENTS.md`。
- 根 `AGENTS.md` 负责全仓硬规则与路由；平台与局部细则下沉到对应目录的 `AGENTS.md`。
- 只要任务触及下列路径，实施前必须按路由补读对应规则来源，并在该规则基础上执行：
- `electron/**`、`scripts/windows/**`、`playwright.desktop.config.ts`、`D:\X\U\Foliole\Data\foliole.db` 相关诊断或桌面运行链路：读取 `electron/AGENTS.md`
- `android/**`、`scripts/android/**`、`capacitor.config.ts`：读取 `android/AGENTS.md`
- `src/companion/**`：读取 `src/companion/AGENTS.md`
- `ios/**`：读取 `ios/AGENTS.md`
- `src/app/**`：当前没有单独局部 `AGENTS.md`，继续直接执行根 `AGENTS.md` 的 desktop renderer 规则
- `src/features/**`、`src/store/**`、`src/shared/**`：当前没有单独局部 `AGENTS.md`，继续直接执行根 `AGENTS.md` 的 shared / cross-host 规则
- 若一次任务同时跨多个宿主或表面，必须把相关局部 `AGENTS.md` 全部读齐；冲突时按“更靠近改动目录的规则优先，跨目录共享规则回退到根规则”执行。
- 关键平台约束必须落在根或对应目录 `AGENTS.md`，不得只放在普通项目文档里。

## Document Read Order

- 启动时只读 `AGENTS.md`。
- 任务涉及 renderer UI 改动（`src/app/**`、`src/companion/**`、`src/features/**`、`src/shared/ui/**`）时，实施前必须先读取 `DESIGN.md`，再读取 `.lab/specs/shared/ui/llm-ui-rules.md`。
- 任务涉及 UI 文案、产品对象命名、空状态、按钮、菜单、队列与阅读单元称呼时，实施前必须读取 `.lab/specs/_product/terminology-and-copy.md`。
- 任务涉及具体现有规范时，按需读取对应 `.lab/specs/**` 条目，不全量通读。
- 任务涉及新增、重写或审计 agent 规则时，按 `$agents-maintainer` 流程只审根与局部 `AGENTS.md`；不默认扫描其他项目文档。
- 仅在判断验证或停车策略时读取 `.lab/internal/runtime/windows-preview.flag` 与 `.lab/internal/runtime/park.flag`。

## Task Execution

1. 任务开工判断是首个动作规则：在第一次读文件、跑命令或改代码前，必须把最新用户请求归类为以下四类之一：
   - `DIRECT`：范围清楚、低风险、局部改动，直接实施，不额外汇报开工判断。
   - `FOLLOW_PLAN`：用户指定了实施说明或本轮是“继续主线”，先读取对应实施说明；若其中已有任务评估，按评估执行。
   - `NEEDS_EVAL`：没有实施说明 / 没有评估，且任务明显越过局部修复，先补轻量任务评估，再实施。
   - `STOP_CONFIRM`：命中强制停工模式或边界仍不清楚，先说明并等待用户确认。
2. 开工判断只有 `DIRECT` 可以静默执行；`FOLLOW_PLAN` 必须先读取实施说明；`NEEDS_EVAL` 必须先输出轻量任务评估；`STOP_CONFIRM` 必须先等待用户确认。
3. 轻量任务评估必须直接写出 5 项：`任务类型`、`影响范围`、`已定路线`、`拒绝路线`、`停工点`。缺任一项，不算完成评估。
4. 用户只给短标题、笼统“继续 / 修一下 / 处理一下”时，按固定顺序解析任务：本轮消息明确点名的文件 / 实施说明 > 本轮打开的 active file 若是实施说明 > 最近一条未完成的用户明确指令。仍无单一任务时，只问一个澄清问题；禁止从 open tabs 或历史任务中自行挑选。
5. 需求、边界、验收标准或预期行为存在歧义时，必须先向用户澄清；若根因未确认，只能写“现象 + 当前怀疑 + 待确认点”，禁止把猜测写成事实。
6. 写实施说明时必须写实施评估；执行实施说明时必须先查评估并遵守；没有评估且任务明显越过局部修复时，必须先补轻量任务评估。细则见 `.lab/specs/_governance/task-evaluation-expectation.md`。
7. 若方案包含扫描、轮询、自造协议、新依赖、长期双写、运行时迁移、隐式 fallback、局部复制或先污染后清理，必须进入 `STOP_CONFIRM`，说明方案身份是正式主方案、spike、诊断、兜底还是一次性迁移工具。
8. 执行中出现以下任一可观察变化时，必须停下进入 `NEEDS_EVAL` 或 `STOP_CONFIRM`：预计改动超过 3 个文件；新增 schema / bridge / IPC / 协议 / 依赖 / 后台任务；新增 fallback / migration / 双写 / scan / poll 代码；改动跨两个以上宿主或目录层级。
9. 只有用户明确要求 spike，或任务评估把某段代码标为 spike / diagnostic / fallback / one-off migration 时，才允许写临时验证代码；否则临时代码不得接入正式入口。

## Architecture And Troubleshooting

- 实体先于表象：禁止从表现层或派生现象反推系统真相；若缺少核心状态的独立表达，先补实体，再写逻辑。
- 抽象先于补丁：一旦问题开始依赖局部修补才能成立，默认视为抽象缺失；必须先回到模型与边界，禁止在症状层反复加补丁。
- 生产与消费分离：状态应在其自然生命周期内被维护；任何切换、恢复、同步、进入或退出动作都只能消费状态，不得临时生成状态。
- 动手前先自问：我依赖的是系统中的真实对象，还是由其他现象推出来的影子；如果是后者，先停下，回到源头。
- 共享业务规则、数据语义、review 语义与同步语义优先收敛在共享层；宿主目录只保留 runtime glue、生命周期与平台集成。
- Android / companion 默认只允许保留移动端特有的 surface 组织、触屏手势、移动信息密度与宿主接缝；凡是 desktop 与移动端名称相同、职责相同或用户会感知为“同一个能力”的表面与交互语义，默认视为共享能力，必须先抽共享真相，再由宿主消费；禁止把共享能力伪装成“移动端页面”长期留在 `src/companion/**`。
- 若 desktop 已存在可运行的业务流程、状态推进、队列构建、动作语义或持久化闭环，新增 Android / companion 能力时必须先评估能否直接复用该真相；能复用时，先让 desktop 与新宿主共同依赖共享实现，再做宿主表面接线；禁止只在新宿主复制一套“看起来一致”的逻辑。
- 禁止把平台分支判断散落到 `src/features/**`、`src/store/**` 或编辑器业务逻辑中；平台差异优先放到 `src/shared/platform/**` 或对应宿主目录。
- 若新增平台能力，先补 stable bridge / contract，再接宿主实现；禁止先把宿主 API 直接漏进业务层。
- 不要求在 Android 开工前预先把“所有桌面能力”一次性抽到共享层；正确顺序是按当前任务所需能力做最小共享化，先证明共享抽象被 desktop 消费，再接入其他宿主，避免空抽象和大搬运。

## Quality Gates And Validation

- 不允许通过降低检查标准过关；禁止跳过关键检查、删除校验或用注释掩盖失败。
- 包管理器必须按锁文件检测；当前仓库以 `npm` 为准。
- 当前仓库没有强制 git hooks / CI 兜底；质量闸由执行者按任务范围主动选择并运行，不得假设提交或推送时会自动补跑。
- 默认先执行与本次改动直接相关的最小验证；只有当改动范围或技术风险超过“相关验证”覆盖面时，才升级到宿主 / 共享质量闸。
- 相关最小验证默认由与改动直接对应的 `eslint`、`vitest`、局部 `tsc`、宿主链路 smoke test 与必要预览组成，而不是默认整仓或整宿主全跑。
- 质量闸属于升级入口，不是每个最小任务的默认动作；满足条件时按范围选择：`npm run quality:desktop`、`npm run quality:android`、`npm run quality:android:device`、`npm run quality:shared`、`npm run quality:full` 或 `npm run quality:fast`。
- `quality:desktop` 适用于桌面多子系统联动、构建链 / preload / IPC 根链路 / sqlite 迁移，或相关验证不足以覆盖风险的场景。
- `quality:android` 适用于移动宿主联调、Capacitor 宿主 / bridge 根链路调整，或相关验证不足以覆盖风险的场景；权限、生命周期、插件、intent、安装 / 启动链路或设备侧问题升级到 `quality:android:device`。
- `quality:shared` 适用于共享 contract / 构建根链路 / 跨宿主脚本调整，或相关验证不足以覆盖风险的场景；`quality:full` 只用于用户明确要求、依赖 / 构建根链路、广泛跨宿主联动或无法证明单宿主影响的场景。
- `quality:fast` 仅作为通用自动选择入口；多平台任务汇报默认说清实际宿主 / 共享质量入口，不只写 `quality:fast`。
- 若只做相关最小验证，必须优先选择与改动文件、改动链路、复现场景直接对应的检查命令；最终汇报默认不列测试命令，除非失败、用户追问、或该命令本身就是用户验收所需信息。
- 只有当你主动执行了某个质量闸，且该质量闸暴露的问题与本次改动链路、当前宿主或被选中的验证范围直接相关时，当前任务才需要顺手清掉这些红灯；禁止因为误触发过重质量闸，就把全仓无关红灯一并卷入当前最小任务。
- 可复现 Bug 修复前，优先先补复现测试，再修复并验证测试通过；若暂时无法自动化复现，必须先说明原因，并补充可执行的人工验证步骤。
- 任意可复现 Bug 修复必须新增至少 1 条自动化回归测试；没有回归测试不算完成。
- 重构、模块迁移、preload / bridge 改动、Capacitor bridge 改动与宿主生命周期改动视为高回归风险，提交前必须补齐或更新关键回归测试。
- 新增或升级 npm 依赖时，除常规质量闸外，必须额外执行 `npm run deps:hardening:check`；不得只凭口头说明或文档勾选完成。
- 对话协作模式下，只要本轮实际修改了任何仓库文件，则在相关验证通过后、向用户汇报前，必须追加执行至少一个与受影响宿主匹配的预览。
- 预览选择规则如下：
- 影响 Electron / Windows / preload / IPC / sqlite / desktop runtime：执行 `npm run windows:preview`
- 影响 `src/companion/**`、`android/**`、`capacitor.config.ts`、移动 bridge 或移动运行链路：执行 `npm run android:preview`
- 同时影响桌面与移动共享链路时，必须分别执行 `npm run windows:preview` 与 `npm run android:preview`，除非用户明确豁免其中一侧
- 自动任务模式默认不追加预览，只执行任务所需的最小验证；除非用户在当次明确要求，才额外执行预览。
- 预览成功时，最终汇报末行只写 `pushed`；预览失败或未执行时，不能写 `pushed`，必须在 `R` 里写清失败阶段、失败原因或未执行原因。
- 最终汇报面向用户验收，不面向代码审计；必须简明扼要，默认使用下面四个字段组织信息，除非用户明确要求展开：
  `C：...`
  `V：...`
  `R：...`
  `pushed`
- 每个字段默认最多一句话；信息确实放不下时允许在对应字段内加短句，但禁止追加总结、解释段、命令列表、文件列表或客套话。
- `C` 只写用户可理解的结果，不写函数名、字段名、路径、命令或实现细节；句式按“某个用户问题现在会怎样”写，例如“安卓同步前会先留一份手机本地库备份”。
- `V` 只写用户能在客户端里看到或操作验证的产品现象；不要写预览命令、`status`、测试命令或内部字段。
- `R` 只承载本轮交付后用户会实际遇到的未完成、失败、测试没过、预览失败、数据 / 安全影响、技术债和能力边界；不得把尚未开工、未纳入本轮承诺、也未被本轮改动破坏的未来平台、可选后续或“后续需要 / 后续可 / 建议下一步”这类计划句写成风险。成功且无实质风险时写“无已知阻塞”。
- `pushed` 只能是单独一行的状态词，不能在后面追加命令、状态字段或说明。
- 这里的 `pushed` 是客户端可查看标记，不等同于 git push。
- 如果任何测试或验证失败，不能把失败写进 `V` 当通过项；必须在 `R` 里写具体失败现象和当前影响。
- 禁止把查看内部返回字段、数据库文件或代码对象作为默认验收方式；用户追问技术细节时再展开。
- “未提交”只在用户要求提交、准备提交或提交失败时汇报。
- 只有需要用户选方向、确认取舍或提供信息时，才写“需要你决定”。
- 不默认写“下一步”；只有存在本轮承诺内未完成项、当前阻塞、实施说明要求停车的明确后续步骤或需要用户当下决策时，才说明后续动作；此类内容必须直接写成阻塞或“需要你决定”，禁止把可选建议伪装成任务主线或塞进 `R`。
- UI 文案术语检查入口为 `npm run copy:guard`；该检查默认只报告 warning，不阻塞质量闸。只有用户明确要求或任务目标是收敛文案术语债时，才使用 `npm run copy:guard:strict`。
- 若 `copy:guard` 报出 warning，修复前必须先读取 `.lab/specs/_product/terminology-and-copy.md`，按术语规则判断后再修改；禁止只根据脚本命中词机械替换。
- `build` 仅在用户明确要求执行构建、或当前任务已触及依赖 / 构建根链路且必须验证构建结果时执行；对应入口为 `npm run quality:full` 或交付脚本。

## Decision Escalation And Official Sources

- 技术比选、中风险及以上改动、以及“声称修复但人工验收仍失败”的问题，实施前必须核对官方文档与最佳实践。
- 这类回复必须包含：`已核对来源`、`根因判断`、`修复策略`。
- 涉及 Electron preload、`contextBridge`、`ipcRenderer`、`window.electronAPI` 的改动，必须先核对 Electron 官方 `sandbox` / `contextIsolation` 边界。
- 涉及 Capacitor bridge、插件、`@capacitor/core`、Android / iOS 宿主生命周期或原生权限的改动，必须先核对 Capacitor 官方平台边界与对应平台官方文档。
- preload 改动必须带一条“sandbox 受限 require 环境下 bridge 仍可暴露”的自动化回归测试。
- Capacitor bridge 改动必须带一条“Web 层经 bridge 调用仍可在宿主侧落地”的自动化回归测试；若暂时无法自动化到原生层，至少补充到 contract / payload 层并给出人工验证步骤。

## Structure And Code Constraints

- 目录基线：`src/app`、`src/companion`、`src/features`、`src/shared`、`src/store`、`electron`、`android`；`ios` 在接入时沿用同级宿主目录。
- `src/app` 只承载 desktop renderer shell；`src/companion` 只承载 companion renderer shell；禁止重新混回单入口。
- `src/features`、`src/store`、`src/shared` 默认按跨宿主共享层治理；若未来需要更细目录规则，应在对应目录新增局部 `AGENTS.md`，而不是继续把路径归属留空。
- `electron/` 只承载 Electron main、preload、IPC、桌面 runtime glue。
- `android/`、未来 `ios/` 只承载原生宿主工程与平台资源；禁止把共享业务逻辑塞进原生目录。
- 单文件目标 <= 220 行，硬上限 > 260 行必须拆分。
- 单函数目标 <= 40 行，硬上限 > 60 行必须拆分或提取子函数。
- 遇到 `max-lines`、`max-lines-per-function` 等规模约束时，禁止通过压缩格式、合并多条语句到单行、删除必要留白等方式规避；必须通过拆函数、拆组件或拆文件解决。
- 每个文件只承载一个核心职责；禁止把 UI、数据访问、业务规则长期混写。
- 复杂逻辑优先模块化拆分；禁止用极端紧凑写法规避规模限制。
- 全局设置不得进入 `WorkspaceLayoutProps` 或 workspace 中间层 props 链；新增全局设置默认走统一 settings provider，由设置页和实际消费位置直接读取。
- 编辑器能力通过 `EditorAdapter` 暴露；状态与存储在领域层统一管理。

## Data And Compatibility

- 未发布阶段若需要一次性迁移旧数据，默认使用仓库外人工操作或一次性脚本处理，不把这类迁移长期写进应用启动 / runtime 代码；除非用户当次明确要求保留应用内迁移。
- 语法升级只保证新写入 / 新编辑路径符合当前规范，不做历史语法迁移。
- 数据格式切换不进入产品代码；转换由人工离线一次性完成，禁止长期双写、双读、运行时迁移与自动探测回退。
- 所有关键数据变更优先可恢复，避免不可逆破坏。
- 涉及同步、跨宿主数据合并或冲突处理时，必须保证可回退，禁止静默覆盖冲突。
- 默认将用户可感知、会影响后续行为的状态视为永久态；禁止先按“临时态”假设实现，再靠后续补持久化。
- 仅纯 UI 过程量允许不落持久化，例如弹窗开关、hover / focus、一次性展示态、当前会话游标、编辑器瞬时滚动与选区；除此之外默认都必须持久化。
- 凡是会影响重启后结果、后续队列构建、节点图标、过滤条件、调度结果、统计口径或“该节点以后会怎样”的字段，一律按永久态处理，必须同时完成 renderer 写路径、bridge / runtime sync 与存储 hydrate 闭环。
- 页面内即时表现正确但重启后丢失的实现，视为未完成，不得汇报为“已修复”。
- 新增或修改状态字段时，任务说明与实现前必须先声明该字段属于“纯 UI 过程量”还是“永久态”；若未明确证明为前者，默认按永久态处理。

## Language, Docs, And Commits

- 代码、注释、提交信息、UI 文案、配置键名统一使用英文；对外沟通与执行汇报默认中文。
- `.lab/specs/**` 文件名使用英文 slug，正文默认中文；其他落库文档默认中文，除非用户明确要求英文。
- 新增 spec 默认采用“主题分组 + 组内小文件”，避免继续新增超长单文档。
- 旧 spec 不做全量回拆；仅在当前任务直接涉及且单文档维护成本已明显过高时，允许局部拆分。
- 任务说明默认引用主题入口文档，不直接罗列大量碎文件。
- 文档拆分目标是降低修改成本与歧义，不以原子化本身为目标。
- 重要边界决策与异常处理结论写入 `.lab/specs/**` 或迭代日志；不要只停留在口头汇报。
- `.lab/**` 全部视为本地工作文档，默认全忽略、不提交；仅当用户在当次会话中明确要求时，才单独调整。
- 用户要求“提交”“commit”“执行提交指令”时，必须使用 `commit-note` skill。

## Detail Pointers

- 开发方法论（BDD、UI 先行、任务拆分顺序）：`.lab/specs/_product/methodology.md`
- 文档治理与准入规则：`.lab/specs/_governance/doc-update-expectation.md`、`.lab/specs/_governance/spec-organization.md`、`.lab/specs/_governance/doc-organization-expectation.md`
- 共享 UI 规范：`DESIGN.md`、`.lab/specs/shared/ui/primitives.md`、`.lab/specs/shared/ui/llm-ui-rules.md`
- 产品术语与 UI 文案规则：`.lab/specs/_product/terminology-and-copy.md`
- Desktop workspace 规则：`.lab/specs/desktop/workspace/shell-layout.md`
- Windows / Electron 开发与启动排障：`.lab/specs/desktop/electron/windows-dev-loop.md`
- 多 target 仓库与 companion 方向：`.lab/specs/_governance/multi-target-repository-expectation.md`、`.lab/specs/architecture/multi-target-repo-layout-expectation.md`
