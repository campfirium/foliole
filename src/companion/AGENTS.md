# AGENTS

## Scope

- 本文件适用于：`src/companion/**` 以及 companion renderer shell 相关任务。
- 进入上述范围工作时，除根 `AGENTS.md` 外，必须同时遵守本文件；若任务同时触及 `android/**` 或 `capacitor.config.ts`，还必须补读 `android/AGENTS.md`。

## Companion Surface Rules

- `src/companion/**` 是独立的 companion renderer shell，不是 `src/app/**` 的缩小复刻。
- Android / iPhone companion 默认服务高频查看、复习、轻量操作与移动上下文，不直接继承桌面高密度布局、多面板、hover 强依赖或键盘驱动命令流。
- 共享的小颗粒 UI、共享 bridge、共享 contract 可以复用 `src/shared/**` 与 `src/shared/platform/**`；禁止直接 import Electron 宿主实现。
- companion 页面壳、路由、移动交互和触屏表面留在 `src/companion/**`；不要重新塞回 `src/app/**`。
- 除移动端特有的页面壳、手势、布局密度、导航编排与少量触屏交互包装外，companion 默认不新增私有业务能力；与 desktop 同名、同责或用户感知相同的能力必须先收敛到共享层，再由 companion 消费。

## Read Before Editing

- companion UI 改动前必须先读 `DESIGN.md` 与 `.lab/specs/shared/ui/llm-ui-rules.md`。
- 任务涉及 companion 产品边界时，先读 `.lab/specs/shared/platform/android-companion-expectation.md`。
- 任务涉及共享平台边界或宿主可移植性时，按需读取 `.lab/specs/shared/platform/runtime-portability-expectation.md`。

## Implementation Rules

- companion renderer 不得直接依赖 Electron-only bridge、Windows-only 路径、桌面专属运行假设或 sqlite 直连。
- 开始实现前必须先检查 desktop / shared 是否已有现成真相；不得在 `src/companion/**` 平行重写业务逻辑、review 逻辑、队列逻辑、状态推进或持久化语义。
- 需要宿主能力时，优先走 `src/shared/platform/**` 的稳定调用面；若当前调用面不足，先补 contract，再接宿主。
- companion 表面涉及持久化结果时，必须明确对应的 bridge / runtime / storage 闭环；不得只做 Web 壳即时态。
- 若一个交互只适用于移动端，优先留在 companion 壳，不要把平台分支散落到共享 feature 里。
- companion 可调整布局、密度、触屏交互和样式表达，但不得改写共享业务语义；若发现现有 desktop 实现过于宿主耦合，应先做最小共享化重构，再继续 companion 接线。

## Validation

- companion 改动默认先执行覆盖本轮能力闭环的最小验证；只有当能力闭环触及移动共享 bridge、Capacitor / Android 宿主主链路、共享层 / 依赖、跨宿主联动、或你无法用相关验证证明影响已被覆盖时，才升级为 `npm run quality:android`、`npm run quality:shared` 或 `npm run quality:full`。
- `npm run android:web:dev` 是跨宿主前台 companion Web 入口，只作为空态壳层或启动烟测的可选诊断；它运行在 `web-preview` bootstrap 下，`database_ready` 为 `false`，不创建 detached service 或 PID/state，不作为 Android companion UI 人工验收路线。
- 真实 A5 日常宿主只通过 `scripts/android/macos-a5-dev.mjs` 的 fixed action 接入；Windows fixed action 只用于 Windows 专属或最终跨宿主验收。renderer/native 路由与验收证据要求由 `android/AGENTS.md` 统一维护。若现有动作不足以验收真实 companion 内容、持久化结果或 Android WebView CSS，必须停下重新评估，不得直接调用 adb、Gradle 或另建真机入口。
- companion UI 最终验收的真机 L1 触发条件由 `android/AGENTS.md` 维护；凡需要查看真实 companion 内容、持久化结果或 Android WebView CSS 兼容，仍必须按该规则走真机最终 L1。
