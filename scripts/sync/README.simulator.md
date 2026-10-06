# Legacy 同步模拟器（仅供历史性能对照）

此入口覆盖已经退役的 sync-pack/source-view 数据面，不代表当前 framed sync 产品链路，
也不再由 `npm run integration:maintain -- --scope sync` 调用。T276 的既有性能验收仍引用它，
因此暂时保留；T276 迁移或关闭后应连同该入口一起删除，不得为新同步行为继续扩展场景。

当前系统集成入口是：

```bash
npm run integration:maintain -- --scope sync
```

以下内容只说明历史入口的复现方式。

运行现有生产同步代码，以两份独立磁盘数据库和本机 HTTP 替代真机。
包含认证、加密、事实核对、分页结构包、正文与附件、应用、回执和重启恢复。
版本由生产创建/编辑接口生成；不手工插入历史，也不另写同步算法。
宿主单例、文件目录与原生下载边界由本机适配器提供。

```bash
npm run sync:simulate -- --out .tmp/artifacts/sync-simulator/first
npm run sync:simulate -- --scenarios paged-restart,resources --seed 42 --scale 2
npm run sync:simulate -- --list
```

默认运行全部 24 个场景，每个分别运行桌面接收与共享 companion 接收，共 48 项。
`--path desktop|companion|both` 选择接收链路，默认 `both`。
两条链路的移动发送均使用生产 `pushLocalDirtyObjects`。
延迟/重复回执场景通过生产协议暂存发送与回执，控制回执交付时机。

| 场景 | 验证内容 |
| --- | --- |
| continuous | 连续编辑后的最新正文与版本头 |
| source-edit-during-sync | 本轮来源视图建立后编辑文章，本轮保留原正文，下一轮收到新正文 |
| move-between-folders | 同一编号的文章移动文件夹后，对端位置更新，正文与唯一身份保留 |
| unchanged-replay | 无编辑连续同步及重开数据库后同步，不新增业务序号、不重新请求文章正文资源 |
| merge | 共祖非重叠分支合并、晚到回执保留后续编辑 |
| conflict | 重叠编辑的正文与冲突备选保留 |
| kinds | folder/item/topic、父子结构与锚定对象 |
| delayed-receipt | 包回执断线重试、回执之前的新编辑 |
| trimmed | 合法历史正文回收后，滞后分支再次发送 |
| paged-restart | 多页节点与版本历史、断线、重开数据库继续 |
| deletion | 生产软删除传播 |
| collision | 两个独立对象编号相同，重编号并保留各自内容与后续修改 |
| local-root-state | 各端本地系统根节点及其历史原样保留；普通节点当前结果跨端一致，各端版本按实际依赖保留 |
| mismatched-resource-type | 原始文件后缀与真实类型不符时，保留原始字节和引用，准确登记不可用与持久待补 |
| resources | 正文 blob、真实附件传输、断线后补齐 |
| lost-push-response | 服务端已写入而响应丢失，重启后无需编辑即可重试 |
| wal-snapshot | 活跃 WAL 中的最新编辑进入只读备份副本 |
| open-state-batch | 32 个打开状态带出的节点前置数据与正文记录，正确分配生产分页预算 |
| orphaned-learning-state | 无节点或载荷的历史阅读状态不进入依赖交付，正常节点完整接收 |
| resource-recovery | 100 个当前引用、99 个可用文件、已有文件保护、历史图片不产生需求、重启后补齐 |
| large-dependency-page | 大历史载荷触发缩小依赖页，源快照保持打开直到异步构建与重试完成 |
| tombstoned-learning-state | 阅读状态已删除但所属节点与历史仍在时，版本依赖继续分批传输并保留删除事实 |
| unbacked-learning-state | 节点尚在但打开/复习状态载荷已缺失时，依赖选择与实际打包一致 |
| escaped-dependency-page | 含大量引号的正文，按序列化后实际记录大小分页并通过接收上限 |

`--seed` 固定生成身份与编辑版本；版本命名包含场景，以避免独立 fixture 意外复用版本身份。
`--scale` 是正整数，控制分页场景节点数，每单位 150 个节点，另有 140 次历史编辑。
重放使用相同场景、种子、规模与源码，另选新的输出目录。
故障位置由场景固定并记录在 `operations.json`，不依赖随机时序。

