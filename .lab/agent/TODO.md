# TODO

## 待办

- [ ] [gate] node-icon: 在真实界面人工验收节点列表的层次与图标开放能力，确认“非派生更高字重、派生保持正常颜色”的层次成立，自定义单/双 SVG 在常用缩放和主题下可接受；若用户上传效果差的 SVG，产品只需保证不崩溃、有默认回退，不要求替用户纠正素材质量。

- [ ] [gate] node-status-icon-followup: 已将节点状态图标从 session 语义切为持久三态语义：`pending / active / dismissed`，其中 `pending=尚未被 review flow 处理过`（reading 用 `repetitionCount === 0`，review 用 `lastReviewAt === null`），`active=其余正常状态`，`dismissed` 仍只对应 reading 的 `dismissed`；本地质量闸与 `windows:preview` 均已通过，但用户在真实 Windows 客户端仍未看到新图标表现。下轮需优先确认当前可见客户端是否真正加载了最新 renderer 资源，并记录 `windows:preview` 为何在 `status: SYNCED` 的 renderer-only 路径下未让可见客户端反映本次前端改动；未确认前不得把该任务视为已完成。

- [ ] [auto] review-mode-session-sync-followup: 继续修正复习模式下“左侧节点选择 / 中间文档区 / 底部工具条 / queue live”四者状态不一致的问题；当前真实现象已由用户在 Windows 端持续确认：中间内容与右侧 Dev panel 可能已经显示 `Review` / `cloze` 节点，但底部工具条与 queue live 仍长期落在 `Later / Read / Dismiss` 的 reading 态，表现为“当前工作条几乎只剩 reading material，看不到应出现的测试卡”。已确认工作条来源不是 `activeNodeId`，而是 `reviewSession.currentNodeId`；因此这不是单纯 `review item kind` 判定错误，而是 `activeNodeId`、`reviewSession.currentNodeId` 与实际可见节点之间仍存在未查清的漂移链路。此前提交 `598b6ca` 只覆盖了“点击 queued 节点时同步改写 review session”的一条路径，用户已明确反馈真实问题仍未解决，只能视为中间态；提交 `47afe99` 又修正了两个确定错误：1) 重复打开已 active 的 queued 节点时不再错误早退，可继续把 review session 头节点对齐；2) `Later` 不再只是把 reading 项挪到当前队尾，而会真正写回 `lastHandledAt / nextAt / repetitionCount`，按 reading 调度规则推进下次出现时间；本轮进一步补上了另一条确认漏网路径：`goBack` / `goForward` / `goToParent` / breadcrumb ancestor jump 现在也会在跳到 queued 节点时同步改写 review session，并已有 `app-smoke-review-navigation-sync` 回归锁定。上述修复均已过本地质量闸与 `windows:preview`，但是否完全命中用户在 Windows 端看到的主问题仍待真实客户端复核。下轮必须优先在真实 Windows 客户端采样并记录：开始复习后每一步的 `reviewSession.queueNodeIds`、`reviewSession.currentNodeId`、`activeNodeId`、`reviewQueueVisibility.currentQueueLabel`、`data-review-item-kind`、中间文档节点 id、以及 Dev panel 当前 node id 是否一致；重点确认是 queue planner 实际把 FSRS 项排在 reading 项之后，还是 renderer/store 某条仍未覆盖的导航链路把 session 头节点重新冲回 reading 项。
  - 本轮已再补一条 store 层 direct-write 漏口：`setActiveNode`、create node、delete/restore/permanent delete 等直接改写 `activeNodeId` 的路径现在会统一经过 `workspaceReviewSessionSync` 对账 helper；若 active node 切入 queued 节点，或当前 review 节点被移出/删除，`reviewSession.currentNodeId`、`queueNodeIds` 与 `isAnswerRevealed` 会一并同步，并已有 `workspaceStoreReviewSessionSync.test.ts` 锁定 queued 直切与删除当前 review 节点两条回归。
  - 已补充一条非 session 侧的可观测性修正：右侧 `Review queue` 已不再只看 `reviewSession.queueNodeIds`，而改为显示包含 scheduled 项在内的 whole unified queue；因此后续 Windows 端若仍出现“面板里看不到检测卡”，需优先区分是 due/live session 漂移，还是 runner/relearn 没把检测卡重置回未初始化状态。

