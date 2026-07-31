# Foliole 发布体系重建实施方案

## 1. 目标边界

本方案重建 Foliole 的完整发布控制面，不执行某一次具体发布。完成后，发布采用唯一、短期存在的精确分支 `release`：从已推送的 `dev` 切出，在首个 release 提交中写入已经确定的版本号，随后由该分支的 push 自动进入一个可见的 T7 顶层流程；T7 在同一 run 内按 T5 → T6 → T7 的依赖顺序完成准入、综合质量、候选验收、macOS/Windows 正式打包和占位 Draft Release 组装。`dev` 继续独立开发，每日定时 T6 仍作为单独顶层流程运行，并在内部调用 T5。

本方案同时修改仓库规则、发布技能、release log 技能、hosted-quality 修复技能、GitHub Actions、质量命令入口、release contract、doctor/evidence 脚本、监控与任务交接策略，使它们只表达一套流程。旧 `release/<version>` 模型、旧 0.7.1 候选、旧 T5/T6/T7 成功或失败记录、旧草稿与旧任务都不进入新流程；只保留 GitHub 已完成 run 的历史审计记录以及已经公开的 tag/Release。

本方案实施期间禁止运行任何测试、lint、typecheck、质量闸、GitHub workflow、构建、打包、签名、安装验收或发布动作；也不创建新的 `release` 分支。各闭环只允许做源码、规则、workflow 定义和 scoped diff 的静态审阅。全部体系改完后，另起一次全新的真实发布，才是新体系的第一次端到端执行；该真实发布不属于本方案。

任务 2 至任务 6 是一次不可分割的体系切换：中间提交可以分别落库，但在任务 6 完成前发布链明确处于不可运行状态，禁止任何人创建 `release`、dispatch/re-run 发布 workflow 或尝试复用其中任一半成品入口。

## 2. 已定产品决策

