# AGENTS

- 若规则与用户当次最新指令冲突，以用户最新指令为准；若与当前代码现状冲突，以可运行代码现状为准。

## Project Baseline And Work Unit

- 当前仓库是多平台单仓：`Electron + React + TypeScript + Vite + Capacitor`；主要宿主与表面为 `electron/`、`android/`、`src/app/`、`src/companion/`、`src/shared/platform/`。
- 默认在 `dev` 主干按 Track-Based 连续小步推进；不创建 feature branch / worktree，除非用户明确要求。
- 正式发布只使用唯一、短期存在的精确分支 `release`：从已推送的 `dev` 切出，首个 release 提交写入已确定版本，首次 push 自动进入唯一 T7；此后不接收 dev，所有发布修复只落 release，并用普通 Git merge 按 first-parent 顺序回灌 dev。完成公开后元数据与 Pages 核对且最终 tip 已是 dev 祖先后才删除分支；禁止版本化 release 分支、cherry-pick、rebase、force-push 和人类 SHA 编排。
- 每个 release 只由一个 pinned 发布主任务从切分持有到删分支；T7 及其内层失败回到该任务，不由 monitor 创建 repair 任务。发布文案可在仓库外工作稿和未公开 Draft body 中与技术流程并行，公开必须由用户确认，最终正文归档、notes 与 manifest 只在公开后提交。
- 人工创建或交接 Foliole Codex 任务走 Codex Desktop 正常任务入口：`list_projects` 定位 saved project，`create_thread` 显式使用 `environment.type = local` 并发送完整首条提示，`wait_threads` 等待就绪，`set_thread_title` 命名，`read_thread` 确认正文可读，最后才可 `navigate_to_codex_page`；不得采用 Git 仓库默认 worktree。
- 无人值守 monitor handoff 只能走 `codex-desktop-handoff` daemon：事件级 App Server 创建持久任务，确认 `item/completed(userMessage)` 与完整 prompt 一致后立即 `turn/interrupt`，确认最终状态为 `interrupted`，关闭外部 App Server，再请求 Desktop 打开；该任务必须等待用户在 Desktop 继续，不得在 daemon 内持续执行。禁止启用或恢复 `task-seed-queue`、queue runner、Daemon V2、直接数据库 / session 注入或其他后台执行分支；仅有 thread id、标题或成功跳转不算交付成功，正文未确认或主动中断未完成时必须归档并重试。
- 用户要求继续某个平台的产品主线时，创建任务前必须先按该平台局部 `AGENTS.md` 区分产品实现、验收证据与宿主控制流；不得仅凭未勾选 checkbox 或未标 `done` 状态把验收 / 控制任务包装成产品代码任务。
- 单次只交付一个可运行、可验证、可回退的能力闭环；闭环以用户可验收行为、数据语义或迁移语义为边界，不以文件、函数、测试断言、提交数量或“超过 3 个文件”为边界。
- 能力闭环必须覆盖本轮承诺所需的入口、模型、消费侧、必要持久化、边界防护和验证；新增功能覆盖用户入口、状态模型、业务行为、失败或空状态，Bug 修复覆盖现象确认、根因修复、回归验证和用户可见结果恢复。
- 禁止混入无关重构，也禁止把同一闭环拆成微任务；同一闭环内必要的模型、入口、消费侧、测试、边界防护和生成物更新必须一起收口。
- 共享目标是“共享核心 + 薄宿主适配”；写产品代码时先面向稳定能力建模，平台层只做最必要 adapter，禁止为每个平台复制业务逻辑。
- 所有正式图标入口、菜单入口必须有对应命令，且图标 / 菜单 / 命令同源、命名一致；详见 `.lab/specs/_product/methodology.md`。

## AGENTS Routing

