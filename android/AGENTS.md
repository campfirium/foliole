# AGENTS

## Scope

- 本文件适用于：`android/**`、`scripts/android/**`、`capacitor.config.ts`、Android 宿主同步、模拟器、部署、日志与 Capacitor Android 集成任务。
- 进入上述范围工作时，除根 `AGENTS.md` 外，必须同时遵守本文件。

## Android Host Rules

- 用户说“继续 Android / 安卓主线”或“继续 Android / 安卓代码”时，默认只选择新增或修复 Android / companion 产品能力的实施闭环；`device evidence`、`manual acceptance`、`golden journey`、`post-acceptance` 以及 Windows DEV controller / device adapter / workflow 均不算产品代码，只有用户明确点名验收或控制流时才能作为任务目标。创建任务前必须读取目标 seed / plan 的 Task、Out Of Scope 与剩余 checkbox；若剩余项仅为验收或证据，必须报告“实现已完成，剩余为验收”，不得创建成代码任务。
- Android 是正式宿主，不是临时试验目录；相关规则必须按宿主标准执行。
- Android 宿主优先通过 `Capacitor` 承载 companion Web 产物；禁止把共享业务逻辑直接写进 `android/**`。
- `android/` 只承载原生宿主工程、Gradle、Manifest、资源、平台权限与平台插件集成。
- Android Java / Capacitor 插件属于平台 adapter，只实现权限、生命周期、文件、SQLite 执行、bridge 落地与宿主 API 接入；不得承载上层流程或业务决策。
- Android 宿主只消费 `dist/companion` 构建产物；禁止把 Android 原生目录当作第二套业务前端目录。
- 若某能力既影响 Android 又可能影响未来 iPhone，优先先落到共享 bridge / contract 或 `src/companion/**`，再由 Android 宿主接入。
- 除原生权限、生命周期、intent、插件接缝与设备集成这类宿主特有能力外，Android 相关需求默认都应先复用或抽取 `src/shared/**` / `src/features/**` / 共享 contract；不得因为入口发生在 Android 就把节点列表、跳转逻辑、浏览语义、状态切换等非原生专属能力落到 Android / companion 私有实现。
- Android 首轮交付优先验证存储、生命周期、同步入口与真实数据复习闭环；不得先扩展桌面级 UI 宽度或复杂编辑表面。
- Android 权限、生命周期、文件访问、分享、intent、插件接缝改动，必须先核对 Capacitor 官方文档与 Android 官方文档。
- Mac 是 Android 日常开发主机：源码、companion 构建、Capacitor sync、Gradle、固定 A5 的 ADB 安装 / 启动 / 日志与 instrumentation 必须在同一 Mac 工作区闭环，并使用 `node scripts/android/macos-a5-dev.mjs <registered-action>` 及 `scripts/android/macos-a5-action-registry.mjs` 当前登记的具名动作。该入口只接受内建 A5 serial，不卸载主应用、不清数据、不扫描或猜测设备，并在动作结束后停止本轮 ADB server；`device-profile` 只在可恢复基线成立后保留数据覆盖安装，证明系统命名档案与内容保持；配对凭据只由 `pair-credentials` 功能入口持有，初始或既有同步只由对应具名 scenario 持有。Android Studio 与模拟器不进入日常路径。
- Mac desktop DEV runtime 的明确测试 library 是固定 A5 的日常产品同步对象；源码、构建、ADB 与产品同步虽是独立链路，仍共同留在 Mac 当前工作区缩短内循环。Windows 不作为普通 Android 真机验收的前置；确需 Windows library 或跨宿主结论时按 `electron/AGENTS.md` 路由。
- Foliole Android 日常自动化默认不得使用 Computer Use；Mac 本地 CLI 与固定 A5 证据足够时不得打开 Android Studio、Windows App 或可见终端。只有目标依赖真实可见交互且现有固定入口无法表达时，才重新评估可见操作。

## Legacy E-Reader Compatibility

