# AGENTS

- 若规则与用户当次最新指令冲突，以用户最新指令为准；若与当前代码现状冲突，以可运行代码现状为准。

## 项目基线
- 技术栈：Electron + React + TypeScript + Vite。
- 默认按 Track-Based 迭代推进，以“当前主目标 + 最小可验收任务”为单位，不再以阶段号驱动执行。
- 默认在 `dev` 主干连续小步迭代；不创建 feature branch / worktree，除非用户明确要求。
- 单次只做一个 30-90 分钟内可运行、可验证、可回退的最小任务；禁止混入无关重构。
- 拆分和排序任务时必须遵循 BDD + UI 先行顺序：先 UI 壳 → 再 IPC → 最后数据层。每层只做上层要求的事，禁止先做后端再补前端；当能力尚未接通但需先露出入口时，必须按统一“开发中”规则表达，不得只用灰态冒充不可用。详见 `.lab/specs/_product/methodology.md`。
- 所有正式图标入口、正式菜单入口默认都必须有对应命令；设计与实现时必须从“图标 / 菜单 / 命令同源且命名一致”出发，禁止先做孤立入口、后补命令。详见 `.lab/specs/_product/methodology.md`。

## 文档读取顺序
- 启动时只读 `AGENTS.md`。
- 仅当用户在新会话首条有效指令明确说“继续”时，先读取 `.lab/agent/todo.md`；必要时按需补读 `.lab/agent/verify.md`、`.lab/agent/optional.md`、`.lab/agent/notes.md`、`.lab/agent/done.md` 与 `git log --oneline -n 5`。
- 任务涉及 renderer UI 改动（`src/app/**`、`src/features/**`、`src/shared/ui/**`）时，实施前必须读取 `.lab/specs/shared/ui/llm-ui-rules.md`。
- 任务涉及具体现有规范时，按需读取对应 `.lab/specs/**` 条目，不全量通读。
- 任务涉及新增/重写 spec、整理文档结构、拆分长文档时，按需读取 `.lab/specs/_governance/spec-organization.md` 与 `.lab/specs/_governance/doc-organization-expectation.md`。
- 任务涉及台账、继续/停车协议等执行细则时，读取 `.lab/agent/task-protocol.md`。
- 仅在判断验证或停车策略时读取 `.lab/internal/runtime/windows-preview.flag` 与 `.lab/internal/runtime/park.flag`。

## 任务执行主规则
1. 任务来源优先级：用户当次明确指令 > 当前代码现状 > `.lab/agent/todo.md` 首项。
2. 若用户未给清晰任务范围，先补齐任务说明，再实施；禁止凭短标题脑补。
3. 任务说明至少应覆盖：当前问题或背景、预期目标、影响范围、明确边界、已知约束或依赖。
4. 需求、边界、验收标准或预期行为存在歧义时，必须先向用户澄清；禁止靠猜测开工。
5. 复杂任务、高风险改动或影响范围暂不清晰时，实施前先向用户说明方案并等待批准；范围明确的小任务可直接实施。
6. 当改动预计超过 3 个文件时，优先评估是否应拆成更小的可验证任务；若无法合理拆分，需先说明原因再继续。
7. 若根因未确认，允许写“现象 + 当前怀疑 + 待确认点”；禁止把猜测写成事实。
8. 若本轮入口是“继续”，在选择任务前必须先做台账对账：逐条比对 `todo` 首项、`done` 最近记录与 `git log --oneline -n 5`，必要时再核对 `verify` / `optional`，确认该任务是否其实已完成但未同步。
9. 若 `todo`、`verify`、`optional`、`done` 与最近提交不一致，先更新台账或向用户明确差异，再实施代码任务；禁止跳过对账直接认领下一条。
10. `verify` 仅表示“已实现但仍待复核/待人工确认”的备注区，不是默认任务来源；除非用户明确要求补做其中缺口，否则不得把它当作新的实施任务直接开工。
11. 只改当前任务相关文件；发现结构性阻塞时，先写回 TODO，再决定是否提升优先级。
12. `.lab/agent/todo.md`、`.lab/agent/verify.md`、`.lab/agent/optional.md` 共同构成未完成工作的真实来源，其中默认接手入口只有 `todo`；`.lab/agent/notes.md` 只承载长期备注，`.lab/agent/done.md` 只记录已完成项；但当“继续”恢复发现台账滞后于代码与提交时，必须先修正台账真相。