- 启动时先读根 `AGENTS.md`。
- 根 `AGENTS.md` 负责全仓硬规则与路由；平台与局部细则下沉到对应目录的 `AGENTS.md`。
- 只要任务触及下列路径，实施前必须按路由补读对应规则来源，并在该规则基础上执行：
- `electron/**`、`scripts/windows/**`、`playwright.desktop.config.ts`、Foliole 桌面主数据库 / 当前 library 数据库相关诊断或桌面运行链路：读取 `electron/AGENTS.md`
- `android/**`、`scripts/android/**`、`capacitor.config.ts`：读取 `android/AGENTS.md`
- `src/companion/**`：读取 `src/companion/AGENTS.md`
- `ios/**`：读取 `ios/AGENTS.md`
- `src/app/**`：当前没有单独局部 `AGENTS.md`，继续直接执行根 `AGENTS.md` 的 desktop renderer 规则；涉及运行时 UI 行为时，验证按 `electron/AGENTS.md` 的桌面验证规则执行
- `src/features/editor/**`：读取 `src/features/editor/AGENTS.md`
- `src/features/**`、`src/store/**`、`src/shared/**`：当前没有单独局部 `AGENTS.md`，继续直接执行根 `AGENTS.md` 的 shared / cross-host 规则
- 若一次任务同时跨多个宿主或表面，必须把相关局部 `AGENTS.md` 全部读齐；冲突时按“更靠近改动目录的规则优先，跨目录共享规则回退到根规则”执行。
- 关键平台约束必须落在根或对应目录 `AGENTS.md`，不得只放在普通项目文档里。
- 脚本级路径域分类以 `scripts/lib/path-domains.mjs` 为机械真相；根路由表只保留人类读规则触发器，质量闸、preview、lint scope 与 pre-push 不得另起一套路由表。

## Document Read Order

- 启动时只读 `AGENTS.md`。
- 任务涉及用户可见界面表达（布局、信息层级、控件组合或 UI 文案）时，实施前必须先读取 `DESIGN.md`。
- 其中，任务涉及 renderer UI 改动（`src/app/**`、`src/companion/**`、`src/features/**`、`src/shared/ui/**`）时，再读取 `.lab/specs/shared/ui/llm-ui-rules.md`。
- 任务涉及 UI 文案、产品对象命名、空状态、按钮、菜单、队列与阅读单元称呼时，再读取 `.lab/specs/_product/terminology-and-copy.md`。
- 任务涉及 `docs/i18n/guides/**` 的 Demo Guides 内容时，实施前必须读取 `docs/i18n/guides/README.md`；英文 `en` 文件是每个 slug 的必需源，其他语言可按需补齐并回退英文。
- 编写 Foliole Demo / Guides 文案时必须保留 Demo 边界：它可以是浏览器里的预置内容体验，但不得暗示为 Foliole Web 版、正式数据环境、桌面版替代品、完整本地文件 / 导入能力、完整桌面功能集或可长期生产使用的在线工作区。
- 新增或修改用户可见 UI 文案时，必须按 `.lab/specs/_product/terminology-and-copy.md` 的文案分层先区分用户效果、轻原理说明与内部语言；最终文案不得直接从变量名、数据库字段、IPC / action 名、队列流程动词或对话里的临时术语生成。
- 任务涉及具体现有规范时，按需读取对应 `.lab/specs/**` 条目，不全量通读。
- 任务涉及新增、重写或审计 agent 规则时，按 `$agents-maintainer` 流程只审根与局部 `AGENTS.md`；不默认扫描其他项目文档。
- 仅在判断停车策略时读取 `.lab/internal/runtime/park.flag`；预览不再由持久 flag 自动触发。

## Agent Rule Maintenance

- 新增或修改 agent 规则前，必须先判断是否已被既有规则覆盖；能合并、压缩、下沉或删除旧规则时，不得直接追加。
- 根 `AGENTS.md` 只保留全仓硬规则、路由触发器和机械决策入口；平台细则归局部 `AGENTS.md`，长解释和背景归 specs / Atlas，不进入根规则。
- 机械可判定逻辑优先写成表格或脚本入口；禁止把多维状态机继续扩写成散文段落。

## Windows Command Boundary

