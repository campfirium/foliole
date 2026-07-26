# AGENTS

## Scope

- 本文件适用于：`android/**`、`scripts/android/**`、`capacitor.config.ts`、Android 宿主同步、模拟器、部署、日志与 Capacitor Android 集成任务。
- 进入上述范围工作时，除根 `AGENTS.md` 外，必须同时遵守本文件。

## Android Host Rules

- Android 是正式宿主，不是临时试验目录；相关规则必须按宿主标准执行。
- Android 宿主优先通过 `Capacitor` 承载 companion Web 产物；禁止把共享业务逻辑直接写进 `android/**`。
- `android/` 只承载原生宿主工程、Gradle、Manifest、资源、平台权限与平台插件集成。
- Android Java / Capacitor 插件属于平台 adapter，只实现权限、生命周期、文件、SQLite 执行、bridge 落地与宿主 API 接入；不得承载上层流程或业务决策。
- Android 宿主只消费 `dist/companion` 构建产物；禁止把 Android 原生目录当作第二套业务前端目录。
- 若某能力既影响 Android 又可能影响未来 iPhone，优先先落到共享 bridge / contract 或 `src/companion/**`，再由 Android 宿主接入。
- 除原生权限、生命周期、intent、插件接缝与设备集成这类宿主特有能力外，Android 相关需求默认都应先复用或抽取 `src/shared/**` / `src/features/**` / 共享 contract；不得因为入口发生在 Android 就把节点列表、跳转逻辑、浏览语义、状态切换等非原生专属能力落到 Android / companion 私有实现。
- Android 首轮交付优先验证存储、生命周期、同步入口与真实数据复习闭环；不得先扩展桌面级 UI 宽度或复杂编辑表面。
- Android 权限、生命周期、文件访问、分享、intent、插件接缝改动，必须先核对 Capacitor 官方文档与 Android 官方文档。
- 实体 Windows Android Lab 是 Android 原生宿主与 A5 设备操作的唯一执行端；Mac 只允许编辑源码、运行不启动 Android 宿主的静态 / TypeScript 测试，以及通过 `scripts/windows/windows-android-lab-control.mjs` 发送 commit-bound、受审计的 controller request。Mac 不得启动本地 ADB、Gradle、Android Studio、模拟器或 scrcpy。

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
- 实体 Windows Android Lab 只允许 controller-owned、commit-bound、只读 checkout；必须使用独立于 Windows release acceptance 的 key、task、状态和证据根，禁止同步未提交改动、开放任意远程 shell 或让 Windows 写入 / 提交源码。

## Validation

- Android / Capacitor 相关改动默认先执行覆盖本轮能力闭环的最小验证；只有当能力闭环触及移动宿主根链路、Capacitor 宿主 / bridge 主链路、共享层 / 依赖、跨宿主联动、或你无法用相关验证证明影响已被覆盖时，才升级为 `npm run quality:android`、`npm run quality:shared` 或 `npm run quality:release`；`npm run quality:full` 只覆盖仓库级 JS/TS、桌面构建与 companion Web 构建，不跑 Android 原生宿主检查。
- 若改动触及 Android 权限、生命周期、Capacitor 插件、intent、安装 / 启动链路，或问题只会在模拟器 / 设备上暴露，必须将已提交的 clean `dev` 精确 HEAD 通过 Windows Android Lab 固定 LAN ref 交给 Windows 执行对应 `quality:android:device` / preview；Mac 本地不得替代该验收。
- Android 设备 serial、ADB、Gradle、安装、启动、截图、logcat、数据保护与镜像窗口只由 Windows worker 解析和执行；Mac controller 不接受任意远程 shell、working-tree 传输或“唯一 ready 设备”推断。
- Android 调试命令不得批量弹出终端窗口：自动化验证、ADB、PowerShell、Node、bash、截图、sync、deploy 等后台步骤必须使用隐藏窗口或无窗口进程；只有用户明确要操作手机时，才允许打开一个可见的 `scrcpy` 设备镜像窗口。
- Android companion UI 的人工验收默认以 Windows Lab 连接的 A5 真机为准；Windows worker 运行 `android:preview` 或 `quality:android:device` 并回传结构化状态、截图与日志，Mac 只负责发起和读取 evidence。
- 高频 companion UI 迭代需要真实 WebView、SQLite 或 Capacitor bridge 时，也由 Windows device adapter 运行 dev-server preview；它不替代 Windows 上最终的 `android:preview` / `quality:android:device` 验收。
- `npm run android:web:dev` 是跨宿主前台 companion Web 诊断入口；`android:preview:dev-server` 的 detached companion service 只由 Windows device adapter 管理，两者不得共用后台 service 或 PID/state 协议。
- `npm run android:preview:lite` 仍属于 Windows 真机预览链路的轻参数包装，不是浏览器 Web 轻量预览。
- Windows worker 内部继续使用 `package.json` 中已有的 `npm run quality:android*` 与 `npm run android:*`；Mac 只使用受限 Windows Android Lab controller，不直接运行这些宿主脚本，也不口头推荐裸 Gradle、adb 或 Capacitor 命令。