- [ ] [gate] push-queue: 以 `.lab/specs/40-unified-push-queue-spec-v1.md` 和上述 8 条 `[auto] push-queue` 产物为验收基线，在真实工作区做人审；逐项确认设置界面可理解并可改、节点级 priority/retention 配置与继承语义符合文档、reading 按精确 `nextAt` 推进、常规优先级桶的 Roulette 取牌分布可接受、以及 `1 阅读 : 5 测试` 的实际队列表现符合预期。若发现 UI 文案、行为或可见性与 40 号文档不一致，先回写 TODO 再修。

## 待验证

- [ ] [gate] desktop: 在后续真实更新场景下补做 Windows renderer-only 更新的人审，确认仅前端变更时 `windows:preview` 可直接让当前可见客户端看到更新，且不需要手工重启。
- [ ] [auto] desktop: 排查本次 node status icon 三态改动在 `npm run windows:preview` 返回 `status: SYNCED` 后仍未出现在真实 Windows 客户端的问题；最小目标是区分“代码已同步但当前可见客户端未加载新 renderer”与“预览脚本错误判定 sync-only”，并补充可复现证据，避免后续继续把 `SYNCED` 误判为用户可见已生效。
- [ ] [gate] desktop: 在后续真实更新场景下补做 Windows main/preload 更新的人审，确认 `electron/` 相关变更时 `windows:preview` 会触发当前客户端内的 Electron 自重启。
- [ ] [auto] desktop: 补齐可信运行态诊断与回归，要求诊断输出可区分“进程存在”“runtime 已识别”“renderer 已完成导航”“当前可见窗口 bridge 可用”；当前已修复 Windows runtime 主进程命令行识别正则，并新增 renderer navigation/state 落盘诊断，待在 renderer 卡死根因明确后复核整条状态机。

## 可选

- [ ] [auto] arch: 维护 `.lab/specs/37-structure-convergence-execution-v1.md` 与 `.lab/specs/31-platform-architecture-decision-v1.md` 的一致性；当目录边界、迁移批次或防发散规则发生变化时，先更新文档，再落具体最小任务。
- [ ] [auto] arch: 当 `可选` 区没有更高优先级任务时，从 `.lab/specs/37-structure-convergence-execution-v1.md` 的 Batch A-D 中拆出一个 30-90 分钟内可运行、可验证、可回退的最小结构任务加入 `可选`。
- [ ] [auto] import: 基于真实样本夹具冻结 Readwise Reader v1 输入合同，并补 parser fixture tests，明确支持的文章全文/高亮/书籍高亮形态。
- [ ] [auto] import: 定义 `ImportJob`、`ImportRecord`、目录所有权（`external` / `managed`）与 importer 配置模型，并补类型/模型回归测试。
- [ ] [auto] import: 实现 `Highlight Stitcher` 的精确匹配与 degraded import 回退，并补“可匹配/不可匹配”回归测试。
- [ ] [auto] import: 实现 `once` 模式的 discovery + fingerprinting，第一版先用 `relative_path + size + mtime` 判定新增/未变化，并补幂等回归测试。
- [ ] [auto] import: 打通 Readwise Reader 一次性导入到 source/degraded extract 的持久化链路，第一版不启用 annotation 转化。
- [ ] [auto] import: 接入 `Import highlights as annotations` 开关，并补 ON / OFF 行为回归测试。
- [ ] [auto] import: 在同步语义与扫描策略定稿后，实现 watch 模式的 `Import Cursor` 持久化、增量重导入与重复保护。
- [ ] [auto] import: 实现 Obsidian importer 的显式目录导入与首批嵌入式高亮样本测试，复用共享 Import pipeline。

## 备注

- node-status-icon 语义备注：当前 reading 图标若按 `pending / active / dismissed` 三态落地，`pending` 只能近似表达“尚未被 review flow 处理过”，不能表达“用户已真正读完”；因为现有代码里 `Later` 与 `Read` 都会调用同一套 reading schedule 推进逻辑，都会写回 `lastHandledAt / nextAt / repetitionCount`，所以用户即便没点 `Read`、只点了 `Later`，节点也会从 `repetitionCount === 0` 进入已处理态。后续若产品需要把“真正读过”与“只是 Later 过”区分开，必须补单独行为字段，不能继续只靠 `repetitionCount` 推断。
- Windows 客户端异常备注：本次右侧栏 UI 代码已落仓并完成本地测试，且 `windows-sync` 已把代码同步到 Windows mirror；但 `windows:preview` / `windows:client:start` 后客户端落入 `stale-runtime-detected` / `no trusted running client`，导致用户侧看不到最新界面。若后续继续排查，应作为独立 desktop 恢复问题处理，不要误判为单纯前端未同步。
