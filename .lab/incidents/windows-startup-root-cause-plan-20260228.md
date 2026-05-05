# Windows Startup Root-Cause and Action Plan (2026-02-28)

- Document intent: standalone plan file focused on root-cause candidates and executable remediation path.
- Why not reuse existing docs: `windows-startup-incident-20260228.md` is a full timeline ledger; this file is for decision and execution.
- Relation to existing docs: derived from incident record + latest runtime snapshots; does not replace spec truth files.

## Scope
- Problem: Windows native startup intermittently fails with white/black screen and `BOOT_MARKER_TIMEOUT`.
- Goal: close root cause for "stuck before page load" and make startup deterministic.
- Non-goal: front-end business feature changes.

## Evidence Baseline (Confirmed)
1. Failure chain repeatedly observed: `tauri_setup -> tauri_window_focused`, missing `tauri_page_load_started/tauri_page_load/boot_start/app_ready`.
2. During failure, `http://127.0.0.1:4600/`, `@vite/client`, `/src/main.tsx` return `200`.
3. Latest timeout snapshot (`boot-timeout-snapshot-20260228-083138-...`) shows:
- native app process exists with visible window rect.
- launcher process exists.
- app-scoped WebView2 process count is `0`.
4. Success sessions can complete full chain and reach `app_ready`.

## Candidate Causes (Ranked)

### C1. WebView2 process not created or exited before attachment (highest priority)
- Confidence: High
- Why:
- Failure snapshot shows app process alive while app-scoped WebView2 process is `0`.
- Event chain never reaches `tauri_page_load_started`, indicating navigation never started.
- Impact: directly explains black/white screen with no frontend boot events.

### C2. WebView2 UDF path/permission/session mismatch (high priority)
- Confidence: Medium-High
- Why:
- Official WebView2 guidance states UDF must be writable and custom location is often preferred.
- Tauri Windows issue #13926 (opened 2025-07-30, still Open at checked time) documents WebView2 startup failure when UDF and runtime user context mismatch.
- Our failure is intermittent, consistent with environment/session-sensitive behavior.

### C3. Runtime contamination (multi-instance/port/mirror drift) amplifies failure but is not sole root cause
- Confidence: Medium
- Why:
- Existing fixes reduced false positives (port 4600 and duplicate instances), but core failure still reproduces.
- Should be treated as noise amplifier, not terminal cause.

### C4. Frontend code/module crash before render (low priority)
- Confidence: Low
- Why:
- In failing sessions, `boot_start` is absent, meaning frontend bootstrap does not run.
- Local static and min-react probes succeeded in controlled conditions.

## Checked Sources
1. Microsoft Learn: Handling process-related events in WebView2
- https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/process-related-events
2. Microsoft Learn: Manage user data folders (UDF)
- https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/user-data-folder
3. Tauri issue #13926 (Windows elevated context + WebView2 UDF startup failure)
- https://github.com/tauri-apps/tauri/issues/13926
4. Tauri issue #13092 (Windows blank/frozen webview scenario reference)
- https://github.com/tauri-apps/tauri/issues/13092

## Action Plan (Executable, Minimal Tasks)

### Step 1. Add WebView2 process-failure telemetry at native layer
- Objective: distinguish "never created" vs "created then exited".
- Implementation:
- in Tauri/Wry integration layer, capture WebView2 process failure events (`ProcessFailed` / browser process exit signals when available) and append to `native-boot-events.ndjson`.
- include failure kind/reason and dump folder path if exposed.
- Acceptance:
- Given a failing startup, When timeout occurs, Then event log contains explicit WebView2 failure category instead of only timeout symptom.

### Step 2. Pin explicit WebView2 user data folder (UDF) to stable writable path
- Objective: remove default-path/session ambiguity.
- Implementation:
- set `WEBVIEW2_USER_DATA_FOLDER` explicitly before tauri launch (single deterministic path).
- keep path outside protected/system-managed folders; verify read/write at startup.
- Acceptance:
- Given startup sequence, When app launches, Then log prints resolved UDF path and write-check result; failures report permission/path error explicitly.

### Step 3. Build reproducible A/B matrix (current vs pinned UDF)
- Objective: verify causal impact, not anecdotal success.
- Implementation:
- run 20 starts per profile:
  - A: current behavior.
  - B: pinned UDF behavior.
- collect counts: success, timeout, retry-success, retry-fail.
- Acceptance:
- Given two profiles, When matrix completes, Then decision is based on failure-rate delta with raw logs attached.

### Step 4. Harden startup policy after validated cause
- Objective: convert diagnosis into deterministic startup behavior.
- Implementation (conditional):
- if UDF mismatch is confirmed: keep pinned UDF + startup guard.
- if process exits are dominant: add targeted recovery (single clean relaunch + WebView2 diagnostics retention).
- Acceptance:
- Given 20 consecutive starts on target environment, When executed with hardened policy, Then no unresolved `BOOT_MARKER_TIMEOUT` remains.

## What We Will Not Do In This Round
1. No full repository migration from `C:` to `D:` as first-line fix.
2. No broad frontend refactor.
3. No silent lowering of quality gates.

## Risk Notes
1. Snapshot and telemetry increase log volume; add retention policy later.
2. Environment-specific security software may still cause process interference; keep this as external risk track.
3. A single successful run is not closure; closure requires matrix evidence.

## Immediate Next Task Recommendation
- Execute only Step 1 first (native failure telemetry), then rerun `windows:dev:start` until one failure is captured.