- Windows 开发使用普通 `dev` Git 流程：Mac controller 把 `dev` push 到 LAN Git，Windows 单一普通 `dev` 仓库执行 `git pull --ff-only lan dev` 后再动作；不解析、传递、保存、回传或比对 SHA，Git 失败直接报告。
- Windows 本地仓库服务 Windows 桌面、Windows 专属 A5 联动与最终跨宿主验收；Android 日常开发、固定 A5 调试和 Mac desktop DEV library 同步留在 Mac 当前工作区。Windows 不提交或推送源码上游，不建立 candidate、scratch 或第二份源码现场。拉取失败直接报告，不自动 reset、重建、修复或合并源码。
- 普通 Windows 终端诊断走局域网 SSH；Windows 侧 A5 设备动作只允许由 `scripts/windows/windows-dev-control.mjs` 的固定动作触发同一 Windows `dev` 仓库内的 adapter。Mac 日常 A5 调试按 `android/AGENTS.md` 使用固定本地入口；不得建立其他设备控制面。
- Windows 原生命令默认用已存在的 `npm` / `node` / 项目脚本入口执行；不得把多步验证长期写成内联 PowerShell / cmd 片段。
- 复杂 Windows 命令若涉及多层引号、环境变量、重定向、后台进程、native exe、`cmd.exe` / PowerShell 交叉调用或 stdout 可靠性判断，优先写成仓库内 Node runner 或已提交脚本；临时诊断必须把 stdout、stderr、exit code 写入 `.tmp/` 后再读取，不得只凭空 stdout 或空日志判定成功。
- 临时 Playwright / browser 验收、生产站点 browser probe、HTTP server + browser 脚本必须通过 `node scripts/with-resource-gate.mjs preview -- <command...>` 执行；Node REPL 只用于短探针，长流程必须转成仓库脚本。只清理 runner 自己启动的子进程树，不按进程名全机杀 `node.exe` / `msedge.exe`。
- 需要临时调用 Windows PowerShell 承载复杂参数时，使用 `powershell.exe -NoProfile -EncodedCommand` 并记录可复验日志；避免使用多层 `powershell.exe -Command "..."`、复杂 `cmd.exe /c ... && ...` 或嵌套 shell quoting。

## Task Execution And Risk Routing

1. 任务开工判断是首个动作规则：在第一次读文件、跑命令或改代码前，把最新用户请求归类为 `DIRECT`、`FOLLOW_PLAN`、`NEEDS_EVAL` 或 `STOP_CONFIRM`；只有 `DIRECT` 可以静默执行。
2. `FOLLOW_PLAN` 必须先读实施说明并遵守其中评估；`NEEDS_EVAL` 必须先输出轻量任务评估；`STOP_CONFIRM` 必须先等待用户确认。
3. 轻量任务评估必须写出 5 项：`任务类型`、`影响范围`、`已定路线`、`拒绝路线`、`停工点`；细则见 `.lab/specs/_governance/task-evaluation-expectation.md`。
4. 用户只给短标题、笼统“继续 / 修一下 / 处理一下”时，按顺序解析：本轮点名文件 / 实施说明 > 本轮 active file 若是实施说明 > 最近一条未完成的用户明确指令；仍无单一任务时只问一个澄清问题。
5. 需求、边界、验收标准或预期行为存在歧义时，先澄清；根因未确认时只写“现象 + 当前怀疑 + 待确认点”，禁止把猜测写成事实。
6. 命中高风险路径时，在开工判断或任务评估中明确“建议 High / XHigh”，但不得伪装工具层已切档；高风险包括 sync、数据库 / schema / migration、Electron preload / IPC / native bridge、Capacitor / Android lifecycle、review queue、delete / restore、import / reimport、持久化、重启后行为、冲突处理、安全边界、不可逆数据风险、人工验收失败后的复修和非显然 bug。
7. 若方案包含扫描、轮询、自造协议、新依赖、长期双写、运行时迁移、隐式 fallback、局部复制或先污染后清理，必须进入 `STOP_CONFIRM`，并说明方案身份是正式主方案、spike、诊断、兜底还是一次性迁移工具。
8. 执行中发现不再属于同一能力闭环，或新增 schema / bridge / IPC / 协议 / 依赖 / 后台任务 / fallback / migration / 双写 / scan / poll，必须停下进入 `NEEDS_EVAL` 或 `STOP_CONFIRM`。
9. 只有用户明确要求 spike，或任务评估把某段代码标为 spike / diagnostic / fallback / one-off migration 时，才允许写临时验证代码；否则临时代码不得接入正式入口。

## Delegation

