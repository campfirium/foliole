# AGENTS

## Scope

- 本文件适用于 `ios/**`、`scripts/ios/**` 及 iPhone / iPad 原生宿主集成任务。
- iOS 宿主基于 Capacitor 8、Swift Package Manager 与 Xcode 26；除根 `AGENTS.md` 外，必须同时遵守本文件。

## iOS Host Rules

- iOS 与 Android 同属 companion 原生宿主层；共享业务逻辑继续优先留在 TypeScript 共享层与 `src/companion/**`。
- `ios/` 只承载 Capacitor iOS 原生工程、Xcode 工程、Info.plist、资源、权限与平台插件集成。
- iOS 可按共享 capability / bridge contract 接入 companion 产品能力，包括 Sync Group；业务语义、永久状态模型与前端实现仍必须留在共享层，`ios/` 只实现可验证的原生宿主接缝，禁止共享状态副本或第二套业务实现。
- 当前已建立的原生能力包含 `FolioleCompanionBootstrap`、Keychain 配对与本地网络请求、既有格式同步包的校验下载与本地 apply；bootstrap 必须通过 Capacitor SQLite 初始化共享 schema、持久化稳定的 iOS 设备身份并仅在数据库可读写后报告 ready，配对密钥必须只存 Keychain，工作区状态必须从共享 SQLite 真相加载，sync-pack transfer 必须在返回 cache DB 前完成同源 envelope / 目标身份 / SQLite 预检，apply 必须复用共享 `DbPort` 语义并将游标持久化到 `companion_meta`。新增 Sync Group 等能力必须先登记共享 runtime capability 与 bridge contract；方法缺失或宿主失败时显式拒绝，不得隐式回退为 Web、空对象或乐观默认状态。
- 不得把 iOS 宿主目录当作第二套业务实现目录；禁止把共享业务逻辑写进 Swift / Objective-C 宿主层。
- 若某能力同时影响 Android 与 iOS，优先先抽到共享 bridge / contract，再分别接入宿主。
- iOS 权限、生命周期、文件访问、分享、后台行为与插件接缝改动，必须先核对 Capacitor 官方文档与 Apple 官方文档。
- iOS Bundle ID 固定为 `com.foliole.ios`；`capacitor.config.ts` 继续保留 Android 现有身份，禁止用 iOS 接入改写 Android Application ID。

## Validation

- iOS 公开最小流程：`npm run android:web:build`、`npx cap sync ios`、`xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build`。
- 不需要真实 iOS runtime 的改动先使用登记的显式文件检查；`quality:ios*` 与 `ios:sync:preflight` 均为 hosted-only。开发线程的中度 iOS 质检只在 `dev` 使用 `npm run quality:remote -- --scope ios`；自动化 Simulator 全检只进入 `--scope full` 或 T5 nightly full。内部 target commit 由 workflow 事件决定，人类不得输入 SHA。完整验收覆盖 runtime capability、bootstrap、配对 / Keychain、同步状态、sync-pack apply、永久游标、首次建库与进程重启持久化，每个场景使用独立证据目录，只关闭自己启动的设备，不接触正式模拟器应用或真机数据。交互式、视觉、难复现诊断、脚手架修改后的单场景复跑与真机验收仍留在本机；不得为质检隐式 commit / push。
- 隔离 Simulator 验收必须保留 Xcode 的本地签名并在安装前验证签名；`CODE_SIGNING_ALLOWED=NO` 只用于不运行 App 的通用编译检查，不得复用其产物验收 Keychain 或可见运行态，否则会产生缺少 entitlement 的假红灯。
- 需要人工打开工程时使用 `npx cap open ios`；需要模拟器或真机可见验收时使用 `npx cap run ios --target <device-id>`。
- 宿主或插件变更先完成 companion build 与 `npx cap sync ios`，再执行无签名原生构建；用户可见行为进入 iOS runtime 后必须追加模拟器或真机验收。
- iOS sync / SQLite 宿主工作开工后，通过 dev-only Remote Quality 的 full scope 请求 `ios:sync:preflight` hosted 证据；该入口先跑 SQL surface scan，再跑 macOS / Xcode 环境下的 SQLite capability gate，不得在普通本地任务执行。
- 非 iOS 日常质量入口不默认执行 iOS preflight；`sync:sql-surface:scan` 只有在扫描范围出现 `iosRuntime` capability 标记时，才把 iOS runtime 缺口升级为硬失败。
- 一旦仓库引入新的 iOS 宿主脚本或 npm 入口，本文件必须同步补上对应公开命令、最小验证顺序与预览 / 验收规则。
- Fri 开发构建与真机操作的公开入口是 `node scripts/ios/fri-dev-workflow.mjs`。它只消费当前 cwd，依次执行 companion build、`npx cap sync ios`、固定 wired Fri 的签名 XCUITest，并把独立 `com.foliole.ios.devworkflow` 开发应用重新留在前台；最小验证先跑对应窄测试与 lint、通用无签名 iOS build，再在 wired Fri 上检查 `.xcresult` summary、设备详情与导出截图。不得用该入口触及正式 `com.foliole.ios`、改用无线 / Simulator，或插入 Git 源码准备。
- 本地 journey readiness 先以 `node scripts/journey-readiness-cli.mjs --output .tmp/artifacts/journey-readiness/dry-run/receipt.json` 攻击共享 fail-closed 合同；窄验证与候选提交完成后，使用 `node scripts/with-resource-gate.mjs exclusive -- node scripts/macos/journey-readiness-local-qualification.mjs` 执行唯一正式 Mac / 签名 Simulator qualification。该入口内部依次完成 companion build、`npx cap sync ios`、干净候选冻结、独占 Simulator 创建 / 签名校验 / 安装、receipt enforcement 与精确删除；`FOLIOLE_JOURNEY_READINESS_SCENARIO=device-identity` 只在同一入口和 exclusive gate 内追加登记的设备锚点单场景，并在场景后重新核对冻结候选；禁止把生成的本地 `ready` 外推到真机或其他宿主。
- iOS runtime contract 的 Swift/SwiftPM module cache、scratch build cache，以及验收共用的 DerivedData / SourcePackages / ModuleCache 路由到根 `.cache/`；单次应用副本与证据继续进入 `.tmp/artifacts/`。写入或命中 Foliole 自管 Cache 的顶层生产入口必须先走登记的本地 artifact/cache 维护能力。
