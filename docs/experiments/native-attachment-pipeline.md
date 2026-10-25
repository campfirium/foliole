# Native attachment pipeline checkpoint

This source patch preserves an isolated Android attachment experiment. It does
not enable or change production sync. Experiment output, databases, APKs, device
credentials, and input files are not included.

Apply `native-attachment-pipeline.patch` from the repository root in a checkout
without the corresponding private prototype files. It restores those files
under `.lab/prototypes/T438/real-path/`.

The experiment prepares the first two signed requests together. An active
transfer does not occupy a preparation slot. Two preparation slots continue
working while requests send serially and at most two completed files finalize.
Demand lookahead consumes existing pending entries. Whole-file verification,
publication, authentication, cancellation, and SQLite receipts remain enabled.

Run the model contract with:

```sh
node --experimental-loader ./scripts/android/ts-js-extension-loader.mjs \
  --experimental-transform-types --test \
  .lab/prototypes/T438/real-path/native-request-prefetch.test.mjs
```

The Android staging entry copies production sources into a disposable capsule.
It requires local input manifests and the fixed device workflow documented in
the existing Android development instructions. Historical input directories are
local prerequisites, not reproducible dependencies shipped by this patch.

On one 196-file run, all 100,073,172 bytes passed independent file and SQLite
checks. The sum of gaps between receive calls was 2,282 ms, with a 9 ms median.
Some later requests were not ready when the preceding receive completed. This
checkpoint does not establish zero waiting, a stable speedup, or cross-platform
acceptance.


The expanded run reused the existing acceptance library, group, coordinator,
and two preparation slots with the original mixed input: 1,565 files totaling
2,147,483,648 bytes. All final file hashes, lengths, and availability flags
passed independent readback; the local pending queue was empty. The receive
interval was 168,297 ms across 1,652 native requests. The sum of inter-request
gaps was 22,835 ms, with a 6 ms median and a 1,318 ms maximum.

The coordinator returned `backlog` after `sync_display_unavailable`, so this
is a successful file-transfer observation rather than a passing whole-sync
acceptance. The first independent-audit wait timed out; capturing the same audit
later confirmed completion without another transfer. The driver now waits on
the existing DOM phase marker instead of repeatedly parsing the full trace.
The source patch includes the larger-input option; frozen data remains a local
prerequisite. No production runtime behavior was activated by this checkpoint.