- 只有用户当次明确授权使用子代理、并行 agent work、高风险会诊或等价表述时，才允许开子代理；未授权时继续由主进程处理，并只在开工判断中提示建议升档。
- 子代理只处理验证红灯或机械整改：旧测试签名、fixture/schema 失配、旧断言同步、单文件 lint / 预算拆分、单测试失败日志定位；不得把根因判断、协议/数据语义、跨宿主设计取舍、最终 diff 审查或提交收口交给子代理。
- 高风险会诊子代理只能做只读审查、风险清单、根因假设复核或最终 diff 复核；最终根因判断、协议 / 数据语义、跨宿主设计取舍、是否采纳建议与提交收口仍由主进程负责。
- 交给子代理前必须确认 4 件事：失败不改变当前主方案、写区能限定到文件或目录、主进程可并行推进、不与主进程改同一核心文件；不满足任一项则留在主进程。
- 子代理任务必须写清所有权范围、禁止改动范围、最窄验收命令和返回格式；返回后主进程必须 review diff，并由主进程决定是否进入更高层验证。
- 子代理分流是软规则，不由 hook 强制；能机械判断的验证触发必须优先落到脚本或 hook，不能只写在本节。

## Architecture And Troubleshooting

- 实体先于表象：禁止从表现层或派生现象反推系统真相；若缺少核心状态的独立表达，先补实体，再写逻辑。
- 抽象先于补丁：一旦问题开始依赖局部修补才能成立，默认视为抽象缺失；必须先回到模型与边界，禁止在症状层反复加补丁。
- 正式修复必须收敛根因与触发链；限制输入、跳过路径、延迟执行、加锁避让等只能作为已标注的诊断 / spike / 临时兜底，不能伪装成完成。
- 生产与消费分离：状态应在其自然生命周期内被维护；任何切换、恢复、同步、进入或退出动作都只能消费状态，不得临时生成状态。
- 排查非显然 bug 或难以复现的现象时，先取一次现场证据再读代码；用户给出的最小触发条件和对照条件必须作为最高优先级证据，现场观察与代码推断冲突时以现场为准，trivial typo、lint、纯文案和已有失败测试固化的修复除外。
- 根因判断必须同时解释“为什么会发生”和“为什么对照条件不会发生”；在根因未能解释全部现场现象前，禁止先按熟悉链路归类、提前修补或扩大到无关系统，只能记录现象、假设和下一步验证点。
- 共享业务规则、数据语义、review 语义、同步语义和 desktop 已存在的可运行闭环优先收敛在共享层；Android / companion 只保留移动端 surface、触屏交互、信息密度和宿主接缝。
- 禁止把平台分支判断散落到 `src/features/**`、`src/store/**` 或编辑器业务逻辑中；平台差异优先放到 `src/shared/platform/**` 或对应宿主目录。
- 若新增平台能力，先补 stable bridge / contract，再接宿主实现；禁止先把宿主 API 直接漏进业务层。
- UI / feature / store 层不得新增直接底层依赖；跨层能力调用必须经过 `src/shared/platform/**`、`lib/core/**` 或既有 bridge / service / adapter 模块。修 bug 和小改动不强制新建中间层，但不得新增直接底层依赖。

## Quality Gates, Preview, And Final Report

