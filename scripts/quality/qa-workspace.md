# QA workspace

One registered QA workspace holds a committed `dev` snapshot while development continues.
The workspace is preparation only: it does not dispatch hosted checks or start an agent.

```sh
npm run quality:qa:workspace -- start --volume <mounted-volume> --path <new-directory-on-volume> --owner <chat-id>
npm run quality:qa:workspace -- status
npm run quality:qa:workspace -- run -- npm ci
npm run quality:qa:workspace -- run -- npm run electron:rebuild:native
npm run quality:qa:workspace -- run -- npm run test:sqlite:electron -- <test-file>
npm run quality:remote -- --scope <shared|desktop|android|ios|full>
npm run quality:qa:workspace -- integrate -- npm run test:files -- <affected-tests>
npm run quality:qa:workspace -- finish
```

Run these commands from the development checkout. Preparation records the committed
snapshot and owning chat in the shared Git administrative directory, outside disposable
build artifacts. A second start refuses to replace an occupied workspace. A missing
external workspace remains occupied for recovery.

Run `quality:remote` from the registered QA checkout instead. Its owning chat commits
repairs there, uses Mac preflight, normally pushes only the QA branch and retains the
returned run ID. Repeating the entry resumes matching evidence; an ambiguous delivery
must be resolved before dispatching again. Scoped green is not full acceptance.

Installed dependencies, temporary files, build output and native build caches belong
to QA. Do not link them to the development checkout. The npm download cache may be
shared. Local commands run from QA under the existing development resource gate;
they may wait for development validation to release the same resource. Do not wrap
hosted dispatch or hosted-run waiting in this local command wrapper.

Integration requires a clean development checkout and the saved, successful QA prefix.
It tests the actual merged combination before creating a numbered merge commit. A
later unverified QA commit is left in QA. Conflicts are detected before modifying dev;
failed validation aborts only the tool's unchanged merge, preserving outside edits.

An active QA workspace is retained even when its current commit is already in `dev`.
Normal transient-worktree cleanup cannot release it. Keep the owning chat responsible
for recovery; an unavailable or interrupted workspace is not a completed QA run.

Completion requires matching full evidence and integration of the current QA tip.
Remote cleanup comes before local worktree cleanup; the owner record stays in
`finishing` until both succeed. Retry `finish` after resolving a cleanup failure.
Terminal wait logs and the candidate/integration record are retained under the
development checkout's `.tmp/artifacts/qa/<run-id>` before removing the QA directory.
Preparation alone does not prove quality acceptance. Local validation may wait for
the development preview to release the shared resource; do not stop it implicitly.
