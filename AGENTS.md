# AGENTS

Read any same-directory `AGENTS.local.md` alongside this file; it contains private, untracked local rules. Apply the same rule in subdirectories.

## Decision Order

- The user's latest instructions define the outcome. An approved plan only supplements stable goals already authorized by the user; it cannot expand authorization. Code, tests, fixtures, and controllers must not redefine the goal around the current implementation. If observed evidence disproves the formal contract, stop and refer it to the user.
- Protect user data, security, source-of-truth code, and truthful results first, then choose a route using verified current conditions. Conditional protections override implementation preferences only when their triggers are evidenced. Within these constraints, choose the fastest, shortest, mature, reproducible route.
- Root rules define hard repository-wide boundaries and mechanical entry points; directory rules refine them and apply according to the current task and observed conditions. Plans define intended semantics, not current facts.
- Preserve conditional wording. Do not enforce a protection as a permanent prohibition when its trigger is absent or its invalidation condition is met. Plans, handoffs, and execution must not turn “when” or “only under” into unconditional “must” or “must not.” A shorter, equally reliable mature route may replace an implementation preference.

## Repository And Work Unit

- This is an `Electron + React + TypeScript + Vite + Capacitor` multiplatform monorepo. `electron/`, `android/`, and `ios/` contain thin hosts; `src/app/` and `src/companion/` contain renderer shells; cross-host business logic, state, and stable interfaces belong in `src/features/`, `src/store/`, and `src/shared/`.
- Deliver one runnable, verifiable, reversible capability increment at a time. Divide increments by user outcome, data semantics, or migration semantics, not by files, tests, platforms, commit count, or elapsed time. Exclude unrelated refactoring.
- Product tasks do not implicitly authorize control-plane work. The control plane includes validators, controllers, orchestrators, gates, monitors, protocols, scanners, and general workflows that manage development, verification, acceptance, or agent execution; it excludes input validation, business controllers, and bridges required by the product. Additions or extensions require an explicit current user request or an approved plan naming them as independent deliverables with benefits and acceptance criteria. Generic requests to improve verification or complete an increment do not authorize them.
- Product increments may run existing entry points, add minimal behavior tests and necessary fixtures, and repair tool regressions introduced in the current work to restore the existing contract; repairs must not expand tool responsibilities. If removing a proposed control mechanism leaves product goals and data/security invariants intact, describe its benefit independently rather than treating it as necessary implementation. Each change must directly serve the user outcome, necessary implementation, or minimal behavior verification; no separate attribution ledger is needed. Record unauthorized control-plane gaps as separate follow-ups, continue unblocked product work, and report pending acceptance with the concrete gap when blocked. Do not build unauthorized controls or claim a pass.
- Use a shared core with thin host adapters. Put platform differences in `src/shared/platform/**` or the relevant host; do not duplicate platform branches in feature/store/editor business logic. Production icons, menus, and commands must share their source and names.

## AGENTS Routing

- Read root `AGENTS.md` first. Read the nearest directory rules when work touches the following scopes. Directory rules refine their own paths and cannot override root boundaries. Stop and clarify ownership when rules at the same level conflict.

| Scope | Directory rules |
| --- | --- |
| `electron/**`, `scripts/desktop/**`, `scripts/macos/**`, `scripts/windows/**`, `playwright.desktop.config.ts`, desktop databases or runtime paths | `electron/AGENTS.md` |
| `android/**`, `scripts/android/**`, `capacitor.config.ts` | `android/AGENTS.md` |
| `ios/**`, `scripts/ios/**` | `ios/AGENTS.md` |
| `src/companion/**` | `src/companion/AGENTS.md` |
| `src/features/editor/**` | `src/features/editor/AGENTS.md` |
| `src/app/components/**` | `src/app/components/AGENTS.md` |

- Read all applicable directory rules for work spanning multiple scopes. `scripts/lib/path-domains.mjs` is the mechanical source of truth for script path domains; quality, preview, lint, and pre-push must not define separate routing tables.

## Read Before Editing

- For `docs/i18n/guides/**`, read `docs/i18n/guides/README.md` first; English `en` sources are required. The Demo may offer a preset browser experience, but must not imply a Web edition, production data environment, desktop replacement, or persistent online workspace.

## Risk Routing

- High-risk triggers include sync, schema/migrations, preload/IPC/native bridges, Capacitor/host lifecycles, review queues, delete/restore, import/reimport, persistence, conflicts, security boundaries, irreversible data operations, and repairs after failed manual acceptance. Check official sources as required by the applicable directory rules.
- If scanning, polling, custom protocols, new dependencies, long-term dual writes, runtime migrations, implicit fallbacks, local copies, or pollute-then-clean-up approaches become the proposed primary route, explain the approach, trigger evidence, and exit conditions, then wait for user confirmation.

## Architecture And Data

