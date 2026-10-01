# 固定场景性能基准

```bash
npm run benchmark:desktop -- core
npm run benchmark:desktop -- monthly
npm run benchmark:desktop -- quarterly
npm run benchmark:desktop:compare -- /absolute/previous-output /absolute/current-output
```

每轮产生新的 `.tmp/artifacts/t285-<mode>-<timestamp>/`，保留 manifest、summary、每场景原始样本、HTTP 两端隔离库及桌面失败诊断。任何前置、正确性或测量失败均返回非零；部分成功仍写入报告。目录不会覆盖历史结果。正式资料不参与采样。

入口先运行隔离 HTTP 数据链路，再运行现有 `quality:fast`。前置失败时不启动原生应用；前置通过后构建 production renderer 和 Electron，复用 Hidden Native runner、串行 resource gate 和隔离路径。构建前后指纹不一致时本轮不能作为对照。macOS DEV 若占用 gate，按 `electron/AGENTS.md` 的既有 stop/恢复流程执行。本入口不关闭用户现有应用，不管理常驻采样进程。

桌面 fixture v2 在隔离宿主初始化并关闭后，通过现有生产数据库写入函数离线生成正文、当前版本与顺序，再重启开始计时；不测创建吞吐。v1 运行时创建样本保留为历史观察，不能跨 fixture 版本对照。采样窗口应串行且无其他性能/真实库同步任务争用；并发窗口只保留操作正确性，不能认证稳定时间或 RSS 基线。

## 固定条件和计时边界

| 场景 | 固定操作与正确性 | 计时/资源边界 |
| --- | --- | --- |
| 新进程启动 | 固定资料持久化后重启三次；核对文章数量 | 进程创建→app_ready、renderer 各阶段；缺失字段保留 null；另外记录包含 harness 和 shell 断言的总启动耗时 |
| 搜索 | 各新进程查询唯一标题，并重复同一查询；包含目标节点 | 搜索 IPC 往返和结果断言；首查与缓存重复分开 |
| 文章切换 | 打开固定编号，正文完整一致 | debug openNode 消费生产打开路径；包含自动化往返和正文断言，不是 click-to-photon |
| 内容保存 | 固定编辑器选区替换正文，显式 flush 保存，读回一致；重启后再次一致 | 编辑器输入→显式 flush→持久化读回；排除打开动作；不覆盖逐字符打字、自然 debounce 或长篇编辑体验 |
| 首次同步 | 独立磁盘库、真实本机 HTTP 和生产 desktop 接收，三次新库 | 含认证、分页、正文资源与回执；逐篇核对正文/当前版本和数据库健康 |
| 无变化同步 | 收敛后再次同步；图和业务序号保持，未请求正文资源 | 记录响应时间、请求列表、接收 SQLite total_changes 差值；不要求机械写入为零 |
| 同步负载前台响应 | 复用 T255 的 3500 节点 pack apply + renderer→main IPC 读取 | 原始重叠样本及既有判据；macOS 结果不代替固定 Linux hosted runner 的准入证据 |
| 持续导航与空闲 | 循环逐篇核对正文，之后空闲 30 秒 | 自然 GC；DOM/监听器、JS heap、逐进程 app metrics、SQLite 总变更行和页数/页大小；每 100 次导航采样，报告采样峰值，不冒称真实连续峰值 |

数据库节点投影还单独测空接收库/无变化 pack apply，明确为内存 SQLite、排除网络与资源。它帮助区分 SQL 与完整链路成本，不作为 HTTP 同步的替代证据。

核心规模为 100/1000 篇；桌面每篇约 4KiB Markdown，HTTP 每篇约 4KiB 固定正文。每场景三次独立样本，保留原始顺序、中位/最大与首样本；少量重复不报告 P95。核心持续导航每规模 60 秒。月度/季度为 100/10000 篇，每规模持续导航 10 分钟和空闲 30 秒。所有进程启动保留 OS 文件缓存，不声称物理冷盘启动。进程内存不跨进程简单相加，也不把 RSS 当作 JS heap。

## 执行时机与对照

- 修改启动、搜索、节点打开、保存、同步或其共同数据路径后：运行 core；与最近用户认可的同条件 core 输出比较。单独 HTTP 快查可使用 `npm run test:sqlite:electron -- scripts/desktop/fixed-performance-http.test.mjs`，但它不能交付完整核心结果。
- 发布候选前：在候选实际源码与构建稳定时运行 core，记录精确 revision、工作区差异与构建指纹；与最近认可基准及上一发布版本在相同设备、模式、资料与计时边界下比较。历史证据不存在或旧版本无法等条件复跑时明确记为缺失，不能拿新基准覆盖旧退化。
- 每月：明确一次维护窗口手动运行 monthly，检查 10k 相对 100 的增长、持续导航期间资源变化和空闲释放。未实际执行的月份不填通过。
- 每季度：运行 quarterly，同一窗口复跑上季度已认可的同条件候选。它复用月度场景，季度检查无需再建一套协议、常驻任务或重复调度。

比较命令拒绝失败/缺失场景、设备条件或 fixture 版本不一致的输入。数值比值是观察证据，不自动判定性能合格。确认退化时同时看原始样本波动、绝对用户影响与操作性质；不存在统一毫秒阈值。首次结果须经审阅后才能成为认可基准。

已有 T255/T5/T6 hosted 接线保持原职责；本入口用于同机固定条件基准，不新增 hosted job，也不把手动性能基准塞入普通单元测试质量闸。Windows/Android/iOS、真实 LAN、多设备同步、导入并行、远程媒体和数小时会话不由本轮桌面合成资料认证。
