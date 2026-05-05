# Post-Mortem: WebView2 Silent Startup Crash (2026-02-28)

**Commit that fixed it:** `000060 fix webview2 udf stale-profile startup crash` (`689a5d6`)
**Affected script:** `scripts/windows/run-windows-native-dev.ps1`
**Symptom:** `npm run windows:dev:restart` intermittently fails with `BOOT_MARKER_TIMEOUT` or `WEBVIEW2_LOST_BEFORE_APP_READY`

---

## Timeline of Fixes Leading Here

| Commit | Issue Fixed |
|--------|-------------|
| 000051 | `app_ready` written by Rust before React painted → moved signal to frontend rAF |
| 000052 | `--disable-gpu` in `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` deadlocked WebView2 rendering pipeline silently |
| 000059 | Added boot diagnostics, session IDs, UDF pinning, early-failure classification |
| **000060** | **Stale WebView2 UDF profile data caused Browser Process silent exit ~1-2 s after start** |

---

## Symptom

`npm run windows:dev:restart` produced one of two failure codes:

- `WEBVIEW2_LOST_BEFORE_APP_READY` — WebView2 processes appeared then vanished within 1–4 seconds
- `BOOT_MARKER_TIMEOUT` — the 60-second wait elapsed with no `app_ready` marker written

The Tauri process remained alive. The window was visible (blank/gray). No crash dump was generated. No Windows Event Viewer entry. Tauri dev log showed nothing after `tauri_setup`.

---

## Boot Event Evidence

A failing session's boot log showed:

```
tauri_main_start → tauri_setup → tauri_window_focused → webview2_process_detected
→ webview2_process_lost_before_app_ready
```

- `tauri_page_load_started` never fired in most failures (page navigation never began)
- In some failures, `tauri_page_load_started` fired but `tauri_page_load` did not — WebView2 died mid-navigation
- A healthy session shows 7 WebView2 processes (Browser + Crashpad + NetworkService + Renderer + GPU + 2× utility)
- A failing session showed only 5 (no Renderer, no GPU) — Browser Process self-terminated before spawning the render pipeline

---

## Root Cause

**Stale LevelDB/IndexedDB profile data in the WebView2 User Data Folder (UDF) from a prior session caused the Browser Process to exit silently within ~1–2 seconds of startup.**

The UDF path:
```
C:\Users\zephu\AppData\Local\Foliole\WebView2\DevUserData\EBWebView\
```

WebView2 stores per-origin profile state under `EBWebView\Default\` including:
- `IndexedDB/` — per-origin key-value stores
- `Local Storage/`
- `Cache/`
- `Cookies`, `Visited Links`, `Web Data`
- `LOG`, `LOG.old`, `LOCK` — LevelDB journal/lock files

When a dev session ends uncleanly (force kill, cargo watch reload, Tauri panic), these files are left in a partially-written or locked state. On the **next** launch, Chromium's profile loading code hits an inconsistency, logs nothing externally, and exits the Browser Process with a non-zero code — no user-visible error, no crash handler invocation.

The exit is clean enough that `GetExitCodeProcess()` returns a structured code (not `0xC0000005`), so Windows does not generate a crash dump. This is why:
- Windows Event Log: no entry
- Windows Defender: no entry
- Crash dumps: none found
- Tauri log: silent (the Rust side never observes the WebView2 death)

---

## Why It Was Intermittent

The UDF is corrupted by the **previous** session's unclean exit, not by anything in the current session. Whether a given restart attempt fails depends on:

1. Whether the previous session exited cleanly (full `tauri_window_destroyed` path) vs. was killed
2. Whether the UDF was cleaned between sessions
3. Vite startup timing — in slow cases (1427 ms vs. normal ~800 ms), Tauri logged `Warn Waiting for your frontend dev server to start on http://127.0.0.1:4600/...`. This extended the window during which WebView2 had to survive before receiving its first navigation. If the UDF was already marginal, the extra wait pushed it over the edge.

The retry always succeeded because the failure handler already called `Reset-WebView2UserData -DeepClean` before relaunching — a clean UDF let the Browser Process start normally.

---

## What Was Ruled Out

| Hypothesis | Evidence Against |
|---|---|
| UDF file locks (LOCK, SingletonLock) | No lock files present after clean; removing them didn't help |
| Cargo watch hot-reload race | Moving stop-before-sync didn't fix it; WebView2 still died after sync completed |
| Mojo IPC named-pipe PID mismatch | Captured cmdlines confirmed `--mojo-named-platform-channel-pipe` used the live Tauri PID |
| Windows Defender / firewall block | Zero matching events in Defender Operational log |
| Frontend JS crash | `boot_start` never appeared — frontend code never ran; crash was pre-navigation |
| `--disable-gpu` flag (fixed in 000052) | Already removed; not present in this regression |

---

## Fix (commit 000060)

### 1. Deep-clean UDF before every launch attempt

```powershell
# In Launch-NativeDev, before starting tauri dev:
Reset-WebView2UserData -AppId $appId -DeepClean
```

`-DeepClean` removes the entire `EBWebView\` subtree, giving WebView2 a virgin profile on every dev session start. This is safe for development (no persistent user data needed) and eliminates the stale-state failure entirely.

### 2. Wait for WebView2 processes to exit before touching UDF

```powershell
function Wait-WebView2ProcessesGone {
    param([string]$AppId, [int]$TimeoutMs = 8000)
    # polls Get-WebView2ProcessesForAppId every 300ms until count == 0
}
```

Prevents a race where `Reset-WebView2UserData` ran while msedgewebview2.exe still had file handles open, producing partial deletes or LOCK recreation.

### 3. Remove stale lock files on non-deep-clean path

```powershell
function Remove-WebView2LockFiles {
    param([string]$UserDataFolder)
    # removes: Default\SingletonLock, SingletonSocket, SingletonCookie, LOCK, LOG.old
}
```

Defensive cleanup for code paths that don't do a full deep clean (e.g. `Stop-NativeDevSession` alone).

### 4. Stop before sync (not after)

```powershell
# restart flow:
Stop-NativeDevSession    # ← moved BEFORE Invoke-Robocopy
Start-Sleep 3000
Invoke-Robocopy ...
Launch-NativeDev ...
```

Previously, robocopy ran first. Cargo watch detected the changed source files and triggered a hot-reload, killing and respawning `tauri-foliole-core.exe` while WebView2 was still initializing — breaking the Mojo IPC pipe and causing WebView2 to exit. Now the app is fully stopped before any files change.

### 5. Extended stop-to-start sleep 2000 ms → 3000 ms

Extra margin for TCP port release and OS handle cleanup between sessions.

---

## Remaining Known Issue

**First-attempt failure rate is still ~30–50% even with deep clean.**

The retry always succeeds, so the user experience is acceptable, but it is not root-cause clean. Current hypothesis:

- Vite sometimes takes 1400+ ms to start (vs. normal 800 ms)
- Tauri's WebView2 initialization and Vite's dev server startup race in parallel
- WebView2 navigates to `http://127.0.0.1:4600/` before Vite is ready, gets a connection-refused error, and the Browser Process exits
- Deep clean eliminates the *profile corruption* failure path but not the *connection-refused* failure path

Next investigation step: check whether `tauri_page_load_started` fires on first-attempt failures after 000060. If it does, the browser is navigating but Vite isn't ready; the fix would be to wait for Vite to be listening before starting Tauri.

---

## Files Changed

- `scripts/windows/run-windows-native-dev.ps1` — all fixes above
- `AGENTS.md` — minor doc update
- `src-tauri/src/main.rs` — minor observability update
