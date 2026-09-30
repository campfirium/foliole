# 本机同步集成测试

运行现有生产同步代码，以两份独立磁盘数据库和本机 HTTP 替代真机。
包含认证、加密、事实核对、分页结构包、正文与附件、应用、回执和重启恢复。
版本由生产创建/编辑接口生成；不手工插入历史，也不另写同步算法。
宿主单例、文件目录与原生下载边界由本机适配器提供。

```bash
npm run sync:simulate -- --out .tmp/artifacts/sync-simulator/first
npm run sync:simulate -- --scenarios paged-restart,resources --seed 42 --scale 2
npm run sync:simulate -- --list
```

默认运行全部 12 个场景，每个分别运行桌面接收与共享 companion 接收，共 24 项。
`--path desktop|companion|both` 选择接收链路，默认 `both`。
两条链路的移动发送均使用生产 `pushLocalDirtyObjects`。
延迟/重复回执场景通过生产协议暂存发送与回执，控制回执交付时机。

| 场景 | 验证内容 |
| --- | --- |
| continuous | 连续编辑后的最新正文与版本头 |
| merge | 共祖非重叠分支合并、晚到回执保留后续编辑 |
| conflict | 重叠编辑的正文与冲突备选保留 |
| kinds | folder/item/topic、父子结构与锚定对象 |
| delayed-receipt | 包回执断线重试、回执之前的新编辑 |
| trimmed | 合法历史正文回收后，滞后分支再次发送 |
| paged-restart | 多页节点与版本历史、断线、重开数据库继续 |
| deletion | 生产软删除传播 |
| collision | 两个独立对象编号相同，重编号并保留各自内容与后续修改 |
| resources | 正文 blob、真实附件传输、断线后补齐 |
| lost-push-response | 服务端已写入而响应丢失，重启后无需编辑即可重试 |
| wal-snapshot | 活跃 WAL 中的最新编辑进入只读备份副本 |

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
附件按副本元数据复制并校验 SHA-256；原库不迁移、不重新配对、不修复。
输出必须是新目录，且不能与源/目标数据目录或附件目录重叠，包括符号链接别名。
复制后，schema 初始化与模拟配对只作用于副本。
输入已有断裂版本关系、缺失正文/附件等会失败并留存证据，不能视作同步通过。

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
当前正文可解析、接收游标完成、依赖暂存与资源待取队列清空。
资源场景及真实库模式另核对正文 blob 和附件字节。

```bash
npm run test:files -- scripts/sync/simulator-paths.test.mjs
node node_modules/typescript/bin/tsc -p scripts/sync/tsconfig.simulator.json --noEmit
npm run lint:files -- scripts/sync/simulator.mjs scripts/sync/simulator-paths.mjs
```

数据库运行经过仓库的受控 Electron ABI runner；不要用普通 Node 加载根 `better-sqlite3`。
本机结果覆盖数据同步链路，不证明原生 bridge、操作系统权限、硬件或局域网发现；
本工具不部署或运行真机，也不替代这些宿主特有验收。
