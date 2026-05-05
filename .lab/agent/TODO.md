# TODO

## 待办

- [ ] [gate] node-icon: 在真实界面人工验收节点列表的层次与图标开放能力，并一并收口节点图标三态。确认“非派生更高字重、派生保持正常颜色”的层次成立，自定义单/双 SVG 在常用缩放和主题下可接受；若用户上传效果差的 SVG，产品只需保证不崩溃、有默认回退，不要求替用户纠正素材质量。2026-03-18 最新诊断见 `.lab/specs/44-node-icon-windows-diagnosis-2026-03-18.md`：当前已确认标题加粗与自定义 SVG 能到达真实客户端，但图标状态问题仍未收口。节点图标只应表达持久三态：`pending=尚未开始，等待首次复习`、`scheduled=已进入学习周期，会被继续调度复习`、`dismissed=dismiss 后不参与复习`，不承载 `queued/current/done` 这类 session 态。当前实现里 `pending` 暂用 `reading.repetitionCount === 0` 或 `review.lastReviewAt === null` 近似“尚未开始”，`scheduled` 表示其余正常在复习流中的状态，`dismissed` 仍只对应 reading 的 `dismissed`。真实界面验收口径固定为 `Pending=虚线`、`Scheduled=正常态`、`Dismissed=整行一起淡化`；下一轮先按该口径做单点 Windows 复核，再决定是否需要调整字段映射或视觉差异。

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

- node-status-icon 语义备注：当前节点图标只表达持久三态 `pending / scheduled / dismissed`，不表达 session 五态。现有 reading 图标若按该三态落地，`pending` 只能近似表达“尚未开始，等待首次复习”，不能表达“用户已真正读完”；因为现有代码里 `Later` 与 `Read` 都会调用同一套 reading schedule 推进逻辑，都会写回 `lastHandledAt / nextAt / repetitionCount`，所以用户即便没点 `Read`、只点了 `Later`，节点也会从 `repetitionCount === 0` 进入 `scheduled` 态。后续若产品需要把“真正读过”与“只是 Later 过”区分开，必须补单独行为字段，不能继续只靠 `repetitionCount` 推断。
- Windows 客户端异常备注：本次右侧栏 UI 代码已落仓并完成本地测试，且 `windows-sync` 已把代码同步到 Windows mirror；但 `windows:preview` / `windows:client:start` 后客户端落入 `stale-runtime-detected` / `no trusted running client`，导致用户侧看不到最新界面。若后续继续排查，应作为独立 desktop 恢复问题处理，不要误判为单纯前端未同步。