## 质量闸与测试
- 不允许通过降低检查标准过关；禁止跳过关键检查、删除校验或用注释掩盖失败。
- 默认质量闸顺序固定为 `lint` -> `typecheck` -> `test`，入口脚本为 `scripts/quality-gate-fast.sh`。
- 新增或升级 npm 依赖时，除常规质量闸外，必须额外执行 `npm run deps:hardening:check`；不得只凭口头说明或文档勾选完成。
- npm 依赖相关复核默认由 AI 直接执行并汇报结果；禁止把“人工检查依赖风险”“人工定期复核”这类空泛表述挂成默认待办。
- npm 依赖收紧的背景、例外与专项结论统一收口在 `.lab/agent/npm-supply-chain-hardening-plan.md`；主规则只保留可执行入口，不在这里重复展开长篇原则。
- 当 `.lab/internal/runtime/windows-preview.flag` 为 `ON` 时，代码改动在通过本地质量闸后，默认必须继续执行 `npm run windows:preview`；除非用户当次明确豁免。
- 执行 `windows:preview` 后，汇报中必须包含实际命令与最终状态字段：`status: SYNCED` / `RESTART_REQUESTED` / `STARTED` / 失败原因；不得只汇报“已验证”。
- Windows 公开验证入口只保留 `npm run windows:preview`；其余 Windows npm 命令不再作为默认或推荐入口。
- `npm run electron:dev` 仅用于直接拉起 Electron dev runtime 的调试场景，不作为默认 Windows 验收命令。
- `build` 仅在用户明确要求完整交付时执行；对应入口为 `scripts/quality-gate.sh` 或交付脚本。
- 包管理器必须按锁文件检测，禁止硬编码。
- 可复现 Bug 修复前，优先先补复现测试，再修复并验证测试通过；若暂时无法自动化复现，必须先说明原因，并补充可执行的人工验证步骤。
- 任意可复现 Bug 修复必须新增至少 1 条自动化回归测试；没有回归测试不算完成。
- 重构、模块迁移、preload/bridge 改动视为高回归风险，提交前必须补齐或更新关键回归测试。
- 完成后汇报必须包含实际验证结果；若仍存在边界风险或未覆盖场景，需同时列出潜在问题与建议测试用例。

## 决策升级与官方来源
- 技术比选、中风险及以上改动、以及“声称修复但人工验收仍失败”的问题，实施前必须核对官方文档与最佳实践。
- 这类回复必须包含：`已核对来源`、`根因判断`、`修复策略`。
- 涉及 Electron preload、`contextBridge`、`ipcRenderer`、`window.electronAPI` 的改动，必须先核对 Electron 官方 `sandbox` / `contextIsolation` 边界。
- preload 改动必须带一条“sandbox 受限 require 环境下 bridge 仍可暴露”的自动化回归测试。

## Desktop / Platform 规则
- 本项目默认按桌面应用优先，不按纯 Web 方案优先。
- 系统能力优先经 Electron main process 暴露，再由前端通过 bridge 调用；业务层不得散落 `ipcRenderer` 调用。
- 文件路径、数据库路径、日志路径等统一由 Electron main process 解析；前端禁止拼平台绝对路径。
- 持久化主路径统一走 Electron main process；`localStorage` 仅允许用于可丢失 UI 偏好且必须可审计。
- Windows 预览是否默认执行，只看 `.lab/internal/runtime/windows-preview.flag`。
- 桌面窗口已可见但 bridge-backed controls 失效时，默认优先排查 preload/bridge 链路，不得先草率归因为 renderer 未启动。

