# WebView2 First-Attempt Failure Investigation (2026-02-28, afternoon)

## 问题陈述

在 commit `000060` 之后，`npm run windows:dev:restart` 的首次尝试仍然有 ~40–50% 的失败率（`WEBVIEW2_LOST_BEFORE_APP_READY`）。当时 000060 的 retry 是稳定的，但这次调查中 retry 也开始失败，出现了 regression。

---

## 本次调查的尝试和发现

### 1. GPU Process 缺失模式（新发现）

通过对比 boot events 里 `webview2_process_detected` 的 process_samples，发现：

| 结果 | WebView2 进程 | GPU process |
|------|--------------|------------|
| 成功 | 6-7个 | 有 (`--type=gpu-process`) |
| 失败 | 4-5个 | **无** |

**成功的 session 里有 GPU process，失败的没有。** 说明 WebView2 Browser Process 在还没有 spawn GPU process 之前就退出了。

### 2. `tauri_page_load_started` 的顺序差异（已知）

- 成功：`tauri_setup` → delay (6-8s) → `tauri_page_load_started` → `webview2_process_detected`
- 失败：`tauri_setup` → `webview2_process_detected` (很快, ~91ms) → `webview2_process_lost`

这说明 WebView2 在 Tauri 导航之前就已经初始化并退出了。

### 3. Tauri log 只到 `Running target\debug\foliole-tauri-core.exe`

所有成功和失败的 tauri log 都只到这里截止。这是因为 `cmd.exe /k` 的子进程输出不通过管道，而是直接输出到 console。Rust 进程的 stdout/stderr 没有被捕获到日志文件。这是一直存在的已知限制，不是新问题。

### 4. 尝试的 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS（全部失败）

以下 flags 都测试过：

| Flag | 结果 |
|------|------|
| `--use-angle=d3d11 --disable-gpu-rasterization` | 仍然失败（两次 retry 均失败） |
| `--enable-logging --log-level=0` | 仍然失败，且没有生成 chrome_debug.log |

**结论：这个环境不能使用 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`**，会导致额外的稳定性问题（参考 000052 里 `--disable-gpu` 导致 deadlock）。已全部移除。

### 5. Regression 发现：000060 的 deep clean 在 Launch-NativeDev 里

000060 把 `Reset-WebView2UserData -DeepClean` 加到了 `Launch-NativeDev` 函数里（每次 launch 前都执行）。本次调查后期发现这个改动实际上引入了 **regression**：

- **000059 行为**：第一次 launch 不做 deep clean → 失败 → retry 做 deep clean → 成功（稳定）
- **000060 行为**：每次 launch 都 deep clean → 第一次仍然失败 → retry 也经常失败

**推测原因**：`Launch-NativeDev` 里删除 UDF 后立刻启动 Tauri，时间间隔太短。而 retry 路径里有 `Stop-NativeDevSession`（~15s 等待）+ `3s sleep`，这段等待时间反而让 OS 把所有句柄/缓存都刷新干净了。

### 6. 本次 session 结束时的状态

已将 `Launch-NativeDev` 里的 `Reset-WebView2UserData -DeepClean` 移除，恢复到接近 000059 的行为。但这个改动还没有充分测试，也没有提交。

**当前脚本状态（未提交的改动）：**
- 移除了 `Launch-NativeDev` 里的 deep clean（回归到 000059 行为）
- 加了 `Capture-BootTimeoutDiagnostics` 里读取 `EBWebView\chrome_debug.log` 的代码（有用但基本不会生成该文件）

---

## 目前的根本原因假设

### A. WebView2 GPU process 初始化失败（主要）

WebView2 Browser Process 在 GPU process 初始化阶段失败，并随之退出。这个失败是**间歇性的**，没有确定的触发条件。可能与以下因素有关：

- **Windows GPU 驱动的 TDR（超时检测和恢复）**：GPU 驱动在空闲后恢复需要短暂时间，WebView2 GPU process 启动时恰好踩到这个窗口
- **GPU 进程的进程沙箱初始化**：GPU process 以受限权限运行，在某些系统状态下初始化失败
- **Crashpad 或 NetworkService 先于 GPU 启动完成**，但 GPU 初始化时发现某个系统资源不可用

**为什么 retry 能成功？** Retry 前有 ~18s 的等待时间（Stop + 3s sleep），这足够 GPU 驱动/相关系统资源完全初始化好。

### B. 连续 restart 时的资源清理不足（次要）

快速连续重启时，TCP TIME_WAIT、进程句柄等未完全释放，导致新的 WebView2 Environment 初始化时遇到竞态。3s sleep 可能不够。

---

## 已排除的原因

- UDF 文件锁（LevelDB LOCK/SingletonLock）：deep clean 后重复出现，不是锁的问题
- Cargo watch 热重载竞争：stop-before-sync 已修复（000060）
- Mojo IPC 管道 PID 不匹配：已验证 PID 正确
- Vite 启动慢（>1400ms）：Vite 在失败 session 里也正常启动（879ms, 828ms）
- WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS：所有尝试都无效或有害
- Rust panic：boot events 里无 `tauri_panic` 记录

---

## 建议的下一步（未完成）

### 选项 A：增加 stop-to-start 等待时间
在 restart 路径里，把 `Start-Sleep -Milliseconds 3000` 增加到 `8000ms`（总等待 ~23s）。代价是启动慢，但可能解决连续 restart 时的竞态。

### 选项 B：在 Wait-ForFrontendReady 里检测 Tauri 存活但 WebView2 死亡时自动触发 Tauri 重启
修改 `Wait-FrontendReadyWithSingleRetry`，在 WebView2 lost 后直接终止 Tauri 进程并立刻 retry（不等 early fail 计时器），节省 10s。

### 选项 C：Rust 侧处理 WebView2 ProcessFailed
在 `main.rs` 里注册 `WebviewWindow` 的 process failed 事件（Tauri v2 API），检测到 WebView2 crash 后自动调用 `window.close()` 触发 `tauri_window_destroyed`，让 PowerShell 脚本更快感知到失败并 retry。

### 选项 D：放弃继续追查，接受"有 retry 保底"的现状
目前行为：第一次可能失败，retry 稳定成功。对开发工作流来说可以接受。把精力花在功能开发上。

---

## 当前脚本状态

`scripts/windows/run-windows-native-dev.ps1` 有未提交的改动：
1. 移除了 `Launch-NativeDev` 里的 `Reset-WebView2UserData -DeepClean`
2. 加了 `chrome_debug.log` 读取到 `Capture-BootTimeoutDiagnostics`

这两个改动都没有经过足够的测试，建议在决定方向后再提交或 revert。
