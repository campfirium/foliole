# 升级与恢复演练

从仓库根执行，使用现有 Electron ABI runner；无需真实库路径、设备、账户或新依赖。测试内部只创建临时库及临时资源目录，结束后清理自己的测试资料。证据留在 `.tmp/artifacts/t286-drills/<profile>-<unique>/`，包含 `report.json`、`tests.log` 与 `vitest.json`。

| 时机 | 命令 | 当前覆盖 |
| --- | --- | --- |
| 修改备份/恢复、业务持久化、正文或关系 | `node scripts/sqlite/upgrade-recovery-drills.mjs changed` | 内容/关系/永久设置摘要、全新目标恢复与冷启动、设备设置保留、压缩备份截断、失败回滚 |
| 修改迁移/启动/schema；每次发布前 | `node scripts/sqlite/upgrade-recovery-drills.mjs release` | changed 加公开旧库来源校验、生产升级及两次冷开、失败升级回退与重试、companion SQLite 启动、动态版本链、已有资源保留与工作组身份 |
| 每季度首个维护日；上次故障改变了恢复路径时 | `node scripts/sqlite/upgrade-recovery-drills.mjs quarterly` | release 加压缩中断清理、损坏库恢复、真实 SQLite/HTTP 工作组恢复分页/失败/重放/离线/旧流量和版本链重启 |

定期方式：季度首个维护日人工或既有维护任务运行 quarterly，复核 report 与失败项。无需常驻 monitor，也不新增重复 schedule。每月涉及相关改动时运行对应 changed/release；月份本身不替代场景触发。发布任务必须在其精确候选上重新跑 release，不能复用另一 revision 的历史绿灯。

## 结果标准

- 所列测试全部收集执行、全部通过，并且运行前后的候选内容指纹相同，入口才返回 0 / `passed`。
- 失败返回非 0 / `failed`，完整失败断言保留在日志。共享工作区途中变化时，返回非 0 / `candidate-changed`；这表明本轮结果不属于单一稳定候选，不能当发布通过。
- 内容指纹涵盖 Git 管理的文件与非忽略的新文件，含历史 fixture；HEAD 之外的未提交源码也可辨识。记录不包含正文，只保留 SHA256 与文件列表。由于共享工作区其他改动也纳入指纹，其变动可能要求重新跑；不擅自冻结、stash、提交或覆盖其他任务改动。
- 历史 fixture 按 manifest 中 sourceRelease/sourceCommit 与 databaseSha256 校验；支持矩阵为 ledger 登记的 schema 46/48/61/62/65/66/77/78（v0.6.1 至 v0.7.10 的登记 lineage），不能宣称任意旧库或未来公开版本全面覆盖。新增公开 lineage 时由迁移 owner 维护 ledger/fixture，演练跟随登记列表。
- 升级同时核对正文、父子关系、复习/阅读与永久设置；回退须保持升级前事实且可再启动。禁止改历史 fixture 来掩盖失败。
- 恢复用生产应用备份/恢复入口，源库与新目标均隔离；重启后核对正文、父子关系、删除态、复习历史与永久设置。恢复保留当前设备设置及 T266 已确定的工作组语义。

## 附件与平台边界

数据库备份通过 SQLite online backup 生成数据库快照，附件字节位于独立 Assets；SQLite API 的承诺是数据库一致快照（[官方说明](https://sqlite.org/backup.html)），不会自动包含外部文件。`upgradeRecoveryDrill.test.ts` 分别检查源资源保留、全新目标未取得资源；`backupRestore.canonicalMigration.test.ts` 验证已有资源恢复后仍在。演练通过只能称数据库恢复通过，不能称数据库加附件完整灾备。需要完整资料恢复时，必须另有与数据库一致的 Assets 副本；本任务不新增附件备份功能。

Companion 使用真实 SQLite 核对共享迁移合同和生产 bootstrap。mobile HTTP 测试复用生产移动同步外层与认证 HTTP；它不替代 Android Java / iOS Swift SQLite、真机升级、安装器或进程被 OS 杀死验收。quarterly 的异常仅在临时目录/局部 fault injection 中触发，不填满真实磁盘，不损坏用户库。T266 留存的真机失败仍由 T266 收口。

运行时、OS 或质量前置问题失败时保留原始结果，交相应 owner；不得改测试期望、扩张产品修复或重复创建任务。此入口只落地有界演练，不重写质量路由或发布 gate。

独立底层恢复可复演：

```sh
node scripts/electron-sqlite-runner.mjs scripts/sqlite/sqlite-recovery-drill.ts --help
node scripts/electron-sqlite-runner.mjs scripts/sqlite/sqlite-recovery-drill.ts --work-dir .tmp/artifacts/<new-isolated-directory>
```

每次选新目录；存在的备份或恢复目标明确拒绝覆盖。默认不传 `--source-path`，避免读取正式资料。报告含完整性、外键、计数及脱敏全字段摘要，不输出用户正文。摘要比较只适用于演练内静止源库，活库并发写入可能使源摘要与后续备份快照不同；不能将其当在线热备验证。