- 低版本 Android 兼容目标限定为电子墨水屏 / 阅读器基础可用，不等同于支持所有旧手机或追求现代移动端完整视觉一致性。
- Android 9 / WebView 74 这类旧阅读器环境必须优先保证启动、同步、目录、浏览、阅读、搜索与基础设置可用；白屏、崩溃、布局坍塌、核心点击目标不可用属于必须修复。
- 旧阅读器兼容允许静态视觉降级；不得为低版本 Android 追求动效、复杂过渡、玻璃 / 模糊、动态色彩、精细阴影或高刷新视觉效果。
- 兼容修复优先落在 companion 构建链、WebView runtime polyfill、Android 原生 API 版本边界或共享平台 adapter；禁止为旧 Android 复制一套业务 UI 或业务流程。
- 面向旧 WebView 的 CSS / JS 兼容处理必须尽量保持单 APK、单 companion 代码路径；只有用户明确要求或发布策略明确分包时，才为旧 Android 单独打包。
- 若 Android 9 兼容与现代桌面 / 移动视觉效果冲突，优先保留现代主路径，同时为阅读器提供不破坏核心阅读与同步路径的降级。

## Read Before Editing

- 任务涉及 Capacitor 宿主、目录规划或 companion 接缝时，先读 `.lab/specs/architecture/multi-target-repo-layout-expectation.md`。
- 任务涉及 Android companion 目标范围与裁剪边界时，先读 `.lab/specs/shared/platform/android-companion-expectation.md`。
- 任务涉及 Android 开发环境与宿主职责时，按需读取 `.lab/specs/shared/platform/android-dev-environment-expectation.md`。

## Implementation Rules

- 不得把 React 业务状态、review 语义、同步语义或数据模型复制到 `android/**`；共享逻辑应继续留在 TypeScript 共享层。
- 新增 Android 能力时，先判断是否应通过 Capacitor 插件 / bridge 暴露；禁止直接让 feature 层感知 Android API。
- `capacitor.config.ts` 的 `webDir` 必须继续指向 `dist/companion`；若需要调整，必须连同 companion 构建与宿主同步链路一起说明。
- Android 原生壳新增配置、权限或插件接入时，必须同步检查 `scripts/android/**` 现有工作流是否需要更新。
- 除非用户明确要求，不得把 Android 特有实现回写成全仓默认路径。
- Android / companion 侧凡会写入移动端 SQLite 的同步、复习、资源落库、cursor、配对或 workspace sync metadata 路径，必须经共享的 companion sync writer queue 串行化；已处在同一个 writer task 内部的内部 cursor 保存不得再次嵌套排队，避免自锁。
- Mac 本地 A5 日常开发动作直接消费当前工作区源码，不要求先提交或 push。动作承担闭环最终宿主验收时，先提交候选并使用 `node scripts/android/macos-a5-dev.mjs <action> --formal`；build-bearing formal 动作从开始时冻结的完整 `refs/heads/dev^{commit}` 导出一次性可写 Git archive capsule，在其中执行 `npm ci`、Web/Capacitor/Gradle 构建并生成 durable provenance receipt；需要 hidden desktop 的 formal 动作还必须依据同一 capsule 的锁文件与 Electron bundle 指纹复用或物化根 `.cache` 的隐藏 Electron runtime，并记录版本与 executable digest，不得读取当前工作区依赖或回退。只有 complete receipt 才向 stdout 投影 accepted tip，失败 receipt 不得声明 accepted tip；当前工作区的未提交、ignored、依赖与生成物既不阻塞也不进入候选。controller 必须显式区分源码/构建、controller state、证据、设备备份、hidden desktop runtime 与固定 DEV library；设备或资料库 mutation 动作由 ordinary/formal 共用的固定 A5 排他 lease 保护，并发 owner 直接拒绝且只在能证明旧 owner 已退出时恢复，不等待、轮询、偷锁或递归清理其他 run。`status` 只取得保护 ADB 启停的 read-only lifecycle lease，不取得 mutation lease，也不声明设备既有安装属于 accepted tip；`build` 不取得 device lease，也不启停 ADB。
- 固定 ADB port 是 device adapter 的命令 contract，不是常驻 server contract；普通 SSH 动作必须在同一前台生命周期内以固定 port 和显式 serial 完成冷启动、设备操作与收口，不得要求 ADB server 跨 SSH 会话存活，也不得为保活引入 detached process、logon task、service、broker、无线或 GUI fallback。
- Mac A5 日常动作必须机械分流：`status` 只读取固定设备、应用与 workspace readiness；`build` 完成 companion web build、Capacitor sync 与无 daemon debug / androidTest APK 构建；`deploy` 先执行同一 build，再用 `adb install -r` 保留数据覆盖安装、冷启动并复核 readiness。任一阶段失败必须按原阶段失败，不得卸载、清数据、使用 install cache 掩盖 stale assets 或隐式回退其他宿主。
- `capture-annotation` 由 Mac 固定入口运行 Capture/Cloze/Note 重启验收：同轮准备 Web/Capacitor 产物并构建、保留数据替换主 APK、安装匹配测试 APK、执行唯一方法、只读审计后清理测试包；不得接受外部测试类或 ADB 参数，不得清数据、卸载主包、选择设备、启动后台服务或隐式 fallback。跨宿主兼容入口按 `electron/AGENTS.md` 路由，并复用 `scripts/android/android-a5-capture-annotation-*` 共享核心。
- 日常 credential/join/sync 切换只允许由 Mac 固定入口的 `pair-credentials`、具名同步 scenario 与 lifecycle action 把 A5 连接到显式锁定的 Mac desktop DEV 测试 library：先以只读预检拒绝多库、多设备、未同步数据、既有 endpoint、未证明的配对凭据/peer 或外来请求，再经产品已有发现、申请、批准和 workspace sync 路径完成。旧 `pair-sync` 与 Windows `pair-sync-recover` 明确 unsupported，不得兼容转发；现有入口不得接受自由参数、清数据、直接写数据库或配对偏好、读取或输出凭据、使用 reverse，亦不得把审批歧义降级成自动选择。

