# QA workspace

One registered QA workspace holds a committed `dev` snapshot while development continues.
The workspace is preparation only: it does not dispatch hosted checks or start an agent.

```sh
npm run quality:qa:workspace -- start --volume <mounted-volume> --path <new-directory-on-volume> --owner <chat-id>
npm run quality:qa:workspace -- status
npm run quality:qa:workspace -- run -- npm ci
npm run quality:qa:workspace -- run -- npm run electron:rebuild:native
npm run quality:qa:workspace -- run -- npm run test:sqlite:electron -- <test-file>
```

Run these commands from the development checkout. Preparation records the committed
snapshot and owning chat in the shared Git administrative directory, outside disposable
build artifacts. A second start refuses to replace an occupied workspace. A missing
external workspace remains occupied for recovery.

Installed dependencies, temporary files, build output and native build caches belong
to QA. Do not link them to the development checkout. The npm download cache may be
shared. Local commands run from QA under the existing development resource gate;
they may wait for development validation to release the same resource. Do not wrap
hosted dispatch or hosted-run waiting in this local command wrapper.

An active QA workspace is retained even when its current commit is already in `dev`.
Normal transient-worktree cleanup cannot release it. Keep the owning chat responsible
for recovery; an unavailable or interrupted workspace is not a completed QA run.

Hosted dispatch, validated repair integration and explicit completion are separate
steps; preparation alone does not prove quality acceptance.