- 不允许通过降低检查标准过关；验证前必须从 `package.json` / `npm run` 确认真实入口，当前仓库以 `npm` 为准，不用不存在的 `npm test` 兜底。
- 凡本轮改动会进入应用运行时或改变用户可见行为，必须完成一次受影响宿主的可见验收；桌面任务默认以当前 Codex 所在的原生桌面宿主完成本轮主验收，只有用户明确指定其他宿主、行为属于其他平台专属边界、发布 / 安装包验收或跨宿主承诺时，才追加对应宿主验收。文件预算、窄测试、lint、typecheck、copy guard、运行时快检等前置验证必须先按改动范围完成，不得用宿主可见验收替代前置红灯修复。
- 宿主可见验收的具体入口由受影响宿主规则决定：桌面按 `electron/AGENTS.md` 选择 Hidden Native 或可见原生自动验收；Android / iOS / companion 按对应局部规则选择等价宿主验收。只改文档、agent 规则、只读诊断、测试代码或脚本内部逻辑，且不改变应用运行时行为时，可跳过宿主可见验收，但最终汇报必须写明跳过原因。
- 普通本地验证先使用登记的 `npm run quality:fast`，或显式目标的 `npm run test:files -- <file...>`、`npm run test:sqlite:electron -- <file...>`、`npm run lint:files -- <file...>`；`test:changed` 与 `quality:desktop`、`quality:android`、`quality:shared`、`quality:full`、`quality:release`、`quality:ios*` 均为 hosted-only，不得在普通本地执行。
- 少量明确测试文件只使用上述显式 `test:files` / `test:sqlite:electron` 入口；不得用按 diff 自动展开的聚合测试替代窄验证。
- 新增功能或改变既有可观察行为时，必须按 `.lab/specs/_governance/test-drift-prevention-expectation.md` 定位并维护对应测试 contract；自动化测试只锁定独立于当前实现方式仍需长期成立的产品行为、数据语义、交互结果与失败边界，断言数量不作为完成标准，也不得以此降低稳定 contract 的应有覆盖。
- 可复现 Bug 只有在根因违反了可稳定自动化表达的长期 contract 时，才新增或更新对应回归测试；决定不新增或更新时，最终汇报必须说明为何不构成稳定 contract，或为何现有基础设施无法可靠覆盖。不得仅因现场问题可复现，就用 DOM 顺序、坐标、像素、当前文案分组或组件层级断言固化偶然排版与实现结构。纯文案、纯视觉编排、纯静态样式或测试基础设施无法可靠覆盖的宿主行为，不新增这类断言，必须按受影响宿主规则完成可见验收；若视觉问题影响可点击、可达性、遮挡或其他交互结果，仍属于交互 contract，不得归入纯视觉豁免。已有稳定 contract 可以自动化覆盖时，不得仅以手工检查替代。
- 质检发现断言漂移时，不得机械修改预期值。若该断言约束的是需要长期成立的结果，应查明红灯原因再修复；若约束的只是偶然实现或过期表现，则删除该断言。随后先跑失败文件、失败 npm script 或失败 Gradle task 的定向复验，已收敛失败修复后不默认重跑整宿主质量闸。
- 动态目录或 glob 测试分桶不得断言当前文件数；应断言测试完整且唯一归桶，只有存在明确分片或资源上限时才断言命名上限。新增或删除测试文件不得需要同步偶然数量。
- 改动 sync pack manifest / schema / apply 语义，或 `lib/core/sync/syncPack*`、`electron/database/syncPack*`、`electron/sync/syncPack*`、`src/shared/platform/companionSyncPack*`，必须先跑 `npm run test:sync-pack`。
- 新增文件、拆分文件或修复 `max-lines` / `max-lines-per-function` 后，先跑 `node scripts/check-file-budget.mjs <file...>`，再跑对应窄 scope lint。
- 新增或升级 npm 依赖时，必须由 GitHub-hosted 质量流程覆盖 `npm run deps:hardening:check`，不得在本地执行；`build` 只在用户明确要求或触及依赖 / 构建根链路且必须验证时执行。
- npm 默认保留 7 天 release-age 安全窗口；但 Dependabot / GitHub Advisory / `npm audit` 已明确报出的漏洞修复必须定向绕过该窗口，只允许更新被点名的漏洞包或其必要传递依赖，并用 `npm ls <package> --all` 与 `npm audit --omit=dev` 复验。禁止用等待窗口期作为安全告警处理结论。
- `it.skip` / `test.skip` 必须紧邻 `// SKIP: <reason> | <date YYYY-MM-DD> | revive: <condition>`；看到超过 30 天的 stale `SKIP` 必须复查能否恢复。
- E2E（Playwright）不进入任何质量闸；它作为宿主可见验收单独执行。桌面日常 agent 自动化验收优先按 `electron/AGENTS.md` 使用不干扰用户桌面的 Playwright 入口，人工预览仍按下表执行。
- Android 日常按 Mac DEV-first 使用固定 A5 本地 CLI；Windows 只承担 Windows desktop 联动、Windows 专属边界与最终跨宿主验收。CI 级 clean / bundled / release-like 终检只由 GitHub hosted lane 承担，不得恢复通用设备 runner 或 detached preview 服务。
- `scripts/quality/quality-command-contracts.mjs` 是质量 / 发布命令分类的机械真相；未登记命令拒绝。`npm run quality:remote -- --scope <desktop|shared|android|ios|full>` 是唯一 dev-only hosted recheck orchestrator，禁止 SHA 输入和 release 调用；`release-control:draft-body`、`release-control:abandon-draft`、`release-control:abandon-ref`、`release-control:publish` 只允许 pinned 发布主任务在登记状态下使用。
- 运行命令后若工具返回非终态、无新增输出、仅 heartbeat / progress，或 agent 准备汇报“仍在运行 / 继续等 / 再查一次”，必须触发 `$quiet-wait`；后续用 waiter 接管等待，不得用 agent 回合继续守进程。
- `copy:guard` 默认只报告 warning；若它报 warning，修复前先读 `.lab/specs/_product/terminology-and-copy.md`，禁止机械替换。