## 结构与代码约束
- 目录基线：`src/app`、`src/features`、`src/shared`、`src/store`、`electron`。
- 单文件目标 <= 220 行，硬上限 > 260 行必须拆分。
- 单函数目标 <= 40 行，硬上限 > 60 行必须拆分或提取子函数。
- 遇到 `max-lines`、`max-lines-per-function` 等规模约束时，禁止通过压缩格式、合并多条语句到单行、删除必要留白等方式规避；必须通过拆函数、拆组件或拆文件解决。
- 每个文件只承载一个核心职责；禁止把 UI、数据访问、业务规则长期混写。
- 复杂逻辑优先模块化拆分；禁止用极端紧凑写法规避规模限制。
- 全局设置不得进入 `WorkspaceLayoutProps` 或 workspace 中间层 props 链；新增全局设置默认走统一 settings provider，由设置页和实际消费位置直接读取。
- 编辑器能力通过 `EditorAdapter` 暴露；状态与存储在领域层统一管理。

## 数据与兼容策略
- 未发布阶段若需要一次性迁移旧数据，默认使用仓库外人工操作或一次性脚本处理，不把这类迁移长期写进应用启动/runtime 代码；除非用户当次明确要求保留应用内迁移。
- 语法升级只保证新写入/新编辑路径符合当前规范，不做历史语法迁移。
- 数据格式切换不进入产品代码；转换由人工离线一次性完成，禁止长期双写、双读、运行时迁移与自动探测回退。
- 所有关键数据变更优先可恢复，避免不可逆破坏。
- 默认将用户可感知、会影响后续行为的状态视为永久态；禁止先按“临时态”假设实现，再靠后续补持久化。
- 仅纯 UI 过程量允许不落持久化，例如弹窗开关、hover/focus、一次性展示态、当前会话游标、编辑器瞬时滚动与选区；除此之外默认都必须持久化。
- 凡是会影响重启后结果、后续队列构建、节点图标、过滤条件、调度结果、统计口径或“该节点以后会怎样”的字段，一律按永久态处理，必须同时完成 renderer 写路径、Electron runtime sync 与 sqlite hydrate 闭环。
- 页面内即时表现正确但重启后丢失的实现，视为未完成，不得汇报为“已修复”。
- 新增或修改状态字段时，任务说明与实现前必须先声明该字段属于“纯 UI 过程量”还是“永久态”；若未明确证明为前者，默认按永久态处理。

## 语言、文档与提交
- 代码、注释、提交信息、UI 文案、配置键名统一使用英文；对外沟通与执行汇报默认中文。
- `.lab/specs/**` 文件名使用英文 slug，正文默认中文；其他落库文档默认中文，除非用户明确要求英文。
- 新增 spec 默认采用“主题分组 + 组内小文件”，避免继续新增超长单文档。
- 旧 spec 不做全量回拆；仅在当前任务直接涉及且单文档维护成本已明显过高时，允许局部拆分。
- TODO、台账与任务说明默认引用主题入口文档，不直接罗列大量碎文件。
- 文档拆分目标是降低修改成本与歧义，不以原子化本身为目标。
- 重要边界决策与异常处理结论写入 `.lab/specs/**` 或迭代日志；不要只停留在口头汇报。
- `.lab/**` 全部视为本地工作文档，默认全忽略、不提交；仅当用户在当次会话中明确要求时，才单独调整。
- 用户要求“提交”“commit”“执行提交指令”时，必须使用 `commit-note` skill。

## 细则入口
- 开发方法论（BDD、UI 先行、任务拆分顺序）：`.lab/specs/_product/methodology.md`
- agent 台账与执行协议：`.lab/agent/task-protocol.md`
- 文档治理与准入规则：`.lab/specs/_governance/doc-update-expectation.md`、`.lab/specs/_governance/spec-organization.md`、`.lab/specs/_governance/doc-organization-expectation.md`
- UI 规范：`.lab/specs/shared/ui/primitives.md`、`.lab/specs/shared/ui/llm-ui-rules.md`、`.lab/specs/desktop/workspace/shell-layout.md`
- Windows Native 开发与启动排障：`.lab/specs/desktop/electron/windows-dev-loop.md`
