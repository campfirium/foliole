# AGENTS

## Scope

- Applies to `electron/**`, `scripts/desktop/**`, `scripts/macos/**`, `scripts/windows/**`, `playwright.desktop.config.ts`, desktop runtime paths, desktop client previews, and Electron main/preload/IPC/SQLite tasks.
- Follow this file alongside root `AGENTS.md` when working in these scopes.

## Desktop Host Rules

- This project is desktop-first; do not default to a pure Web approach.
- The active Foliole library and its native host are the source of truth for user data and the primary database. Resolve the database from the current runtime, library selection, or an explicit user path; never substitute historical platform defaults for the active database.
- macOS and Windows each verify databases for their own native host and active library. Windows is authoritative only for Windows-specific conclusions such as ABI, native shell, dialogs, tray, notifications, installers, and path semantics.
- Expose system capabilities through the Electron main process, then call them from the renderer through a bridge. Do not scatter `ipcRenderer` calls through business logic.
- Resolve file, database, and log paths in the Electron main process; frontend code must not construct platform-specific absolute paths.
- The primary persistence path is Electron main process plus SQLite. Use `localStorage` only for disposable, auditable UI preferences.
- If the desktop window is visible but bridge-backed controls fail, investigate preload/bridge wiring first; do not hastily conclude that the renderer did not start.

## Implementation Rules

- `electron/main.ts`, `electron/preload.cjs`, `electron/ipc/**`, and `electron/database/**` contain desktop host responsibilities only. Do not push host rules into `src/features/**`.
- Define or reuse the bridge/IPC contract before connecting any new renderer-visible capability to business consumers. Do not start with fake direct calls in the renderer.
- Before changing preload, `contextBridge`, `ipcRenderer`, or `window.electronAPI`, check Electron's official `sandbox` / `contextIsolation` boundaries.
- Every preload change requires an automated regression test proving that the bridge remains exposed under sandbox-restricted `require`.
- `electron/preload.cjs` is exempt from the root file line budget; append new bridges there. The sandbox preload can only `require('electron')`, and the official splitting route is build-time bundling, whose build, path, and test costs exceed the benefit here; one file also keeps the security boundary auditable. This exception expires if Electron sandbox permits local file loading or the project introduces preload bundling.
- Test structural changes to bridge payloads, IPC arguments, and return values; do not cover only the happy path.
- Treat database storage, backup, restore, sync, and device identity changes as durable state by default; do not fix only the immediate page appearance.

## Desktop Startup Troubleshooting

- Investigate logs first for client startup failures; improve logging when it is missing.
- Establish Windows Electron runtime trust using main path, ready marker, runtime PID, boot session, and bridge availability verified in the same run. A visible window or existing process is insufficient.
- If the same run logs `database_init_complete` and `bridge_ready` alongside `window_error`, `renderer_error_boundary`, or `app_ready_timeout`, locate renderer error source and recent consumer contract changes first; do not continue prioritizing the database, Windows checkout, or Electron startup path as the cause.

## Windows Scripts And Native Modules

- Prefer Node `.mjs` runners for environment variables, background processes, redirection, path construction, Electron startup, or multistep Windows commands. When Windows host capabilities are necessary, use committed `.ps1` / `.cmd` entry points with simple `-File` or script-path calls.
- `electron-dev-native.mjs` only sets isolated userData/session for the Windows native pilot, then reuses the verified `scripts/electron-dev.mjs`. Do not create another Electron/Vite startup protocol unless the existing runner is first proven unusable on native Windows.
- Do not add `powershell.exe -Command ...`, complex `cmd.exe /c ... && ...`, inline `set VAR=... && npm ...`, or nested PowerShell/cmd layers to repository scripts. Move these patterns into tested runner files. For temporary diagnostics needing complex PowerShell arguments, use `powershell.exe -NoProfile -EncodedCommand`, write stdout, stderr, and exit code to `.tmp/`, then read them.
- For `better-sqlite3` / native module `NODE_MODULE_VERSION` mismatches, restore Electron ABI with `npm run electron:rebuild:native`; do not substitute ordinary `npm rebuild better-sqlite3`.
- Root `node_modules/better-sqlite3` belongs to Electron ABI by default. New development scripts using real SQLite must use a controlled Electron ABI runner instead of loading root `better-sqlite3` directly with ordinary Node, unless an exception is documented in the implementation notes first.
- Recheck native ABI after `npm install` / `npm ci`. If the Windows preview entry reports an ABI mismatch, its preflight may run `npm run electron:rebuild:native` and recheck before failing; fail if the recheck fails. Electron-as-Node runners must instead directly instruct the caller to run that command. Never use ordinary `npm rebuild better-sqlite3`.

## Validation

- For an Electron major upgrade, review and verify all Electron native modules as one compatibility set. Beyond ABI, loading, and behavior contracts, cover process exit, worker termination, native object disposal, and resource cleanup on applicable paths.
- Use the current native host as the primary desktop acceptance host. Add another host only when explicitly requested, when the goal touches that platform's exclusive boundary, for releases/installers, or when the plan promises cross-host consistency. Never extrapolate one host's evidence to another.
- Meet the root local behavior test gate and run `npm run quality:fast` on the current host, then select Hidden Native, Visible Native, or manual checks according to the goal. Default to `npm run test:e2e:desktop:native:hidden -- <spec>`; hidden health without an explicit spec proves runner availability only, not feature acceptance.
- Use `npm run test:e2e:desktop:native:visible -- <spec>` or manual checks only when the goal depends on real focus, menu bars, system dialogs, drag/window behavior, tray, notifications, installers/updaters, or an explicitly requested visible preview. Announce the brief desktop interruption in commentary before starting.
- Hidden/Visible specs assert stable user behavior only. UI, layout, blank-page, and visual regressions also require screenshots or traces in `.tmp/artifacts/`; DOM order, coordinates, or text presence cannot replace visual evidence. Report the user effects covered by automated assertions and observations left uncovered.
- Desktop Playwright uses the shared harness, an isolated state root, and the resource gate, running serially in a shared workspace. Concurrent occupancy is a resource conflict, not a product failure. Do not bypass runners with bare Playwright CLI calls.
- macOS preview uses the `.tmp` sandbox through `npm run electron:dev`; native preflight uses `npm run electron:native:health`. Manual Windows preview uses `npm run windows:preview:native` only when a Windows-specific trigger applies.
- Windows-specific evidence covers Windows paths/`app.getPath`, ABI, native shell/dialogs/tray/notifications, the primary database, installers/updaters, and Windows preload/IPC boundaries. Linux Electron with Xvfb or macOS preview cannot substitute for it.
