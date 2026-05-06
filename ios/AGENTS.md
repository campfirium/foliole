# AGENTS

## Scope

- 本文件适用于未来 `ios/**` 宿主目录及 iPhone / iPad 原生宿主集成任务。
- 当前 `ios/` 仍是预留目录；一旦开始接入 iOS 宿主，除根 `AGENTS.md` 外，必须同时遵守本文件。

## iOS Host Rules

- iOS 与 Android 同属 companion 原生宿主层；共享业务逻辑继续优先留在 TypeScript 共享层与 `src/companion/**`。
- `ios/` 只承载 Capacitor iOS 原生工程、Xcode 工程、Info.plist、资源、权限与平台插件集成。
- 在 iOS 仍处于占位阶段时，`ios/` 只允许保留规则、占位与未来宿主脚手架文件；禁止提前写业务逻辑、共享状态副本或第二套前端实现。
- 不得把 iOS 宿主目录当作第二套业务实现目录；禁止把共享业务逻辑写进 Swift / Objective-C 宿主层。
- 若某能力同时影响 Android 与 iOS，优先先抽到共享 bridge / contract，再分别接入宿主。
- iOS 权限、生命周期、文件访问、分享、后台行为与插件接缝改动，必须先核对 Capacitor 官方文档与 Apple 官方文档。

## Validation

- iOS 宿主正式接入前，不要求默认执行 iOS 预览命令。
- iOS sync / SQLite 宿主工作开工前，先执行 `npm run ios:sync:preflight`；该入口先跑 SQL surface scan，再跑 macOS / Xcode 环境下的 SQLite capability gate。
- 非 iOS 日常质量入口不默认执行 iOS preflight；`sync:sql-surface:scan` 只有在扫描范围出现 `iosRuntime` capability 标记时，才把 iOS runtime 缺口升级为硬失败。
- 一旦仓库引入新的 iOS 宿主脚本或 npm 入口，本文件必须同步补上对应公开命令、最小验证顺序与预览 / 验收规则；不得继续停留在占位态。
