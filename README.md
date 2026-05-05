# Foliole

Foliole 当前处于从 0 到 1 的实现阶段，采用 **Trunk-Based Vibe Coding** 工作流推进。

## 快速开始（Agent 协作）
1. 阅读产品规范：`.lab/specs/`
2. 读取 Agent 约定：`AGENTS.md`
3. 查看当前阶段指针：`.lab/agent/current-phase.md`
4. 用任务模板执行：`.lab/agent/task-template.md`
5. 完成后记录：`.lab/agent/iteration-log.md`
6. 提交前执行：`scripts/quality-gate.sh`

## 当前里程碑
- M1：三栏编辑加工链路可用（节点列表 + Markdown 编辑 + 测试区占位 + 派生 + 持久化）

## 工作流原则
1. 主干小步提交，避免长周期分支合并。
2. 一次只做一个可验证任务。
3. 优先稳定主链路，再扩展外围能力。

## Playwright E2E
1. 首次安装浏览器运行时：`npx playwright install chromium`
2. 列出 E2E 用例：`npm run test:e2e -- --list`
3. 运行 E2E（默认无头）：`npm run test:e2e`
4. 可视化调试：`npm run test:e2e:headed` 或 `npm run test:e2e:ui`

## Rust Scheduler Mode
1. Default mode is `prefer-rust`: use Tauri invoke when available, otherwise fallback to local scheduler.
2. Set `VITE_REVIEW_SCHEDULER_MODE=rust-only` to hard-require Rust scheduler.
3. In `rust-only`, grading throws when `window.__TAURI__.core.invoke` is unavailable.

## Windows Prerequisite Check From WSL
1. Run `npm run windows:env:check` in WSL.
2. The command executes a Windows PowerShell check via `powershell.exe`.
3. Logs are written to `logs/windows/windows-env-check-*.log`.
4. Exit code is non-zero when required prerequisites are missing.

## Windows Sync + Build + Test Pipeline From WSL
1. Run default dev pipeline (no packaging): `npm run windows:pipeline`
2. Explicit fast alias (same behavior): `npm run windows:pipeline:fast`
3. Run release packaging check: `npm run windows:package`
4. Optional mirror directory override: `WINDOWS_WORKDIR='C:\dev\foliole' npm run windows:pipeline`
5. Pipeline steps:
- Sync from WSL source to Windows mirror.
- Run `lint -> typecheck -> test -> build` on Windows.
- Run `tauri build --debug` only in `windows:package`.
- Stream all errors back to WSL terminal and write `logs/windows/windows-pipeline-*.log`.

## Windows Native Dev Loop From WSL
1. Keep Windows native client running during development. Start once with: `npm run windows:dev:start`
2. After normal frontend edits (`src/**`, `styles`, most UI logic), run: `npm run windows:dev:sync`
3. When runtime-sensitive files change (`src-tauri/**`, `package*.json`, `vite.config.ts`, `index.html`), run: `npm run windows:dev:restart`
4. Use smart mode to auto-decide sync vs restart from changed files: `npm run windows:dev:native`
5. Check process state any time: `npm run windows:dev:status`
6. Stop all native dev processes when finishing: `npm run windows:dev:stop`
7. All actions write logs to `logs/windows/windows-native-dev-*.log`.
