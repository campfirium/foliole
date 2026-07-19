# AGENTS

## Scope

- 本文件适用于 `ios/**` 宿主目录及 iPhone / iPad 原生宿主集成任务。
- iOS 宿主基于 Capacitor 8、Swift Package Manager 与 Xcode 26；除根 `AGENTS.md` 外，必须同时遵守本文件。

## iOS Host Rules

- iOS 与 Android 同属 companion 原生宿主层；共享业务逻辑继续优先留在 TypeScript 共享层与 `src/companion/**`。
- `ios/` 只承载 Capacitor iOS 原生工程、Xcode 工程、Info.plist、资源、权限与平台插件集成。
- 当前 iOS 仅进入宿主预备阶段；禁止提前写业务逻辑、共享状态副本或第二套前端实现。
- 当前正式原生能力只包含 `FolioleCompanionBootstrap`；它必须通过 Capacitor SQLite 初始化共享 schema、持久化稳定的 iOS 设备身份，并且仅在数据库可读写后报告 ready，其他 Android-only runtime 能力不得隐式回退为 Web 实现。
- 不得把 iOS 宿主目录当作第二套业务实现目录；禁止把共享业务逻辑写进 Swift / Objective-C 宿主层。
- 若某能力同时影响 Android 与 iOS，优先先抽到共享 bridge / contract，再分别接入宿主。
- iOS 权限、生命周期、文件访问、分享、后台行为与插件接缝改动，必须先核对 Capacitor 官方文档与 Apple 官方文档。
- iOS Bundle ID 固定为 `com.foliole.ios`；`capacitor.config.ts` 继续保留 Android 现有身份，禁止用 iOS 接入改写 Android Application ID。

## Validation

- iOS 公开最小流程：`npm run android:web:build`、`npx cap sync ios`、`xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build`。
- iOS 日常自动验收使用 `npm run quality:ios`；它在独立的 `com.foliole.ios.bootstrap-acceptance` Simulator 应用中验证构建、首次建库与进程重启持久化，不接触正式模拟器应用或真机数据。
- 需要人工打开工程时使用 `npx cap open ios`；需要模拟器或真机可见验收时使用 `npx cap run ios --target <device-id>`。
- 宿主或插件变更先完成 companion build 与 `npx cap sync ios`，再执行无签名原生构建；用户可见行为进入 iOS runtime 后必须追加模拟器或真机验收。
- iOS sync / SQLite 宿主工作开工前，先执行 `npm run ios:sync:preflight`；该入口先跑 SQL surface scan，再跑 macOS / Xcode 环境下的 SQLite capability gate。
- 非 iOS 日常质量入口不默认执行 iOS preflight；`sync:sql-surface:scan` 只有在扫描范围出现 `iosRuntime` capability 标记时，才把 iOS runtime 缺口升级为硬失败。
- 一旦仓库引入新的 iOS 宿主脚本或 npm 入口，本文件必须同步补上对应公开命令、最小验证顺序与预览 / 验收规则。
