# AGENTS

- 若规则与用户当次最新指令冲突，以用户最新指令为准；若与当前代码现状冲突，以可运行代码现状为准。

## Project Baseline

- 当前仓库是多平台单仓：`Electron + React + TypeScript + Vite + Capacitor`。
- 当前已存在的主要宿主与表面为：`electron/`、`android/`、`src/app/`、`src/companion/`、`src/shared/platform/`。
- 默认按 Track-Based 迭代推进，以“当前主目标 + 最小可验收任务”为单位，不再以阶段号驱动执行。
- 默认在 `dev` 主干连续小步迭代；不创建 feature branch / worktree，除非用户明确要求。
- 单次只做一个 30-90 分钟内可运行、可验证、可回退的最小任务；禁止混入无关重构。
- 当前主工作台仍是 desktop / Electron，但移动端已进入正式规则范围；禁止再按“桌面唯一宿主”编写新规则。
- 共享目标是“共享核心 + 薄宿主适配”，不是为每个平台复制一套业务逻辑。
- 多宿主任务默认遵循“桌面现成业务语义优先复用”原则：先检查 desktop / shared 现有实现是否已经覆盖该能力；若已存在且属于跨端业务规则，必须先抽到共享层，再由其他宿主接入；禁止在 Android / companion 侧先临时重写一版相近逻辑。
- 除 Android / companion 明确特有的界面形态、触屏交互、宿主能力入口与少量宿主壳布局外，新增移动端能力默认都必须先落到共享层；节点列表、内容列表、breadcrumb 跳转、选择动作、浏览语义、状态切换与其他非宿主专属逻辑，一律先抽象到 `src/shared/**`、`src/features/**` 或现有共享层，再做两端适配；除非用户明确要求或该能力天然只能存在于移动端 / 原生宿主，否则不得先写 `src/companion/**` 私有实现。
- 拆分和排序任务时必须遵循 BDD + UI 先行顺序：先 UI 壳 → 再 bridge / IPC → 最后数据层。每层只做上层要求的事，禁止先做后端再补前端。
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
- 不得把关键平台约束只写在 spec 里却不写进对应目录 `AGENTS.md`。

## Document Read Order

- 启动时只读 `AGENTS.md`。
- 仅当用户在新会话首条有效指令明确说“继续”时，先读取 `.lab/atlas/todo.md`；必要时按需补读 `.lab/atlas/verify.md`、`.lab/atlas/optional.md`、`.lab/atlas/notes.md`、`.lab/atlas/done.md` 与 `git log --oneline -n 5`。
- 任务涉及 renderer UI 改动（`src/app/**`、`src/companion/**`、`src/features/**`、`src/shared/ui/**`）时，实施前必须先读取 `DESIGN.md`，再读取 `.lab/specs/shared/ui/llm-ui-rules.md`。
- 任务涉及具体现有规范时，按需读取对应 `.lab/specs/**` 条目，不全量通读。
- 任务涉及新增或重写 agent 规则、目录式 `AGENTS.md`、规则路由或治理结构时，按需读取 `.lab/specs/_governance/spec-organization.md` 与 `.lab/specs/_governance/doc-organization-expectation.md`。
- 任务涉及台账、继续 / 停车协议等执行细则时，读取 `.lab/atlas/task-protocol.md`。
- 仅在判断验证或停车策略时读取 `.lab/internal/runtime/windows-preview.flag` 与 `.lab/internal/runtime/park.flag`。

## Task Execution

