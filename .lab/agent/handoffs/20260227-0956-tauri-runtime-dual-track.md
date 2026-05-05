# Handoff

## Goal
Finalize a stable dual-track workflow: WSL daily development + native Windows desktop acceptance for Rust-backed Tauri flow.

## Current State
- Completed: committed `000041` on `dev` with Tauri app skeleton, command registration path, and WSL startup automation.
- Completed: enabled Rust command compile/test gates (`cargo check/test --features tauri-command`) and kept `quality-gate` green.
- Completed: added scheduler contract validation and `rust-only` enforcement mode to avoid silent fallback.
- Completed: documented runtime/build policy in `.lab/specs/16-wsl-windows-runtime-build-strategy-v1.md`.
- Completed: added one-click Windows launcher `scripts/windows/Start-Foliole.bat` for WSL dev restart.
- In-progress item: native Windows runtime acceptance pass is still pending (UX/rendering parity confirmation).

## Key Decisions
- Use browser (`npm run dev`) for daily UI iteration speed.
- Use Tauri runtime to verify real Rust invoke path; browser alone cannot prove Rust command execution.
- Treat WSLg rendering as functional reference only; final desktop UX acceptance must run on native Windows runtime.
- Keep npm install stable via repo `.npmrc` (`audit=false`, `fund=false`) and fallback to verbose diagnostics on stalls.

## Changed Files
- `.npmrc`
- `AGENTS.md`
- `.lab/specs/16-wsl-windows-runtime-build-strategy-v1.md`
- `scripts/windows/Start-Foliole.bat`
- `src-tauri/Cargo.toml`
- `src-tauri/build.rs`
- `src-tauri/src/main.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/src/review.rs`
- `src-tauri/tauri.conf.json`
- `src/features/review/model/reviewSchedulerFactory.ts`
- `src/features/review/model/reviewSchedulerContract.ts`

## Next Actions
1. Execute one native Windows acceptance run for Tauri desktop UX and Rust grading path, then record pass/fail evidence.
2. If native acceptance exposes DPI/cursor issues, add a Windows-native startup profile/script (separate from WSLg profile).
3. Decide whether to add an automated smoke check that asserts `invoke('review_grade')` path under `rust-only` runtime.
4. Produce a new handoff after Windows acceptance result with updated risks and follow-up tasks.

## Open Risks
- WSL startup may print `Failed to mount F:\`; current evidence shows it is usually non-blocking but still noisy.
- WSLg graphics stack warnings (`libEGL`/`MESA`) can distort UX perception and should not be used as final visual acceptance basis.
