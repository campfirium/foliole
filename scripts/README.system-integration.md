# 系统集成测试维护

在仓库根使用 `npm run integration:maintain`。默认串行跑核心业务与当前 framed 同步回归；
SQLite 使用登记的 Electron ABI runner，所有业务写入独立临时库。
同步使用当前生产 HTTP、认证、加密、持久化、资源与回执链路，两份独立磁盘库，
并复验 TypeScript、Android Java 与 Swift 的 framed contract。
本入口不接收用户库路径，不启动客户端，不修改产品或替换产品测试合同。

```bash
# 查看精确场景及命令，不执行
npm run integration:maintain -- --list
# 每周首个工作日，以及发布前：核心 + 当前 framed 生产边界
npm run integration:maintain
# 随编辑行为修改，跑受影响领域；同理支持 reading/review/search/import/journey
npm run integration:maintain -- --scope editing
# 跨业务核心回归；仅同步修改可用 --scope sync
npm run integration:maintain -- --scope core
```

`--id <字母数字下划线连字符>` 可指定证据编号；省略时按时间生成。
证据写入 `.tmp/artifacts/system-integration/<id>/`，已有目录拒绝覆盖。
退出 `0`：所选测试全部通过、报告匹配且无跳过，执行前后源码指纹一致；
退出 `1`：测试失败、报告缺失/不匹配/跳过或源码变化；退出 `2`：参数/入口错误。
失败继续跑其他领域，保留真实未通过结果；不自动修产品或改变期望。

## 核心场景与覆盖边界

| 范围 | 初始状态、生产操作与断言 |
| --- | --- |
| journey | 临时新库→导入 Markdown→重复导入身份不变→生产生成版本并编辑→新正文可搜索、旧正文不再命中→保存阅读位置→关闭重开同库；正文、身份、搜索与位置保持 |
| editing | 独立 SQLite 节点与分支→真实编辑和父内容更新；合并、冲突备选、无变化编辑、重试与缺失基线保护 |
| reading | 独立 SQLite→保存活动节点、滚动与选区；读回一致、较旧写入/恢复不覆盖新进度；workspace snapshot 保留阅读状态 |
| review | 独立 SQLite→评分/重置；复习状态与日志一起持久化、同步状态及删除事实一致 |
| search | 独立 SQLite/搜索 sidecar→生产搜索与索引恢复；正文匹配、PDF 跨页、短查询、源身份/版本一致性；回收站标记/排序、恢复、永久删除与索引快照；另以 search-ui 步骤验证加载状态与来源不刷新 |
| import | 独立 SQLite→生产导入；新/重复/更新/降级与来源可追溯，已删除对象不被重复导入错误复活 |
| sync | 两个独立 Electron Node 进程、HTTP 端口与 SQLite 库→生产 framed round；双向对象、子先父后、正文/资源、relation/review、版本链、认证拒绝、失败回滚、回执丢失与重启重放；同轮覆盖共享 companion inventory/apply/staging，并复验 Android Java 与 Swift framed contract |

已有业务测试保留原有 fixture 与局部 spy（例如索引恢复回调），其单元边界断言不冒充完整 renderer 链路；
新增 journey 只适配隔离路径，不 mock 数据库、导入、编辑、搜索或阅读实现。
测试 fixture 只适配进程单例与原生文件边界，不替换待验证同步协议。
这些结果不证明 native bridge、OS、设备生命周期或真实 LAN 发现通过。
journey 覆盖数据库重开；真实进程重启、renderer hydrate 与外观依赖下述原生核心旅程。

## 执行时机及既有接入

- **随行为变更**：选受影响业务 `--scope`；同步用 `sync`；跨业务用 `core`。
  修改行为时在对应既有测试或最小集成测试补场景，不只增加 helper 存在性断言。
  `all` 是有限的代表性核心回归，不代表全仓所有测试。
- **发布前**：本入口 `all` 完全通过并核对同一候选后，按既有发布流程执行 hosted 完整质量与 RC 旅程。
  不把 dirty workspace 结果冒充 release SHA 的结论。
- **每周首个工作日**：在 Mac dev 执行默认 `all`，保存当周新 id 的结果；失败保留证据，由问题 owner 处理。
  这是已落实的可执行维护步骤，未新增自动调度；双接收全量维护命令尚未单独接入 hosted 定时调用。
- **既有定时覆盖**：T7 每日上海时间 11:40/22:40 调用 T6，复用 Electron 数据库自动收集及 tooling 的 `scripts/sync` 收集。
  新 journey 自动被数据库 bucket 收集；旧同步模拟器不再进入本维护入口。
  release pause/同 SHA 成功复用可使 T7 跳过，本轮未远程触发或验证 schedule 运行。
  保留既有每日调度，不另建每周同类工作流。

核心原生旅程在本轮适用本地测试全部通过及 `npm run quality:fast` 通过后，串行执行：

```bash
npm run test:e2e:desktop:native:hidden -- tests/desktop/macos-core-product-golden-journey.spec.ts
npm run test:e2e:desktop:rc-golden-journey
```

前者验证创建/编辑、阅读/复习、搜索、外观与同一隔离 state root 完整重启；
后者验证 A/B 内容隔离、公式挖空与重启，已有 release-candidate-quality 工作流调用。
二者单独执行，不并入质量闸；resource gate 与预览恢复按 `electron/AGENTS.md`。
本维护实现不改变运行时行为，首轮不启动原生 UI；不得把未执行旅程标成通过。

## 复核证据

顶层 `summary.json` 给出各领域退出码、命令、时间、报告和日志路径。
Vitest 报告含逐项名称、通过/失败/跳过与失败栈；同步失败时保留两端临时库路径与进程诊断。
`source-before.json` / `source-after.json` 保存 HEAD 与源码文件 SHA-256；
`workspace.patch` 保留包含 staged 改动的 tracked diff，`untracked-source/` 保存未跟踪源码。
记录当前 dirty 候选，不能仅引用 HEAD 复现这些修改。

`sourceStable: false` 及 `changedPaths` 表明共享工作区变化，不汇总固定候选通过。
逐场景运行事实仍保留；比对受影响路径后只复验受影响证据，不机械作废无关历史证据。
指纹对比不能发现两次采样间修改后还原；正式发布仍用固定提交候选。
不要并发运行本入口或同时使用共享 `.tmp/vitest/files.json` 的其他测试；报告不匹配会失败。
每次复跑用新目录、同 scope/seed/scale 与相同源码；无需清库或清理旧证据。