1. 任务来源优先级：用户当次明确指令 > 当前代码现状 > `.lab/atlas/todo.md` 首项。
2. 若用户未给清晰任务范围，先补齐任务说明，再实施；禁止凭短标题脑补。
3. 任务说明至少应覆盖：当前问题或背景、预期目标、影响范围、明确边界、已知约束或依赖。
4. 需求、边界、验收标准或预期行为存在歧义时，必须先向用户澄清；禁止靠猜测开工。
5. 复杂任务、高风险改动或影响范围暂不清晰时，实施前先向用户说明方案并等待批准；范围明确的小任务可直接实施。
6. 当改动预计超过 3 个文件时，优先评估是否应拆成更小的可验证任务；若无法合理拆分，需先说明原因再继续。
7. 若根因未确认，允许写“现象 + 当前怀疑 + 待确认点”；禁止把猜测写成事实。
8. 若本轮入口是“继续”，在选择任务前必须先做台账对账：逐条比对 `todo` 首项、`done` 最近记录与 `git log --oneline -n 5`，必要时再核对 `verify` / `optional`，确认该任务是否其实已完成但未同步。
9. 若 `todo`、`verify`、`optional`、`done` 与最近提交不一致，先更新台账或向用户明确差异，再实施代码任务；禁止跳过对账直接认领下一条。
10. `verify` 仅表示“已实现但仍待复核 / 待人工确认”的备注区，不是默认任务来源；除非用户明确要求补做其中缺口，否则不得把它当作新的实施任务直接开工。
11. 只改当前任务相关文件；发现结构性阻塞时，先写回 TODO，再决定是否提升优先级。
12. `.lab/atlas/todo.md`、`.lab/atlas/verify.md`、`.lab/atlas/optional.md` 共同构成未完成工作的真实来源，其中默认接手入口只有 `todo`；`.lab/atlas/notes.md` 只承载长期备注，`.lab/atlas/done.md` 只记录已完成项；但当“继续”恢复发现台账滞后于代码与提交时，必须先修正台账真相。

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
- 默认先执行与本次改动直接相关的最小验证；只有当改动范围或技术风险超过“相关验证”覆盖面时，才升级到宿主 / 共享质量闸。
- 相关最小验证默认由与改动直接对应的 `eslint`、`vitest`、局部 `tsc`、宿主链路 smoke test 与必要预览组成，而不是默认整仓或整宿主全跑。
- 质量闸属于升级入口，不再是每个最小任务的默认动作；只有满足明确技术条件时才升级：
- `npm run quality:desktop`
- 适用于桌面多子系统联动改动、构建链 / preload / IPC 根链路 / sqlite 迁移、或你无法用相关验证证明影响已被覆盖的场景
- `npm run quality:android`
- 适用于移动宿主链路联调、Capacitor 宿主 / bridge 根链路调整、或你无法用相关验证证明影响已被覆盖的场景
- Android gate 默认同时覆盖 Android host `lint` / unit test、`scripts/quality-gate-*.test.mjs` 回归，以及 companion 当前依赖到的共享 `src/shared/ui`、`src/shared/lib`、`src/shared/commands`、`src/shared/config`
- `npm run quality:android:device`
- 适用于 Android 权限、生命周期、插件、intent、安装 / 启动链路，或问题只会在模拟器 / 设备侧暴露的场景
- `npm run quality:shared`
- 适用于共享 contract / 构建根链路 / 跨宿主脚本调整，或你无法用相关验证证明影响已被覆盖的场景
- shared gate 默认使用 `lint:shared`、`typecheck:shared`、`test:shared`，而不是回退到整仓 `lint` / `typecheck` / `test`
- `npm run quality:full`
- 适用于用户明确要求全量验证、依赖 / 构建根链路改动、跨桌面与移动的广泛联动改动，或你无法证明改动只影响单一宿主
- `npm run quality:fast`
- 保留为通用快速入口，但多平台任务的默认汇报口径应改为上面的显式宿主 / 共享质量入口
- 若只做相关最小验证，必须优先选择与改动文件、改动链路、复现场景直接对应的检查命令；汇报时要明确说明“已执行的相关检查”与“未执行的宿主 / 全量检查”。
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
- 执行 `windows:preview` 后，汇报中必须包含实际命令与最终状态字段：`status: SYNCED` / `RESTART_REQUESTED` / `STARTED` / 失败原因；不得只汇报“已验证”。
- 执行 `android:preview` 后，汇报中必须包含实际命令与最终状态字段：`status: SYNCED` / `OPENED` / `FAILED` 与失败阶段或失败原因；不得只汇报“已验证”。
- 最终汇报默认言简意赅，只说用户关心的结果、必要状态与下一步；禁止套用固定“改动 / 验证”模板，禁止逐条罗列文件路径、函数名、测试命令或实现细节，除非用户明确要求追踪细节，或存在失败、风险、未完成项必须说明。
- `build` 仅在用户明确要求执行构建、或当前任务已触及依赖 / 构建根链路且必须验证构建结果时执行；对应入口为 `scripts/quality-gate.sh` 或交付脚本。

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
- UI 代码禁止新增硬编码颜色、圆角、阴影或间距值；所有视觉值只从 `tailwind.config.js` token 消费。
- 每个文件只承载一个核心职责；禁止把 UI、数据访问、业务规则长期混写。
- 复杂逻辑优先模块化拆分；禁止用极端紧凑写法规避规模限制。
- 全局设置不得进入 `WorkspaceLayoutProps` 或 workspace 中间层 props 链；新增全局设置默认走统一 settings provider，由设置页和实际消费位置直接读取。
- 编辑器能力通过 `EditorAdapter` 暴露；状态与存储在领域层统一管理。

## Data And Compatibility

- 未发布阶段若需要一次性迁移旧数据，默认使用仓库外人工操作或一次性脚本处理，不把这类迁移长期写进应用启动 / runtime 代码；除非用户当次明确要求保留应用内迁移。
- 语法升级只保证新写入 / 新编辑路径符合当前规范，不做历史语法迁移。
- 数据格式切换不进入产品代码；转换由人工离线一次性完成，禁止长期双写、双读、运行时迁移与自动探测回退。
- 所有关键数据变更优先可恢复，避免不可逆破坏。
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
- TODO、台账与任务说明默认引用主题入口文档，不直接罗列大量碎文件。
- 文档拆分目标是降低修改成本与歧义，不以原子化本身为目标。
- 重要边界决策与异常处理结论写入 `.lab/specs/**` 或迭代日志；不要只停留在口头汇报。
- `.lab/**` 全部视为本地工作文档，默认全忽略、不提交；仅当用户在当次会话中明确要求时，才单独调整。
- 用户要求“提交”“commit”“执行提交指令”时，必须使用 `commit-note` skill。

## Detail Pointers

- 开发方法论（BDD、UI 先行、任务拆分顺序）：`.lab/specs/_product/methodology.md`
- agent 台账与执行协议：`.lab/atlas/task-protocol.md`
- 文档治理与准入规则：`.lab/specs/_governance/doc-update-expectation.md`、`.lab/specs/_governance/spec-organization.md`、`.lab/specs/_governance/doc-organization-expectation.md`
- 共享 UI 规范：`DESIGN.md`、`.lab/specs/shared/ui/primitives.md`、`.lab/specs/shared/ui/llm-ui-rules.md`
- Desktop workspace 规则：`.lab/specs/desktop/workspace/shell-layout.md`
- Windows / Electron 开发与启动排障：`.lab/specs/desktop/electron/windows-dev-loop.md`
- 多 target 仓库与 companion 方向：`.lab/specs/_governance/multi-target-repository-expectation.md`、`.lab/specs/architecture/multi-target-repo-layout-expectation.md`
