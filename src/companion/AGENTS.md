# AGENTS

## Scope

- 本文件适用于：`src/companion/**` 以及 companion renderer shell 相关任务。
- 进入上述范围工作时，除根 `AGENTS.md` 外，必须同时遵守本文件；若任务同时触及 `android/**` 或 `capacitor.config.ts`，还必须补读 `android/AGENTS.md`。

## Companion Surface Rules

- `src/companion/**` 是独立的 companion renderer shell，不是 `src/app/**` 的缩小复刻。
- Android / iPhone companion 默认服务高频查看、复习、轻量操作与移动上下文，不直接继承桌面高密度布局、多面板、hover 强依赖或键盘驱动命令流。
- 共享的小颗粒 UI、共享 bridge、共享 contract 可以复用 `src/shared/**` 与 `src/shared/platform/**`；禁止直接 import Electron 宿主实现。
- companion 页面壳、路由、移动交互和触屏表面留在 `src/companion/**`；不要重新塞回 `src/app/**`。
- 除移动端特有的页面壳、手势、布局密度、导航编排与少量触屏交互包装外，companion 默认不新增私有能力实现；节点列表、列表项表面、breadcrumb 跳转、选择逻辑、浏览语义、状态切换与其他 desktop/移动共享能力，必须先收敛到 `src/shared/**`、`src/features/**` 或现有共享层，再由 companion 消费。

## Read Before Editing

- companion UI 改动前必须先读 `DESIGN.md` 与 `.lab/specs/shared/ui/llm-ui-rules.md`。
- 任务涉及 companion 产品边界时，先读 `.lab/specs/shared/platform/android-companion-expectation.md`。
- 任务涉及共享平台边界或宿主可移植性时，按需读取 `.lab/specs/shared/platform/runtime-portability-expectation.md`。

## Implementation Rules

- companion renderer 不得直接依赖 Electron-only bridge、Windows-only 路径、桌面专属运行假设或 sqlite 直连。
- companion 不得自行发明与 desktop 既有实现平行的业务逻辑、review 逻辑、队列逻辑、状态推进或持久化语义；开始实现前必须先检查 desktop / shared 是否已有现成真相。
- 若 desktop 已有对应业务能力且该能力不是宿主私有差异，必须先抽到 `src/shared/**` 或现有共享层，再由 companion 接入；禁止为了赶进度把相同语义临时写在 `src/companion/**`。
- 若某能力只是“在移动端被点击/展示”，但其实体、动作语义、列表语义、跳转语义与 desktop 相同，仍按共享能力处理；不得把这类能力误判为 companion 私有 UI 后直接写在 `src/companion/**`。
- 需要宿主能力时，优先走 `src/shared/platform/**` 的稳定调用面；若当前调用面不足，先补 contract，再接宿主。
- companion 表面涉及持久化结果时，必须明确对应的 bridge / runtime / storage 闭环；不得只做 Web 壳即时态。
- 若一个交互只适用于移动端，优先留在 companion 壳，不要把平台分支散落到共享 feature 里。
- companion 可调整布局、密度、触屏交互和样式表达，但不得改写共享业务语义；若发现现有 desktop 实现过于宿主耦合，应先做最小共享化重构，再继续 companion 接线。

## Validation

- companion 改动默认先执行与本次改动直接相关的最小验证，并在汇报前执行 `npm run android:preview`；只有当改动触及移动共享 bridge、Capacitor / Android 宿主主链路、共享层 / 依赖、跨宿主联动、或你无法用相关验证证明影响已被覆盖时，才升级为 `npm run quality:android`、`npm run quality:shared` 或 `npm run quality:full`。
- 对话协作模式下，只要改动触及 `src/companion/**` 或移动共享 bridge，汇报前必须执行 `npm run android:preview`。
- 执行 `npm run android:preview` 后，汇报中必须包含实际命令与最终状态字段：`status: SYNCED` / `OPENED` / 失败原因。