| 条件 | 预览决策 |
| --- | --- |
| 用户当次明确要求某宿主预览 | 相关验证通过后执行该宿主预览 |
| 用户说“阶段验收”且本轮有对应宿主可见面 | 忽略 flag，执行受影响宿主预览 |
| 本轮改动触及 Demo 可见行为、Demo 入口、Demo 数据 / 生成物、Demo 重置链路或 Demo-only 逻辑 | 相关验证通过后刷新当前已打开的 Demo 页面做可见验收；不写持久开关，不自动新开窗口 |
| 普通模式、局部宿主规则命中人工预览 | 执行对应宿主预览 |
| 用户说“打开预览” / “关闭预览” | 只影响当次明确指定的宿主预览动作，不写入持久 preview flag |

预览入口：桌面人工预览按 `electron/AGENTS.md` 当前工作区入口执行；移动按 `android/AGENTS.md` 的局部入口执行。预览成功时最终末行可写 `pushed`。

- Demo 可见验收优先复用当前已打开的 Demo 窗口 / 标签页并执行刷新；若没有可刷新目标或当前工具无法控制该窗口，最终汇报必须明确 Demo 可见刷新未完成及原因，不得用 Hidden Native 或普通桌面 smoke 替代。

最终汇报默认使用 `C / V / R / pushed`：`C` 写用户可用结果与已确认根因；`V` 只用自然语言写验证结论、必要证据或必要的跳过原因，合并同类成功项，默认不展开命令清单、workflow 阶段、内部判断、已消解阻塞或证据台账，仅在验证失败、用户追问或审计要求时展开；`R` 只写真正剩余风险，没有风险时省略。不列内部字段、数据库对象或可选后续。
- 最终汇报引用本地截图、录屏、日志、HTML、Markdown 或其他生成物证据时，必须写成可点击 Markdown 文件链接，使用绝对路径；路径含空格时用尖括号包裹。禁止只写裸 Windows 路径或把路径包在代码反引号里。若需要直接展示图片，使用 Markdown 图片语法并填绝对路径。

## Decision Escalation And Official Sources

- 技术比选、中风险及以上改动、以及“声称修复但人工验收仍失败”的问题，实施前必须核对官方文档与最佳实践。
- 这类回复必须包含：`已核对来源`、`根因判断`、`修复策略`。
- 涉及 Electron preload、`contextBridge`、`ipcRenderer`、`window.electronAPI` 的改动，必须先核对 Electron 官方 `sandbox` / `contextIsolation` 边界。
- 涉及 Capacitor bridge、插件、`@capacitor/core`、Android / iOS 宿主生命周期或原生权限的改动，必须先核对 Capacitor 官方平台边界与对应平台官方文档。
- preload 改动必须带一条“sandbox 受限 require 环境下 bridge 仍可暴露”的自动化回归测试。
- Capacitor bridge 改动必须带一条“Web 层经 bridge 调用仍可在宿主侧落地”的自动化回归测试；若暂时无法自动化到原生层，至少补充到 contract / payload 层并给出人工验证步骤。

## Structure And Code Constraints

- 目录基线：`src/app` 只承载 desktop renderer shell，`src/companion` 只承载 companion renderer shell，`electron/` 只承载 Electron runtime glue，`android/` / `ios/` 只承载原生宿主工程与平台资源，`src/features` / `src/store` / `src/shared` 按跨宿主共享层治理。
- 单文件目标 <= 220 行，硬上限 > 260 行必须拆分。
- 单函数目标 <= 40 行，硬上限 > 60 行必须拆分或提取子函数。
- 规划阶段一旦列出候选改动文件，必须先对这些文件执行 `node scripts/check-file-budget.mjs <file...>`；若结果为 `split`，本轮优先拆出组件 / helper / types，只有删除、搬移或微修允许继续触碰原文件。
- 遇到 `max-lines`、`max-lines-per-function` 等规模约束时，禁止通过压缩格式、合并多条语句到单行、删除必要留白等方式规避；必须通过拆函数、拆组件或拆文件解决。
- 每个文件只承载一个核心职责；禁止把 UI、数据访问、业务规则长期混写。
- 全局设置不得进入 `WorkspaceLayoutProps` 或 workspace 中间层 props 链；新增全局设置默认走统一 settings provider，由设置页和实际消费位置直接读取。
- 编辑器能力通过 `EditorAdapter` 暴露；状态与存储在领域层统一管理。