## 数据库副本输入

```bash
npm run sync:simulate -- --mode real \
  --database /absolute/Data/foliole.db --assets /absolute/Assets \
  --out .tmp/artifacts/sync-simulator/copied-library
```

省略目标数据库时目标为空库。已有目标使用：

```bash
npm run sync:simulate -- --mode real \
  --database /absolute/source/Data/foliole.db --assets /absolute/source/Assets \
  --target-database /absolute/target/Data/foliole.db --target-assets /absolute/target/Assets \
  --out .tmp/artifacts/sync-simulator/two-copied-libraries
```

真实输入模式只运行两端数据收敛和资源核对，不对输入追加空库场景的测试编辑。
数据库以只读连接调用 SQLite backup，包含 WAL 中已提交的数据。
资源需求直接调用生产实现，从当前正文与节点挂载引用读取，复制可用字节并校验 SHA-256。
历史正文中的图片与未引用文件不产生当前资源需求；原库不迁移、不重新配对、不修复。
输出必须是新目录，且不能与源/目标数据目录或附件目录重叠，包括符号链接别名。
复制后，schema 初始化与模拟配对只作用于副本。
已有祖先缺口按输入基线精确核对，任何新增缺口都失败；当前正文不可读仍失败。
源与目标都缺失的文件如实报告 `resourceStatus: partial`，验证引用保留及持久待补，
不会将测试合同成立解释成文件已经全部到齐。

## 结果与复核

顶层 `command.json` 保存参数和候选 revision，`workspace.patch` 保存当时 tracked 源码差异；
未提交的新源码仍需与当前工作区一起保留，正式复验应使用已提交 revision。
`summary.json` 汇总场景与退出码。每个场景包含：

- `input.json`：输入来源、资源缺陷及初始数据库缺陷。
- `operations.json`：编辑、请求及故障交付顺序。
- `result.json`：通过/失败、错误、原有/新增缺陷、持久化统计与接收进度。
- `a/foliole.db`、`b/foliole.db` 与各自 `assets/`：完整结果副本，可独立复核。

退出码 `0` 表示全部所选场景通过；`1` 表示场景失败或输入缺陷；`2` 表示参数/输出目录错误。
通过要求两端语义图与冲突备选一致、重复同步不增殖、版本头/父关系完整、
当前正文可解析、接收游标完成、依赖暂存清空。资源齐全时待取队列必须清空；
预期 partial 时只允许队列保留输入明确缺失的需求，其他错误仍失败。
资源场景及真实库模式另核对当前正文与实际所需资源字节。

```bash
npm run test:files -- scripts/sync/simulator-paths.test.mjs
node node_modules/typescript/bin/tsc -p scripts/sync/tsconfig.simulator.json --noEmit
npm run lint:files -- scripts/sync/simulator.mjs scripts/sync/simulator-paths.mjs
```

数据库运行经过仓库的受控 Electron ABI runner；不要用普通 Node 加载根 `better-sqlite3`。
本机结果覆盖数据同步链路，不证明原生 bridge、操作系统权限、硬件或局域网发现；
本工具不部署或运行真机，也不替代这些宿主特有验收。

真实库输入同时按生产文件类型检查判定可用性；字节哈希正确但后缀类型不符的文件保留在副本中，报告 `input_resource_type_mismatch` 与资源 `partial`，不宣称资源补齐。

预设场景每项时限 10 分钟；真实库完整双向与重复接收场景每项 20 分钟，仅调整测试总时限，生产分页与资源校验预算保持不变。

跨端一致性遵循生产合同，排除 `special-inbox` 与 `special-virtual-root` 的本地记录及其历史；真实库另逐行断言各端原始系统根记录、版本与父边未被改变。空接收端可按现有生产合同重建缺失的默认系统父节点，默认节点无正文、资源描述或版本历史；已有根节点与各端本地历史必须逐行不变。普通节点的实际正文、当前头、引用与替代文本要求跨端一致；合法 legacy inline 与 blob 可采用不同存储表示。动态链按各端实际依赖保留，不要求本机保留版本及收缩父边完全相同；共有版本的对象身份和内容摘要必须一致，各端仍需通过完整性、当前头、父关系及正文可读断言。
