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

## Implementation Rules

- companion renderer 不得直接依赖 Electron-only bridge、Windows-only 路径、桌面专属运行假设或 sqlite 直连。
- 开始实现前必须先检查 desktop / shared 是否已有现成真相；不得在 `src/companion/**` 平行重写业务逻辑、review 逻辑、队列逻辑、状态推进或持久化语义。
- 需要宿主能力时，优先走 `src/shared/platform/**` 的稳定调用面；若当前调用面不足，先补 contract，再接宿主。
- companion 表面涉及持久化结果时，必须明确对应的 bridge / runtime / storage 闭环；不得只做 Web 壳即时态。
- 若一个交互只适用于移动端，优先留在 companion 壳，不要把平台分支散落到共享 feature 里。
- companion 可调整布局、密度、触屏交互和样式表达，但不得改写共享业务语义；若发现现有 desktop 实现过于宿主耦合，应先做最小共享化重构，再继续 companion 接线。