- 同一时间最多存在一个短期分支，名称固定为 `release`。版本历史由 tag 和 GitHub Release 保留，不使用 `release/<version>` 保存历史。
- `release` 必须从已推送的 `dev` 切出；目标版本在发布开始时快速确定，并作为 release 的第一个提交写入 `package.json` 及其必要锁文件。首次远端 push 同时建立分支并启动 T7。
- release 切出后不再接收 `dev`。发布阻断修复只提交到 `release`；需要回到开发线的修复使用普通 Git merge 从 `release` 回灌 `dev`，禁止 cherry-pick、rebase、force-push 或双向追平。
- 正式发布只有一个人类入口：T7。T7 调用可复用 T6，T6 再调用可复用 T5；正式证据由同一顶层 run 的 job dependency 表达，不再搜索历史 workflow run 来拼接证据。
- 每日 `dev` T6 保持独立、可见、可手工重跑的顶层 workflow，并在自身 run 内先调用 T5。release 内嵌 T6 不适用定时任务的重复跳过逻辑，`skipped` 不能被当成成功。
- 人与 agent 只按 `dev` 或 `release` 分支操作，不输入、传递或保存 SHA 作为发布路线。GitHub Actions 必须从顶层事件一次性取得 commit identity，并在内部 `target_sha`、checkout、artifact、attestation 和 stale-run 防护中逐层传递与断言；这是内部相关性证据，不是人类控制面，不得被实施者删除。
- T7 自动完成 T5、T6、候选验收、macOS/Windows 正式打包、签名/公证/现有安装检查、产物汇总和占位 Draft Release。唯一保留的人工发布动作是确认公开 GitHub Release。
- T7 对 `release` 使用单一 concurrency；新的产品或版本提交取消旧 run。任何写 Draft 或组装产物的步骤都必须再次确认当前远端 `release` tip 仍是本 run 的事件提交，过期 run 不得改写草稿或成为可发布候选。
- 平台 package workflow 只生产并回传产物，不各自创建、替换或删除 Draft。T7 assembly 是未公开 Draft 资产的唯一技术所有者，只在 Draft 首次创建时写占位正文；release-log 侧是 Draft 正文的唯一写者。同版本后续 T7 只替换本流程管理的资产并保留正文与其他发布元数据；已公开 Release 是硬边界，自动流程不得覆盖或删除。
- 发布文案与技术质检并行。版本号确定后即可启动技术流程；release log 可在 `.lab` 工作稿中长期反复修改，Draft 建立后同步到 GitHub Draft body，不提交到产品候选分支，也不触发 T5/T6/T7 重跑。
- 技术完成不以正式文案完成为前提。文案修改、最终正文归档以及公开后的 notes/manifest 更新都是发布元数据，不改变产品候选、质量结论或已有包。
- 用户确认公开 Release 后，才在 `release` 上提交最终 GitHub 正文归档、`releases/notes/*.json` 与 `releases/update-manifest.json`。这些 post-public metadata 路径不触发 T7，也不要求重新质检或打包。
- post-public metadata 随 `release` 最终 tip 普通 merge 回 `dev`；`dev` 的 Pages workflow 只发布已经公开的版本信号。公开 Release、Pages 信号、最终 merge-back 均完成后，证明最终 `release` tip 已是 `dev` 祖先，再删除 `release`。
- 发布版本在活动周期内是技术身份的一部分；活动周期内 `dev` 不独立修改版本字段，merge-back 时版本字段以 release 为准。普通文案可任意修改；若目标版本本身改变，发布主任务必须先人工删除旧版本的未公开 Draft，再提交并 push 新版本，旧包不得复用。旧版本若已经公开则禁止改号，必须结束当前周期后另起新版本。
- 本地质量检查只允许执行明确登记的快速命令。一个命令只有同时满足“启动前目标有界、本地成本有界、不展开未知规模聚合、无持久外部/发布副作用、不作为 T5/T6/T7 证据”五项才可归类为 local-quick；未知或未登记质量入口一律 hosted-only。发布控制命令另列 `release-control`，只允许发布主任务在明确状态转换中修改未公开 GitHub 对象或 release ref，永不冒充本地检查。
- 命令分类逐项审计真实执行图，不按 Electron、Playwright、Gradle、Simulator、测试文件数量或名字关键词判断。删除本地快速入口中的 `--full`、`--release` 等升级口子；中重度检查只由 GitHub workflow 执行。
- release 的失败始终由同一个、从 cut branch 到删除 branch 全程保持 pinned 且不得归档的发布主任务负责；T7 不自动创建第二个 repair 任务，失败层级从同一 run 中首个失败 stage 判断。发布主任务若被用户主动中断或关闭，发布明确暂停；恢复时重新打开同一 pinned 任务并从远端 `release`/最新 T7 读取状态，不由 monitor 猜测性创建替代任务。独立的 `dev` 定时 T6 失败仍可创建 hosted-quality 修复任务。
- 当前旧发布尝试全部作废：取消仍活动的旧 workflow/等待任务，归档旧 Codex 发布任务，删除未公开旧 Draft；在确认无独有提交后删除所有 `release/*` 本地/远端 ref，为精确 `release` 腾出 Git ref 命名空间。不得删除已公开 tag、Release 或 GitHub run 历史。

## 3. 任务评估