## Data And Compatibility

- 未发布阶段的一次性旧数据迁移、语法升级和数据格式切换默认在仓库外或一次性脚本处理；禁止把长期双写、双读、运行时迁移或自动探测回退写进产品代码，除非用户明确要求。
- 所有关键数据变更优先可恢复，避免不可逆破坏。
- 涉及同步、跨宿主数据合并或冲突处理时，必须保证可回退，禁止静默覆盖冲突。
- 默认将用户可感知、会影响后续行为的状态视为永久态；禁止先按“临时态”假设实现，再靠后续补持久化。
- 仅纯 UI 过程量允许不落持久化，例如弹窗开关、hover / focus、一次性展示态、当前会话游标、编辑器瞬时滚动与选区；除此之外默认都必须持久化。
- 凡是会影响重启后结果、后续队列构建、节点图标、过滤条件、调度结果、统计口径或“该节点以后会怎样”的字段，一律按永久态处理，必须同时完成 renderer 写路径、bridge / runtime sync 与存储 hydrate 闭环。
- 页面内即时表现正确但重启后丢失的实现，视为未完成，不得汇报为“已修复”。
- 新增或修改状态字段时，任务说明与实现前必须声明该字段是“纯 UI 过程量”还是“永久态”；未明确证明为前者，默认按永久态处理。

## Language, Docs, And Commits

- 代码、注释、提交信息、UI 文案、配置键名统一使用英文；对外沟通与执行汇报默认中文。
- 给用户起草 issue 回复、PR 评论、社交回复或其他短文本时，默认直接用自然语言正文；不要用 fenced code block 包裹，除非用户明确要求可复制代码块或目标内容本身是代码 / 配置 / 命令。
- `.lab/specs/**` 文件名使用英文 slug，正文默认中文；其他落库文档默认中文，除非用户明确要求英文。
- 生成 Markdown 工作文档默认写入 `.lab/atlas/0active/`，除非用户另指明。
- 生成 HTML / 网页预览默认写入 `.tmp/artifacts/`，除非用户另指明；禁止把临时预览文件散落在仓库根目录。
- 未指定落点的临时测试材料、一次性生成物、人工验收样例、截图、文本样例和其他临时产物默认写入 `.tmp/artifacts/`；禁止放到 `/tmp`、仓库根目录或散落到功能目录，除非用户明确指定或工具只能写系统临时目录且随后必须迁入 `.tmp/artifacts/`。
- 只有 Foliole 自管且可重新下载或生成的跨运行缓存可写入根目录 `.cache/`；生产入口必须调用登记的本地 artifact/cache 维护能力并刷新 Cache 条目的最近使用时间。工具原生缓存与不可再生唯一副本不得迁入该目录，Agent 不得自行枚举或删除其中内容。
- 新增 spec 默认采用“主题分组 + 组内小文件”，避免继续新增超长单文档。
- 旧 spec 不做全量回拆；仅在当前任务直接涉及且单文档维护成本已明显过高时，允许局部拆分。
- 任务说明默认引用主题入口文档，不直接罗列大量碎文件。
- 文档拆分目标是降低修改成本与歧义，不以原子化本身为目标。
- 重要边界决策与异常处理结论写入 `.lab/specs/**` 或迭代日志；不要只停留在口头汇报。
- `.lab/**` 全部视为本地工作文档，默认全忽略、不提交；仅当用户在当次会话中明确要求时，才单独调整。
- 用户要求“提交”“commit”“执行提交指令”时，必须使用 `commit-note` skill。

## Detail Pointers

- 方法论与文档治理：`.lab/specs/_product/methodology.md`、`.lab/specs/_governance/`
- UI 与文案：`DESIGN.md`、`.lab/specs/shared/ui/llm-ui-rules.md`、`.lab/specs/_product/terminology-and-copy.md`
- 宿主与架构细则：`.lab/specs/desktop/electron/windows-dev-loop.md`、`.lab/specs/desktop/workspace/shell-layout.md`、`.lab/specs/architecture/multi-target-repo-layout-expectation.md`