## Validation

- Android / Capacitor 相关改动默认先执行覆盖本轮能力闭环的最小验证；A5 日常开发验收由 Mac 固定本地入口执行，CI 级 clean / bundled / release-like 终检只在发布、T6/T7 或用户明确要求时升级。只有当能力闭环触及移动宿主根链路、Capacitor 宿主 / bridge 主链路、共享层 / 依赖、跨宿主联动、或你无法用相关验证证明影响已被覆盖时，才升级为 hosted `quality:android`、`quality:shared` 或 `quality:release`。
- 固定 A5 验收若在 mutation 前创建保护备份或数据库快照，必须由当前数据库 owner 产生一致快照，或先正常停止应用写入并按 SQLite 语义完整携带相关 WAL / SHM；不得把运行中只复制主 `.db` 文件当成可恢复备份或验收证据。快照必须先通过完整性与预期 identity / group / timeline / 数据计数检查，失败时不得继续安装、配对、清理或同步动作。
- 若改动触及 Android 权限、生命周期、Capacitor 插件、intent、安装/启动链路，或问题只会在设备上暴露，必须在 Mac 固定 A5 上完成适用的本地动作；目标同时依赖 Windows desktop/library 时，再按 `electron/AGENTS.md` 追加对应 fixed action。现有固定入口无法表达的清数据、模拟器或可见 UI 验收必须停下重新评估，不得绕过入口直接执行。
- Android 设备 serial、安装、启动、截图、logcat 与数据保护由 Mac 固定入口解析和执行，不接受调用方设备选择或“唯一 ready 设备”推断。
- Android 调试命令不得批量弹出终端窗口：自动化验证、ADB、PowerShell、Node、bash、截图、sync、deploy 等后台步骤必须使用隐藏窗口或无窗口进程；只有用户明确要操作手机时，才允许打开一个可见的 `scrcpy` 设备镜像窗口。
- `npm run android:web:dev` 是跨宿主前台 companion Web 诊断入口，不具备真机、SQLite 或 Capacitor 宿主验收语义，也不得后台化。
- hosted Linux 的 `android:sync`、`android:host:lint`、`android:host:test` 只服务 GitHub T6 原生宿主质量检查，不是 Windows 或 A5 设备入口。
- Mac fixed adapter 只调用具名、显式 serial 的 purpose-specific helpers；日常使用固定入口，不口头推荐散落的裸 Gradle、ADB 或 Capacitor 命令。`deploy` 成功必须同时证明覆盖安装、Activity、workspace readiness 与数据保留，不能只证明 activity 前台。
