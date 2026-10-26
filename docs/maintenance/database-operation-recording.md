# Short SQL operation recordings

Use this diagnostic to discover repeated database work without first knowing the slow feature. It is disabled by default and does not start a client, scan a database, change SQLite settings, or install a background monitor. Use an isolated library and the existing host launch/acceptance entrypoints.

## Desktop

For a new DEV process, pass these environment variables through the existing launcher:

```sh
FOLIOLE_SQL_RECORDING_MS=60000 FOLIOLE_SQL_RECORDING_DIR=.tmp/artifacts/T496/sql npm run macos:dev:open
```

Recording starts on the first cached SQLite statement and stops accepting new operations after the specified duration (1–600000 ms). Opening an already running process does not change its environment: use the existing restart entrypoint when a restart is authorized, then verify the new process used the requested environment. Do not kill or replace the user's running client to record implicitly.

The directory receives a new timestamp/PID JSON file. It initially contains `{}` and is populated on stop. A call started during recording can finish after the deadline: the report first shows `pending > 0`, then is updated with its duration after completion. Re-read once the operation has finished. If the process exits before stop, the placeholder is not valid evidence.

With an already authorized main-process inspector, `globalThis.__folioleSqlRecording` is available after this explicit opt-in. Use `mark('save-one-topic')`, `stop()`, `snapshot()` or `start({ durationMs: 30000, label: 'next-run' })`. Use neutral action labels, not topic names or content. This API does not provide a new renderer IPC or SQL execution channel.

## Companion

Set `VITE_FOLIOLE_SQL_RECORDING=1` when starting the existing Vite DEV/live entrypoint. After the database adapter is initialized, its WebView/browser console exposes:

```js
globalThis.__folioleSqlRecording.start({ durationMs: 60000, label: 'flow' });
globalThis.__folioleSqlRecording.mark('continuous-next');
// Perform ordinary product actions through the existing host controls.
globalThis.__folioleSqlRecording.stop();
JSON.stringify(globalThis.__folioleSqlRecording.snapshot());
```

Save the JSON returned by the existing browser/device evaluation tool under `.tmp/artifacts/<task>/`. `stop()` may be omitted: the deadline stops collection automatically; retrieve `snapshot()` afterward. Do not open, close or replace native SQLite connections to record. The console API is exposed only in DEV with this flag; it is not a production settings feature. A browser preview does not prove native bridge timing.

## Read the evidence

```sh
npm run database:record:report -- .tmp/artifacts/T496/sql/<timestamp-pid>.json
```

The summary ranks statement groups by execution count, cumulative milliseconds, and longest single execution, plus the busiest time windows. No threshold automatically declares a defect. Inspect all three rankings: one query can repeatedly scan a large JSON array internally even when its execution count is one.

Groups include host, operation method, action label and first call stack. SQL literals/comments are redacted; bind arguments, returned values and error messages are never recorded. Quoted identifiers are also redacted conservatively. `returnedRows` counts rows returned to the application, not internal visited rows. Window counts are attributed to operation start; the full elapsed duration, including completion after the window, belongs to that start window. Concurrent asynchronous elapsed times may overlap and must not be added as wall-clock utilization.

Limits bound duration (10 minutes), groups (default 500, maximum 2000), SQL identity length (2000 characters), marks (100), and windows (minimum 100 ms). `overflowOperations` counts operations not given a detailed group after capacity is reached; their window totals remain included. `pending` means observations are incomplete. Caller capture occurs once per group, but timing/proxy/fingerprinting still adds overhead; compare diagnostic and uninstrumented runs before claiming a speed difference.

## Coverage

- Desktop: statements executed with `run`, `get`, or `all` through `prepareCachedSqliteStatement`, including the production driver and better-sqlite DbPort. Raw `sqlite.prepare`, `exec`, `pragma`, lazy `iterate`, native transaction internals, other processes and workers are not captured by this entrypoint.
- Companion: `run` and `query` through `createCapacitorSqliteDbPort`, including ports created for readers. Elapsed time includes the adapter/native bridge round trip; it does not separate native work from queueing. Direct native plugin SQL, plugin transaction methods, native internal statements and work outside this JS runtime are excluded.
- Neither host attributes asynchronous work to an action automatically. Mark phases explicitly and treat first-caller stacks as leads; several callers can share one group. No result implies unexercised paths are healthy.

## Turn observations into reusable checks

Use the quality-maintenance skill's `references/work-amplification-audit.md` and the project's `.lab/atlas/8performance/work-amplification-checks.md`.

1. Merge a suspicious group into the stable operation's existing row or add a pending row with recording path, source revision, host, data shape and action sequence.
2. Verify its necessity and reproduce with a control. Distinguish legitimate batch work, repeated cheap work and a single expensive internal scan.
3. Preserve confirmed or excluded conclusions with validity/recheck conditions. A changed caller can invalidate a conclusion even if the leaf query did not change.
4. Feed confirmed causal features into the skill's existing runtime-pattern checks, including search shape, trigger, exclusions and a falsifying experiment. Add a category only for a new mechanism, then inspect analogous production callers within the authorized audit scope.

Record “uses existing pattern; no new category” when appropriate. A recording report is evidence, not a substitute for updating the checklist and improving the next audit's checks.