- 任务类型：`skill-workflow`、发布治理、Git 分支生命周期、GitHub Actions 编排、质量执行边界与任务监控重建；建议 XHigh。
- 影响范围：根与局部 `AGENTS.md`，`foliole-release`、`release-log-writer`、`foliole-hosted-quality-repair` 等相关技能；T5/T6、remote/core/common/full/iOS quality、RC、macOS、Windows、publish/T7、manifest 与 site-sync workflows；`package.json` 与 `scripts/quality/**`；release target/doctor/evidence/manifest 脚本及测试 contract；`.codex/monitors/**` 与 GitHub Actions handoff policy；以及 Windows 签名所依赖的 Azure OIDC 联合凭据和 GitHub environment/secret/variable scope。产品运行时代码、数据 schema、应用 UI 和现有公开 Release 不在范围内。
- 已定路线：先安全清退旧发布实例和 `release/*` 命名空间；再统一规则与技能；逐项建立 local-quick/hosted-only 机械登记；把 T7 重组为同 run 的 T5 → T6 → T7 与双平台自动产物链；最后统一版本、Draft、公开后元数据、Pages、监控和单任务归属。实施只做静态修改与 scoped diff 审阅，不运行验证；新体系的首次动态证据来自之后另起的真实发布。
- 拒绝路线：拒绝 `release/<version>` 长期分支；拒绝让人类按不可变 SHA 编排；拒绝 T7 通过 API 搜索旧 T5/T6 run；拒绝让 Windows、publish workflow 或 release-log 文件争夺 Draft 所有权；拒绝文案阻塞技术质检或因纯文案重跑产品质量；拒绝由关键词猜测本地成本；拒绝 local-fast 升级为综合闸；拒绝 T7 红灯生成重复任务；拒绝复用旧 0.7.1 产物、草稿或证据；拒绝在体系改造中顺手执行任何测试或 release。
- 停工点：旧 `release/*` ref 出现尚未进入 `dev` 的独有提交、待删除 Draft 已公开、现有 tag/Release 归属不明、GitHub 权限无法区分草稿与公开 Release、签名/公证必须由人工在 workflow 外完成、同一顶层 workflow 无法复用现有 secrets/permissions、或修改要求新增产品运行时协议/持久化/依赖时，停止当前闭环并回到本方案修订。无关 dirty changes 必须原样保留，发生无法隔离的同 hunk 冲突时停工。
- 本轮完成口径：只检查预定文件和 scoped diff 是否已经统一表达本方案；禁止以测试结果、workflow run、构建产物、包或真实发布作为完成条件。候选文件的 file-budget 检查也按用户指令延后，不在本方案实施期间执行。
- 最终验收目标：`none`。
- 已核对来源：[GitHub Reusable Workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations) 当前允许最多 10 层、规定 nested permissions 只能保持或收窄、secrets 必须映射/继承，并明确 caller/called 使用相同 concurrency group 会自我取消；[GitHub jobs 与 needs](https://docs.github.com/en/enterprise-cloud%40latest/actions/how-tos/write-workflows/choose-what-workflows-do/use-jobs) 支持用同一 run 的依赖结论做门禁；[GitHub concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency) 支持同组取消旧 run；[GitHub OIDC 与 reusable workflows](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-with-reusable-workflows) 说明 token 同时携带 caller ref 与 `job_workflow_ref`；[Microsoft Azure OIDC](https://learn.microsoft.com/en-us/azure/developer/github/connect-from-azure-openid-connect) 要求 Entra 联合凭据 subject 与 GitHub token 精确匹配；[GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository) 区分 Draft 编辑与公开发布；[Git workflows](https://git-scm.com/docs/gitworkflows/2.35.0.html) 支持短期维护线修复后向开发线 merge-back。
- 根因判断：当前系统同时存在 `release/<version>` 与人工 SHA 两套控制语言、T7 搜索历史 T6 证据、多个 workflow 争用 Draft、正式文案提前进入候选、local-fast 可升级成综合闸、monitor 为同一次 release 失败创建多任务等冲突。问题不在某一次 Ubuntu/Electron 红灯，而在规则、技能、脚本、workflow 和任务所有权没有共享一个发布实体与状态机。
- 修复策略：以唯一活动实体 `release` 和唯一顶层发布 run T7 为轴，GitHub 内部保留 commit identity 只做相关性和防陈旧写入；质量依赖收敛到同 run `needs`，文案与公开后更新拆出产品候选，所有本地命令按客观执行 contract 显式登记，监控只为独立 dev T6 建 repair 任务。一次性删除旧命名空间和旧未公开状态，不保留兼容 fallback 或双轨流程。
- 本方案不可静态证明的残余风险：不运行 workflow 就不能证明 macOS/Windows secrets 在实际 runner 上可读、Azure OIDC 联合凭据接受新 `release` ref/可复用 workflow claim、签名/公证服务在线，也不能证明第一份真实包可安装。实施期必须只读核对并在必要时更新仓库外 trust/scope 配置；仍无法读取的配置属于任务 4 停工点，不能用“等第一次发布再看”冒充已完成。完成体系后，首次真实发布承担唯一动态证据；届时再执行此前明确延后的 file-budget 与相关检查。

## 4. 数据 / 交互规则

- 活动发布身份由远端精确分支 `release` 与其中的 `package.json` 版本共同表达；分支回答“当前由谁推进”，版本回答“正在发布什么”。workflow 的事件 commit 只回答“这次 run 实际消费了哪份内容”。
- release 初始化顺序固定为：确认 `dev` 已推送且工作树改动归属清晰 → 从 `dev` 切出本地 `release` → 写入目标版本并形成首个 release commit → 首次 push 建立远端 `release`。不得先创建空远端 ref 再用无意义 run 消耗 T7。
- 首个 release commit 必须实际包含版本字段变化；这既是版本所有权起点，也是首次 branch push 在 `paths-ignore` 存在时仍能触发 T7 的保证。活动发布期间 `dev` 不修改这些版本字段；merge-back 若发生冲突一律保留 release 侧版本。
- 技术状态序列固定为：T7 started → nested T5 success → nested T6 success → RC success → macOS/Windows packages success → latest-run guard success → placeholder Draft assembled。任一前置失败，后续 stage 不得运行；`cancelled`、`skipped`、找不到历史证据均不算成功。
- T5/T6 的 job 输出只在当前调用链向下游传递。正式 T7 不读取 workflow-run 历史、旧 artifact 或旧 evidence 文件决定是否放行；artifact download 禁止填写跨 run 的 `run-id`/`repository`。定时 dev T6 也不成为 release T7 的候选证据。
- T7 push 只响应产品/版本候选变化；公开后的 `releases/github/**`、`releases/notes/**` 和 `releases/update-manifest.json` 变更被明确排除。Release 公开后，`release` 只允许补齐这些元数据和完成 merge-back，不再接受同版本产品修复。
- macOS 与 Windows workflow 作为可复用 package producer 接收调用 run 的上下文，上传带版本和内部 commit identity 的产物；不得创建、替换、删除 Draft。两个 producer 使用显式 secrets allowlist，保留所需 `environment:`，并把 `permissions` 收窄为源码只读和自身签名/attestation 必需项；只有 assembly job 拥有 GitHub Release 写权限。T7 assembly 只消费本 run 的两侧产物，并在写 Draft 前核对远端 `release` 尚未移动。
- 占位 Draft 的 tag/version 由 branch 中的版本得出，正文可以是明确的未完成占位内容。assembly reconciliation 固定为三分支：tag/Release 已公开则立即失败；Draft 不存在则创建并写占位正文；同版本 Draft 已存在且未公开则保留正文、标题和发布设置，只原子替换本流程管理的资产。release-log 技能在仓库外工作稿中编辑，Draft 存在后只更新 body；公开动作必须由用户确认。最终公开正文随后归档到仓库，归档不是包的输入。
- update notes 与 manifest 只描述已经公开、可下载的 Release；禁止在公开前向 Pages 发出新版本信号。Pages 仍从 `dev` 发布，因此必须先完成 post-public metadata 的 release→dev 最终 merge。
- 最终关闭顺序固定为：用户公开 Draft（`v<version>` tag 指向通过 T7 的产品候选 commit）→ 在 release 补齐最终正文归档、notes、manifest → 普通 merge 最终 release tip 到 dev → dev 发布 Pages 信号 → 核对公开信号 → 证明包含 post-public metadata 的最终 release tip 是 dev 祖先 → 删除本地/远端 `release`。tag 不要求、也不应移动到最终 metadata tip。
- 本地命令登记表是机械真相。每个可由 agent 本地启动的相关入口必须明确标为 `local-quick`、`hosted-only`、`orchestrator` 或 `release-control`，并记录其真实展开边界；调用未登记命令时 fail closed。GitHub workflow 可直接调用 hosted-only 实现，普通本地入口不能通过参数、环境或别名升级。
- `orchestrator` 只允许在本地发起/观察 GitHub 工作，不在本机执行中重度检查；`release-control` 只允许发布主任务在方案规定的转换点编辑未公开 Draft、删除被明确作废的未公开 Draft/ref 或执行用户确认后的 public transition。release push 自动触发 T7；dev repair 的 `remote-quality` 只在 `dev` ref 上发起 scoped hosted recheck，内部把事件 SHA 传给各 job，但人类不输入 SHA；release 不使用 remote-quality。
- dev T6 和 release T7 直接调用同一个 `t6-hosted-quality.yml` 实现文件，不新增 `t6-core` 包装。当前最深链为 `T7 → T6 → hosted-quality-full → hosted-quality-ios`，占 GitHub Cloud 当前 10 层上限中的 4 层；后续不得在未重新审计完整调用树时新增中间 reusable workflow。
- 所有内层 concurrency group 显式携带 execution lane（`dev-t6` 或 `release-t7`）、触发 ref 与 job identity。两条 lane 的 group 集合不得相交，任何内层 group 不得等于顶层 T7 group，也不得在 caller/called 两侧复用 `${{ github.workflow }}` 生成同名 group。release lane 允许新 T7 取消旧候选，dev lane 不得阻塞或取消 release。
- 基础设施性抖动、公证超时或 runner 故障只允许在 GitHub UI re-run 同一 T7 attempt；产品、版本或配置内容变化必须形成 release commit 并由 push 产生新 T7。禁止用空提交制造候选，也不新增带 SHA 的 manual release dispatch。
- 版本中途改变由 pinned 发布主任务执行：先确认旧版本 Draft 未公开并用 `release-control` 删除，再提交新版本字段；若旧版本已经公开则停工并结束该周期，不自动删 tag/Release。
- T7 failure 只回到现有 release 主任务，并携带 run URL、失败 stage 与日志摘要；主任务在 release 修复、push，新的 T7 自动替代旧候选。monitor 不为 T7、其嵌套 T5/T6 或平台 job 新建任务。
- 独立 dev T6 failure 仍由 monitor 创建一个 hosted-quality repair 任务；该任务只能修复 `dev` 并触发/等待新的 dev T6，不得转入 release 或借用发布 Draft。
- 旧发布清退以“无独有提交 + 未公开”作为删除条件。只读历史已显示当前 `release/0.7.1`、`origin/release/0.7.1`、`origin/release/0.6.5` 相对 `dev` 均为 0 个独有提交；执行时仍须在删除前重新读取 ref 和公开状态，若状态变化立即停工。

现有 13 个 workflow 与新 T7 的最终角色固定如下；实施不得留下第二套入口：

| Workflow | 最终角色 |
| --- | --- |
| `t5-baseline-admission.yml` | reusable-only T5；接收内部 event SHA，不提供人类 dispatch |
| `t6-hosted-quality.yml` | 同一文件同时提供 `schedule`/dev manual 顶层入口和 `workflow_call`；两者都调用 T5，只有 dev 顶层路径可执行 schedule duplicate policy |
| `hosted-quality-full.yml` | 保留为 reusable hosted-only 综合实现，接收 lane 与内部 SHA |
| `hosted-quality-core.yml` | 保留为 reusable hosted-only scope 实现 |
| `hosted-quality-common.yml` | 保留为 reusable hosted-only shared jobs |
| `hosted-quality-ios.yml` | 保留为 reusable hosted-only iOS jobs，不再外包一层 |
| `remote-quality.yml` | 保留为 dev-only、branch-ref 顶层 scoped recheck；不属于 T5/T6/T7 正式证据 |
| `release-candidate-quality.yml` | 改为 reusable-only RC producer，不独立触发 |
| `release-macos.yml` | 改为 reusable-only package producer，无 Draft 写权限 |
| `release-windows.yml` | 改为 reusable-only package producer，无 Draft 写权限 |
| `publish-release.yml` | 删除旧跨-run assembly/历史 evidence 入口 |
| `deploy-release-manifest.yml` | 保留为 dev metadata Pages deploy，并在 workflow 自身拒绝未公开版本；当前不存在 `main` 本地或远端 ref，因此删除 `main` 触发器 |
| `sync-site-downloads.yml` | 保留为 GitHub Release `published` 后的站点通知，不参与候选质量或 Pages metadata |
| 新 `t7-release.yml` | 唯一正式 release 顶层 workflow：exact `release` push、T5→T6→RC→packages→assembly |

## 5. 闭环任务

执行本说明时，一个执行任务只负责一个指定闭环；只有整个闭环达到静态完成判定，才把对应 `[ ]` 改为 `[x]` 并停止。所有闭环都受“禁止运行验证和发布”约束：可以读取源码、Git ref、GitHub 状态和 scoped diff，可以修改规则/技能/脚本/workflow/测试 contract，但不得执行测试 contract 或任何质量、构建、打包、签名、安装、workflow dispatch、真实 Draft 组装和公开发布。旧状态清退所需的 cancel/archive/delete 是本方案明确授权的一次性治理动作，不算新流程验证。

[x] 任务 1：安全清退旧发布实例与 `release/*` 命名空间
目标：
  让旧 0.7.1 尝试、旧 release 任务和旧分支不再占用控制面，为未来唯一精确分支 `release` 腾出 Git ref 命名空间，同时保留所有公开历史与 GitHub run 审计记录。
前置：
  重新读取本地/远端 `release/*` refs、活动 workflow、Codex 发布任务、Draft/Release/tag 状态；已知只读基线为三个旧 ref 相对 `dev` 均无独有提交，最新公开 tag 为 `v0.7.0`。
约束：
  先取消仍活动的旧发布 workflow/等待，归档旧发布与验收任务，删除未公开旧 Draft；逐个证明旧 ref 无独有提交后再删除对应本地/远端 `release/*`。不得删除公开 tag、公开 Release、run 历史、用户 dirty changes 或任何有独有提交的 ref；不得建立新的 `release`。
验收：
  没有活动旧发布任务或 workflow，没有未公开旧发布 Draft，没有 `release/*` 本地/远端 ref；公开 tag/Release 与 run 历史原样保留。只记录清退对象和保留对象，不运行任何新 workflow。
停工点：
  任一 ref 出现独有提交、Draft 已公开、任务仍包含用户尚未取回的独有成果，或权限不足以精确取消/归档/删除时停止，不做强制清理。
执行备注：
  已归档旧“发布 0.7.1 主线”任务，确认无活动 workflow 或未公开 Draft，并在证明无独有提交后删除本地 `release/0.7.1` 与远端 `release/0.6.5`、`release/0.7.1`，保留全部公开 tag/Release 和 run 历史。

[ ] 任务 2：统一仓库规则、发布技能与文案/修复技能
目标：
  让 agent 只会执行本方案定义的一套流程：唯一 `release`、branch-first 人类控制面、T7 顶层入口、release-only 修复、普通 merge-back、并行 release log、post-public metadata 和单 release 任务所有权。
前置：
  任务 1 完成；读取根及相关局部 `AGENTS.md`、`foliole-release`、`release-log-writer`、`foliole-hosted-quality-repair` 及其直接 SOP/reference，保留技能仓库和 Foliole 仓库的无关修改。
约束：
  按 `agents-maintainer` 和 `skill-creator` 治理现有文件，不新建同义技能，不把长 SOP 塞入根规则，不保留 `release/<version>`、人类精确 SHA、正式文案先提交、T6-first release、旧证据复用或 T7 自动建 repair 任务等兼容话术。这里只声明 local-quick/hosted-only/orchestrator/release-control 的客观分类原则与路由触发器；具体命令名称由任务 3 审计后回填。技能与仓库分别只修改、提交自身 owned hunk；不执行 skill validator。
验收：
  根规则提供短硬边界和路由，发布技能负责全生命周期编排，release-log 技能只负责仓库外工作稿/Draft body/公开后归档，hosted repair 技能区分 dev T6 与 release T7；四者对分支、版本、失败归属、文案、merge-back 和删除条件无矛盾，并明确具体质量入口名将在任务 3 收口。scoped diff 不含其他技能或产品代码。
停工点：
  规则需要新增持久 daemon/后台队列，技能目录无法写入，或同一 owned hunk 的既有用户修改无法保留时停止。
执行备注：

[ ] 任务 3：逐项建立 local-quick / hosted-only 命令契约
目标：
  审计所有现有质量入口的真实执行图，形成唯一机械登记表，使本地只可能进入明确有界的快速检查，中重度检查只能在 GitHub 执行。
前置：
  任务 2 完成；从 `package.json` scripts、`scripts/quality/**`、相关 runner、pre-push 与 workflow `run` 入口收集完整命令集合，不依赖文件名或工具关键词推断。
约束：
  每个入口逐项按五项 local-quick 条件分类为 `local-quick`、`hosted-only`、`orchestrator` 或 `release-control`；未知质量命令默认 hosted-only，未知外部 mutation 默认拒绝。删除 `quality-fast --full/--release` 及别名、环境变量或嵌套脚本中的本地升级路径；综合实现可以保留供 GitHub 调用，但普通本地调用必须 fail closed。`remote-quality.mjs` 改为 dev ref 上的 scoped orchestrator：人类只选择 scope，workflow event SHA 作为内部 target；release 禁止调用它。Draft body 编辑、作废 Draft/ref 删除和 public transition 分别登记为受状态约束的 release-control。审计完成后回填任务 2 所改规则中的具体入口名；同步更新命令 contract 测试，但不得执行。
验收：
  登记表覆盖所有公开 npm 质量入口、可达 runner、remote-quality orchestrator 和 release-control mutation；每项分类都能从真实展开范围解释，不含 Electron/Playwright/Gradle 等关键词规则；本地快速入口不存在通向 T5/T6/T7 或综合质量实现的参数路径，hosted workflow 仍有唯一明确入口，未登记命令机械拒绝。root/skill 的具体命令名与登记表一致；scoped source/diff 审阅不运行命令。
停工点：
  某入口的目标集合或成本在启动前无法判定、阻止本地升级必须破坏 GitHub 调用、或需要新依赖/后台服务才能分类时停止并回到方案。
执行备注：

[ ] 任务 4：重组同 run 的 T5 → T6 → T7 与自动双平台候选链
目标：
  把正式发布收敛为一个可见 T7 run：exact `release` push 触发，内部调用可复用 T6，T6 调用可复用 T5，随后完成 RC、macOS/Windows package 和唯一 Draft assembly；dev 定时 T6 保持独立入口。
前置：
  任务 3 完成；按第 4 节 workflow 清单读取 13 个现有文件及将新建的 T7，映射完整 reusable 调用树、secrets/permissions/environment、所有 workflow/job concurrency 和 artifact contract；只读核对 GitHub environment/secret/variable scopes 与 Azure Entra 联合凭据的 ref/subject/custom claim 条件。
约束：
  正式门禁只用同 run `needs` 与明确 outputs；不得查询历史 run 或用 `run-id`/`repository` 跨 run 下载 artifact。dev T6 和 T7 直接调用同一个 T6 文件，完整链不超过 GitHub Cloud 当前 10 层上限且不新增中间包装；release-call T6 禁止套用 scheduled duplicate-skip，非 success 不得放行。
  所有 concurrency 以显式 execution lane/ref/job identity 区分，dev T6 与 release T7 的 group 集合不相交，顶层与内层不重名；release lane 的新 push 取消旧候选。顶层只在 assembly job 授予 Release 写权限，package producers 使用最小 permissions、显式 secrets allowlist 与必要 environment；Azure/GitHub 仓库外 trust/scope 若不接受 exact `release` ref 或 reusable workflow claim，必须在此闭环同步更新，不能推迟到真实发布。
  package workflows 只产物化；assembly 按“公开即失败、不存在则建占位、未公开已存在则保留正文/设置并替换受管资产”三分支 reconcile。写 Draft 前核对本 run 仍对应远端 release tip。正式人类入口不要求版本或 SHA 输入，版本读取 branch 内容，内部 target_sha 从事件推导并逐 job 断言；post-public metadata paths 不触发 T7。基础设施失败只允许 UI re-run，不新增 manual SHA dispatch 或空提交。只更新 workflow contract 测试，不执行 YAML 检查、workflow、签名或 package。
验收：
  第 4 节 14 行 workflow 清单逐项落实且不存在未定去留；最深 reusable 调用路径、所有 secrets/environment/permissions 与全部 concurrency group 可静态列举，dev/release lane 不相交，caller/called 不会同组自取消；Azure OIDC 联合凭据和按分支/环境限定的配置已读到并与新 ref/claim 对齐。
  workflow graph 只有 T7 一个正式顶层入口，依赖顺序和失败短路清楚；独立 dev T6 仍可 schedule/manual 并在同一实现中先跑 T5；macOS/Windows 无 Draft 写权限或 Draft mutation step；assembly 是唯一受管资产 owner，release-log 是 Draft 正文唯一写者；同版本重复 T7、stale run、公开 Release、metadata-only push、版本变更和 infrastructure re-run 六类边界均有显式 guard。scoped diff 保留原有质量内容、签名、公证、安装检查、artifact 与 attestation 强度。
停工点：
  无法读取或安全更新 Azure OIDC/GitHub scope、reusable nesting 无法传递现有 secrets/permissions/outputs、平台签名必须脱离 GitHub 自动流程、调用树超过官方上限、concurrency 无法区分 dev/release lane，或单一 assembly 无法安全消费同 run 两平台产物时停止，不用历史证据、跨-run下载或第二 Draft owner 兜底。
执行备注：

[ ] 任务 5：统一 branch/version contract、Draft 文案与公开后更新闭环
目标：
  让 release target、doctor/evidence、release log、最终 publish、notes/manifest 与 Pages 只消费新状态机，彻底移除旧分支版本解析、人工 SHA 和候选前 committed release body 依赖。
前置：
  任务 4 完成；读取 `release-target-contract`、`release-workflow-evidence`、`release-doctor`、`remote-quality`、发布说明/notes/manifest 脚本以及 Pages workflow 的实际输入输出。
约束：
  exact `release` 的版本只从 branch 内容读取；formal T7 evidence 只来自当前 run。删除 `scripts/release-workflow-evidence.mjs` 及其专属测试和全部调用点，不保留可搜索旧 workflow path + SHA 的死入口。Draft body 可独立更新，候选前不要求 `releases/github/v<version>.md`；用户确认公开是唯一 public transition。公开后才生成正文归档、notes 和 manifest，metadata-only commit 不触发产品质量；Pages 只从 merge 后的 dev 发布已公开版本信号，并在 `deploy-release-manifest.yml` 本身查询/拒绝未公开版本，防止 manual dispatch 或手改 manifest 绕过。当前本地/远端都不存在 `main` ref，删除其触发。更新相关脚本与 contract 测试但不执行，不实际创建 Draft/Release/manifest。
验收：
  target/doctor 脚本不再解析 `release/<version>` 或要求人类 SHA，历史 evidence 脚本和专属测试已删除；release log working draft、placeholder Draft、public body、仓库归档各自只有一个所有者和清楚转换；manifest 生成器和 deploy workflow 双重拒绝未公开 Release；release→dev merge 前不会部署 Pages；旧 run/旧 body/旧 artifact 无法被新正式路径消费。
停工点：
  GitHub API 无法可靠区分 draft/public，Pages 必须从 release 直接部署，或正式 package 必须以 committed public body 为构建输入时停止，不恢复文案阻塞质检的旧路线。
执行备注：

[ ] 任务 6：收口监控、失败归属与新流程静态会审
目标：
  让任务系统只为独立 dev T6 创建 repair 任务，release T7 的全部红灯回到同一个发布主任务；同时删除所有残留旧术语和兼容入口，形成可交给下一次真实发布使用的单一体系。
前置：
  任务 5 完成；读取 `.codex/monitors/github-actions.json`、GitHub Actions handoff policy、相关提示模板、任务标题/归档规则以及本方案涉及的全部 scoped diff。
约束：
  monitor 只按“顶层 T6 workflow path + `dev` branch”机械匹配并创建一个 repair controller；删除 T5、RC、macOS、Windows、publish/T7 等死配置，正式 T7、嵌套 T5/T6 和平台 job 一律不自动建任务。release 主任务从 cut branch 起保持 pinned、到删除 branch 才允许归档；它用 quiet-wait 等待同一 run，并按首个失败 stage 给出 T5/T6/RC/macOS/Windows/assembly 分类。若用户主动关闭/中断，发布暂停，必须恢复同一 pinned 任务，不另建替代任务。静态搜索并移除旧 `release/<version>`、人工 SHA 人类入口、T6-first release、committed-body-before-quality、historical-evidence 和 duplicate-repair 路径，但不得运行搜索结果所指向的任何命令、测试或 workflow。
验收：
  逐项复核并落定：reusable 深度与单 T6 实现、完整 workflow 去留、OIDC/secrets/environment、dev/release concurrency 分离、Draft 三分支 reconcile、版本改号清退、pinned 主任务恢复、release-control 分类、同-run artifact、历史 evidence 删除、Pages public guard、tag 与 metadata tip 区分、monitor path+branch 过滤、版本 merge-back、infrastructure re-run。规则、技能、workflow、脚本、monitor 和模板之间没有第二套发布入口或旧兼容分支；每类失败只有一个 owner；旧成功 run 无法被新 T7 消费；所有修改均在预定路径和 scoped diff 内。方案状态可标记完成，但明确记录“尚未动态验证，下一次全新真实发布是首次运行”。
停工点：
  monitor 无法区分顶层 dev T6 与 release T7、release 主任务无法取得 run/stage 信息而必须创建后台 watcher，或静态会审发现需要产品代码/新协议/新依赖时停止并修订方案。
执行备注：
