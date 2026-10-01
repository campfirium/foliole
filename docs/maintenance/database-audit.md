# 数据库审计执行说明

审计只读统计，不执行回收、VACUUM、迁移或运行时修复。先按 query-foliole-db 解析当前宿主资料库；多个候选时先确认路径。所有重统计都在隔离快照运行。报告仅含结构、计数、长度、摘要与有限队列状态，不输出正文、标题、路径字段或设置值。报告中的源库路径仍是本地敏感信息，不公开上传。

## 入口

要求 Node 22 的 `node:sqlite` 和 Python 3.9+ 内置 sqlite3，无新增依赖。从仓库根执行；每次使用新的输出文件名，防止覆盖基线。

```sh
mkdir -p .tmp/artifacts/database-audit-YYYYMMDD
npm run database:audit:snapshot -- --db /confirmed/library/Data/foliole.db --out .tmp/artifacts/database-audit-YYYYMMDD/main.db
npm run database:audit -- --db .tmp/artifacts/database-audit-YYYYMMDD/main.db --out .tmp/artifacts/database-audit-YYYYMMDD/main.json --label same-library-main --specialist
```

活库快照以 `mode=ro` 连接、观察 WAL，使用 SQLite backup API。连接失败直接失败，不自动退化为单文件拷贝或 immutable。只有已确认所有写入者停止、没有 WAL/SHM 时，快照入口可明确加 `--offline`；此模式核对源文件前后 SHA256 与伴生文件变化。`--offline` 不负责停止程序，使用者必须先取得停止写入证据。

主库、内部索引和外部镜像各自重复上述命令，分别用 `same-library-main`、`same-library-index`、`same-library-external` 标签。各文件快照独立一致，不能假装为三个库同一事务。侧库缺失写“未取得/不存在”，不按零行、健康或不需要处理解释。Companion 只有取得明确授权导出的离线副本时才执行同样统计，不从桌面结果外推移动端。

## 随变更与发布前

涉及 schema、引用、退出条件或写入者时，先跑 `npm run test:files -- scripts/database/database-audit.test.mjs`。用受影响表及其引用对象做定向审计：

```sh
npm run database:audit -- --db .tmp/artifacts/database-audit-YYYYMMDD/main.db --out .tmp/artifacts/database-audit-YYYYMMDD/targeted.json --label same-library-main --tables nodes,node_sync_versions
```

定向报告只统计所选表及相关引用检查；完整库 integrity 明确为 `null`（未执行），不冒充全库通过。发布前在该候选对应的隔离 fresh/upgrade 库及取得的真实资料副本上各跑一次全量统计，复核新增/删除表用途、约束、资源 owner 与迁移结果。此入口不执行升级，schema 版本不同不能被“integrity ok”掩盖；升级验证复用已有公开版本 fixture / 对应迁移测试。本任务没有证明 schema 89 → 当前源码的升级通过。

## 每月

每月第一次维护时，重新取得三种逻辑库的独立快照。保持标签、范围和测量方法相同，比较上月报告：

```sh
npm run database:audit -- --db .tmp/artifacts/database-audit-YYYYMMDD/main.db --out .tmp/artifacts/database-audit-YYYYMMDD/monthly.json --label same-library-main --baseline /previous/main.json --specialist
```

检查行数、payload 字节、状态积压、缺失引用和空间变化。schema 改变时在报告中保留 `schemaChanged` 并回查变更；首次没有上月基线时只建立基线，不编造增长率。payload 使用 BLOB 转换后的字节长度，包含字段但不等于磁盘占用；allocatedBytes 包含表和其索引，FTS shadow 表独立列出，虚拟表不能再与 shadow 空间重复相加。SQLite 未提供 dbstat 时空间为 null，不写零。复用专项报告的旧 content/preview 长度口径在非 ASCII 文本上可能是字符数，只将其重复行数与本次统一 byte 指标一起解读。

异常由既定退出条件判断：completed 搜索任务、过期 nonce、已消费 dependency staging 有已有生命周期入口；审计观察不触发它们。导入历史、同步 tombstone、版本 proof/hold、资源 manifest 不因“旧”而违规。直接引用缺失可能是合法历史保留或远程资源尚未到达，须结合逐表用途判断。产品问题保留未通过事实并另行处理。

## 每季度

季度第一次维护先执行每月全量步骤，再逐行复核 [逐表用途清单](database-audit-tables.md)：本季每张新增、存续、删除的表都确认用途、读写者、事实/派生属性、引用与退出条件。名称匹配的源码位置只是可追溯候选，动态 SQL、trigger、跨宿主同步还需沿调用链复核；无法确认的用途/TTL明确保留未知。更新清单中的源码位置和生命周期证据，不把文件名当产品合同，不补自动删除策略。

这些是手动、按需可复跑入口；不安装常驻监控、不创建重复调度。必要场景覆盖见 `scripts/database/database-audit.test.mjs`：production fresh schema、WAL committed 数据、异常引用、UTF-8 字节、源库保全、覆盖拒绝、差异比较及定向范围。

实现依据：[Python SQLite backup](https://docs.python.org/3/library/sqlite3.html#sqlite3.Connection.backup)、[SQLite WAL 只读条件](https://www.sqlite.org/wal.html#read_only_databases)。