- Collect observed evidence before diagnosing a non-obvious bug. The root cause must explain both triggering and control conditions. Observations override code-based inference when they conflict. Input restrictions, delays, skips, or lock-based avoidance are allowed only when explicitly labeled as diagnostics, spikes, or temporary fallbacks.
- Define or reuse a stable bridge/contract before wiring a new cross-boundary capability into a host. UI/feature/store code must not add direct low-level connections. Global settings must not enter the `WorkspaceLayoutProps` prop chain; expose editor capabilities through `EditorAdapter`.
- User-visible state that affects results after restart, queues, icons, filtering, scheduling, statistics, or subsequent behavior is durable by default. Cover renderer writes, bridge/runtime sync, persistence, and hydration. Only transient UI process state, such as dialogs, hover/focus, session cursors, and temporary scroll/selection, may remain unpersisted.
- Data, sync, merge, and conflict handling must be recoverable and must not silently overwrite facts. Protect irreplaceable original facts. Rebuildable copies and explicitly retired old state must not introduce long-term dual reads/writes, automatic detection fallbacks, or runtime compatibility migrations unless explicitly requested by the user.

## Quality And Tests

- Use `npm` and entry points registered in `package.json`. Do not fall back to a nonexistent `npm test` or lower check standards. For ordinary local work, use `npm run quality:fast` or explicit `npm run test:files -- <files>`, `npm run test:sqlite:electron -- <files>`, and `npm run lint:files -- <files>`.
- `test:changed`, `quality:desktop`, `quality:android`, `quality:shared`, `quality:full`, `quality:release`, and `quality:ios*` run only in hosted lanes. `scripts/quality/quality-command-contracts.mjs` is the source of truth for command classification. For development hosted rechecks, use only `npm run quality:remote -- --scope <desktop|shared|android|ios|full>`.
- The agent selects risk-appropriate tests for each increment without seeking per-test approval. Behaviors covered by Risk Routing require integration tests using real SQLite or production paths. Other new or changed observable behaviors require a minimal contract independent of implementation choices. For copy/visual-only changes without a stable automated contract, perform visible acceptance under host rules and explain why tests were skipped. Every bug fix, whether discovered locally, remotely, on a device, or by the user, requires a regression test that would fail before the fix. Tests proving the change must fail because the old behavior violates the goal and pass because the new behavior meets it; missing new helpers or files are not behavioral failures. Tests protecting unchanged behavior may pass before and after. Disclose evidence limitations when the old version cannot be rerun safely. Do not freeze incidental DOM order, coordinates, pixels, current copy groupings, or file counts, or infer authorization for control-plane work from test contracts.
- Delete or merge tests only when another test covers the same contract, the semantics are retired, repeated instability cannot be fixed in the current work (annotate under the skip rule and repair or delete within 30 days), or the test only locks function names, source text, or incidental structure. In the commit `context`, identify the test now covering the deleted contract. Never delete its sole coverage to reduce runtime.
- **Local behavior test gate:** All applicable local behavior tests for the current acceptance scope must pass. Derive scenarios proactively from the acceptance goal; do not wait for the user to specify methods. Cover initial state, action sequence, and result assertions for every locally reproducible scenario. For multi-instance interactions, use deterministic production-path integration tests with independent instances and temporary data, asserting final persisted results on each side; do not mock the path under test. Unit tests, lint, builds, and isolated prototypes cannot replace this integration coverage. “All” means the current acceptance scope, not the entire repository on every change.
- Before narrow lint on new/split files or file-size repairs, run `node scripts/check-file-budget.mjs <files>`. Hosted `deps:hardening:check` covers new/upgraded dependencies. A specifically identified vulnerability may bypass the release-age window selectively; verify with `npm ls` and `npm audit --omit=dev`.
- Place `// SKIP: <reason> | <date YYYY-MM-DD> | revive: <condition>` immediately next to every `it.skip` / `test.skip`; review skips older than 30 days. E2E runs separately under host rules, outside quality gates.
- Test durations and overdue skips are informational warnings, not development blockers. Hosted duration summaries warn when total time or one job exceeds the latest successful run by at least 25% and one minute. Skip lint reports skips older than 30 days. Neither changes the quality result.

## Structure, Language, And Files

- Target at most 220 lines per file; split files over 260 lines. Target at most 40 lines per function; split functions over 60 lines. After listing candidate files during planning, run `node scripts/check-file-budget.mjs <files>`. Deletions, moves, and minor edits may proceed on existing files classified as `split`.
- Each file has one core responsibility. Do not compress formatting, combine statements, or remove whitespace to evade size limits.
- Use English for code, comments, commit messages, UI copy, and configuration keys.
- Put temporary HTML, screenshots, samples, logs, and one-off outputs in `.tmp/artifacts/`. Only Foliole-managed, rebuildable caches reused across runs belong in root `.cache/`. Do not enumerate or clean caches outside the current task.
- Repository-wide artifact/cache cleanup is separate from DEV startup, builds, cache preparation, and acceptance. Run it explicitly as needed only when no build or acceptance run is active. For ordinary temporary artifacts, run `node scripts/diagnostics/cleanup-local-artifacts.mjs --dry-run`, review candidates, then replace `--dry-run` with `--apply`. For caches and acceptance artifacts, run `node scripts/diagnostics/local-artifact-cache-retention.mjs`, review candidates, then add `--apply`.
