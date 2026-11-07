# Dependency updates

## Update ownership

The free Mend-hosted Renovate app owns ordinary version proposals through
`.github/renovate.json`. Updates are proposed directly as pull requests.
Dependabot ordinary version-update limits are zero; GitHub remains the security
fix owner. The dashboard Issue and pre-PR checkbox approvals are disabled.
Every proposal, including major updates, requires review before local adoption;
creating a PR grants no permission to merge or execute its proposed code.

Hosted job `b01a8186-f449-4e1f-820c-438fee77b483` completed on 2026-11-01 with
root npm dependencies, Android dependencies, Gradle Wrapper and both hand-owned
Swift manifests detected. The initial job exposed a lockfile exclusion error;
the corrected npm exclusion matches nested manifests without matching the root
manifest or `package-lock.json`. Local extraction alone was not activation proof.
Native major updates require the linked host migration and applicable build checks before adoption.

To roll back, disable Renovate and restore the Dependabot ordinary limits in the
same change: npm 10, Gradle 5, each Swift root 3.
Do not close existing PRs automatically when changing updater ownership.

Keep GitHub's dependency graph, Dependabot alerts and security updates enabled.
Renovate vulnerability fix PRs are disabled to avoid a second security-fix owner.
Native inventories, Trivy and vendor checks keep their existing responsibilities.

## Update policy

- No additional proposal schedule is imposed. `prHourlyLimit: 0` and
  `prConcurrentLimit: 0` remove the default two-new-PRs-per-hour and ten-open-PR
  limits so eligible updates discovered in a run can be proposed together for
  batch review and local adoption. The unset `branchConcurrentLimit` inherits
  `prConcurrentLimit`, so it does not retain a separate ten-branch limit.
  This does not synchronize upstream releases or seven-day maturity dates,
  guarantee that a hosted run finishes every proposal, or combine all updates
  into one PR. Local validation is not evidence of hosted proposal creation.
- npm proposals follow the existing seven-day installation release-age policy.
  Electron retains its latest-stable exception without this delay. Gradle and
  Swift do not inherit an npm-specific waiting period.
- No update is automatically merged. Major and database/runtime changes require
  explicit review; a PR is an untrusted proposal, not permission to execute it.
- Capacitor packages share a group; plugins must satisfy peer compatibility, and
  do not all need identical version numbers. CodeMirror/Lezer share an editor
  group. Both hand-owned SwiftProtobuf declarations share a native runtime group.
- Managers discover tracked first-party manifests, including nested desktop npm
  packages and Gradle maintenance scripts. Generated plugin manifests remain
  excluded; a first-party nested package is not a third-party plugin manifest.
  GitHub Actions version updates remain outside this configuration.

Creating proposals and triggering CI are separate events. The current repository
workflows have no `pull_request` or `pull_request_target` trigger. Development
quality runs on its existing schedule or manual dispatch; active remote checks
are dispatched separately. Release-branch and release-manifest push workflows
retain their existing branch/path filters. A Renovate PR does not automatically
run full quality checks; local adoption still requires the applicable validation.

## Capacitor and native ownership

Do not update these generated files independently:

- `ios/App/CapApp-SPM/Package.swift`
- `android/capacitor.settings.gradle`
- `android/app/capacitor.build.gradle`
- Package manifests inside `node_modules/`

Capacitor and plugin releases enter through npm. After reviewing an update, use
the existing companion build and native sync entries. Do not add a workflow that
executes arbitrary PR code and pushes generated changes with privileged tokens.
Follow the official migration guide for major host/toolchain changes.

Renovate can update Swift lock pins by package URL. Review both the host lock and
the Xcode app lock. Updated pins do not prove the complete graph resolves: use
native resolution to regenerate missing selections where necessary, then run the
existing strict App/host graph checks and applicable native tests. Preserve the
ownership and verification rules in `native-dependency-updates.md`.

## Hosted activation

Install the official Renovate GitHub App for `campfirium/foliole` only. Its code,
PR, issue, status and workflow permissions are listed by GitHub before approval.
This grants a third party repository access and must be approved by the account
owner. The Community Cloud offering is free; do not subscribe to an enterprise
plan or configure self-hosted infrastructure for this repository.

Record the first hosted job and its candidate inventory before switching updater
ownership. Local schema validation and extraction are preparation evidence only.
Verified Renovate and Dependabot proposals share the existing dependency batch
notification path, including proposals with passing or absent checks. Their exact
author identities are `app/renovate` and `app/dependabot`; other authors retain
independent review. Later Renovate check failures retain their separate read-only
reminders and do not acquire a second dependency writer.
The retired dashboard Issue #185 is not a user support request.

## Local adoption

The existing handoff groups newly observed proposals by repository and target
branch across scans: five quiet minutes after the last arrival, capped at thirty
minutes from the first. Delivery occurs on the next existing scan. Pending windows
and delivered checkpoints survive restarts; old individual review notifications
are not replayed when changing the route. A successful inbox submission is not
proof that a maintainer viewed or continued the paused task.

Dependency batches use a compact source-controlled handoff instead of copying
personal workflow templates. They carry proposal identities and point to the
existing skills; the handling task fetches current PR bodies, comments and diffs.
The producer checks the configured prompt limit before enqueue, so an oversized
event fails without consuming its batch or PR checkpoints. Enqueue still does not
attest eventual Desktop delivery; inspect dead letters for downstream failures.

When the maintainer continues an authorized handling batch, one agent reviews
the current proposals from both verified bots and implements eligible updates on
the direct local `dev` checkout. An explicit review-only or single-PR instruction
takes precedence. A proposal for another base stays read-only. Inspect the full
diff, current head, release evidence and compatibility before executing code;
bot identity does not make its changes safe to run.

Choose upgrade targets, then group related dependencies and combine compatible
routine updates. A group can contain multiple packages and PRs. Shared manifests,
lockfiles and generated outputs have one writer; that protection does not impose
a one-package limit. Keep ordinary groups in one task, splitting only an
independently scoped migration when warranted. Development uses local dev without
a feature branch or worktree; active remote QA uses the registered check workspace.
Do not merge or check out the bot's branch.

Run focused behavior checks and necessary builds per group, then share applicable
checks for the final combination. Builds alone do not prove runtime or data
behavior. After local checks and scoped commits, record the pending-QA handoff
below and finish the dependency task. Do not start a check workspace, remote run
or another chat solely to close its PR. Use normal scheduled dev delivery unless
a manual push is separately authorized; an explicit QA request can start a batch.
On later dependency batches, recognize implementations already present in dev
instead of repeating installs or commits because the PR is still open.

The next centralized check task reads pending entries at batch start and owns
validation and PR closure for updates contained in its frozen candidate and
covered by its checks. The original dependency task need not return. Active QA
and repairs use the registered workspace on `check`: workspace operations use
`quality:qa:workspace` from dev, while `quality:remote` runs from the clean QA
checkout. Its owner handles preflight, hosted checks, repairs, integration and
workspace release. Scheduled dev and release workflows retain their own lanes.

Follow affected host rules without turning ordinary updates into full release
acceptance. A blocked group does not hold unrelated eligible updates. The QA owner
closes each eligible PR after required checks for the containing candidate, dev
integration and remote dev containment, including repairs. Re-read author, base
and head; review any changed proposal and confirm it is still covered. Comment
with the superseding commit and passing QA evidence, verify closure and remove
the pending row. Failed, uncovered or undelivered rows retain evidence and the
next action under the QA owner; workspace release does not discard closure work.
Check publication alone does not authorize a dev push. Do not use PR count to
determine install, test, commit or task count.

### Completed Android/iPhone dependency batch

T726 completed full QA for `7e5abc6426417cbe9616748cceaef8e9cca0c226`:
[Android/full 42068459605](https://github.com/campfirium/foliole/actions/runs/42068459605)
and [iPhone/full 42074860935](https://github.com/campfirium/foliole/actions/runs/42074860935),
including dependency hardening, Windows, Android and iOS native coverage. Repairs
integrate into dev `4adcb9cbf`; actual dev combination checks pass and the registered
QA workspace is released. Remote dev `df1fbd1a11e012fcab3e068c68f4ed3286bd7112`
contains the implementations and all integrated QA repairs; closure is complete.
No full QA was repeated solely for PR closure.
Earlier baseline failures below are historical, not current failures. TestFlight
0.7.17 (3.1) is `IN_BETA_TESTING`; Android queue 7580529200 preserves this accepted
source behind code3's existing review, without building or uploading a new package.
The subsequently reopened #189 proposes AGP 9.5.1; it is outside this frozen
candidate, remains unadopted/open, and requires its own next-batch validation.

On 2026-11-06, T726-1 re-read #187's author, base, head, full diff, body and
comments and closed the exact Node 24.22.2 pin as **not adopted**. Reviewed head:
`9e032ec5642a6b81d33ce2bdbd5d9b82ea353728`; the pin conflicts with the coherent
Node 26.13.0 baseline in `3bf3d290e`. This is not an adoption or remote-delivery
claim. The exact-version title preserves future-version proposals without a
major-wide ignore rule; future runtime proposals use normal batch review.
[Closure evidence](https://github.com/campfirium/foliole/pull/187#issuecomment-6671054222).

On 2026-11-06, the eight covered proposals below were confirmed closed after
remote containment and current proposal verification. #200/#204/#205/#206/#207
were already closed by Renovate; #199/#201/#203 received fresh body/comments/full
diff review and explicit closure. This does not claim Android store approval,
physical Windows provisioning or a new mobile upload.

| Closed proposal | Validated implementation |
| --- | --- |
| [#199](https://github.com/campfirium/foliole/pull/199#issuecomment-6672495102) | lucide-react 1.64.0; `a84623efb` |
| [#203](https://github.com/campfirium/foliole/pull/203#issuecomment-6672496704) | react-virtual 3.14.24 / virtual-core 3.19.9; `a84623efb` |
| [#201](https://github.com/campfirium/foliole/pull/201#issuecomment-6672498217) | Compatible installer backport / glob 14.0.3 / minimatch 11.0.3; `0b47d3fae`, not the proposed 11.0.2 override |
| #200 | Electron 45.2.3; `2c54b5086`; original assessment found no separate release acceleration needed |
| #204 / #206 | protobuf-gradle-plugin 0.10.1 / Capacitor 8.6.0; `7f7dd523e` |
| #205 | liquidjs 10.30.1; `a84623efb` |
| #207 | Node 26.13.0 / Node types 26.6.6; `3bf3d290e`; physical Windows gap remains in the existing trial |

### Post-release transitive maintenance

2026-11-07: npm 12.2.1 lock-only resolution rejected the unchanged bundled
`@tailwindcss/oxide-wasm32-wasi` registry tarball ([npm/cli#9800](https://github.com/npm/cli/issues/9800)).
The maintenance entry now uses ordinary `npm update --no-save --ignore-scripts`
under the existing exclusive resource gate; remote-source protection and the
seven-day policy remain unchanged. A real npm fixture reproduces the old failure,
updates through the repaired path, and verifies explicit URL rejection and skipped
install scripts. Entry repair: `c800d219d`.

The post-0.8.0 lockfile refresh updates only `@csstools/css-color-parser`
4.2.6 → 4.2.7, `@csstools/css-syntax-patches-for-csstree` 1.1.15 → 1.1.16,
and `tldts-core` 7.4.19 → 7.4.20. Registry publication dates are October 29,
October 29 and October 28 respectively, all older than seven days. Direct
versions, manifest, overrides and held `nwsapi` remain unchanged; the requested
`electron-to-chromium` and `node-releases` did not change under existing policy.
Installation, `npm ls --all`, production audit (zero vulnerabilities), Electron
native health, `quality:fast`, desktop and companion web builds pass. Logs:
`.tmp/waits/T729-19-refresh.log`, `.tmp/waits/T729-19-local.log`.
No product/runtime behavior changed and no new physical-device trial is needed.
The owning maintenance task is continuing with registered full check QA including
hosted dependency hardening; local success is not a hosted pass.

### Locally implemented updates awaiting centralized QA

These entries hand validation and closure to the next centralized check task;
they are not upstream compatibility deferrals and do not start QA themselves.
Use repository `campfirium/foliole`, base `dev`, unless a row explicitly says
otherwise. Record the verified author/head, implementation commit, local
evidence and required QA coverage. Candidate containment alone is not a pass.

| PR and reviewed proposal | Local implementation and evidence | Required QA and closure owner |
| --- | --- | --- |
| [#208](https://github.com/campfirium/foliole/pull/208); `app/renovate`; head `72bb53e3c0370b218ab51d90cac10ebb636e2d49`; knip 6.43.0 → 6.44.0 | `4c344a3e2`; 2026-11-06, T728: official release and npm provenance agree; npm published 2026-10-29T19:44:31Z, satisfying seven-day maturity. Node 26.13.0 satisfies unchanged engines; dependency declarations are unchanged. Local npm regeneration changes only knip, without the proposal's incidental lockfile churn. Baseline and upgraded `npm run deps:scan`, `npm ls knip --depth=0` and `npm run quality:fast` pass. Logs: `.tmp/waits/pr208-baseline-scan.log`, `pr208-install.log`, `pr208-validation.log`. Development analyzer only: no product/runtime behavior change or new device-trial gap; host acceptance skipped. | Next centralized check owner: desktop quality including dependency scan and hosted dependency hardening on a candidate containing this commit, then dev integration, remote containment and current-head review before closure. PR remains open; no QA dispatch or manual dev push in this task. Existing implementations remain with T726-1; newly reviewed #189 AGP 9.5.1 is unadopted and remains for the next small native increment. |
| [#202](https://github.com/campfirium/foliole/pull/202); `app/renovate`; head `cef38822a5969ddfe5eb0dc7ee3f172a464c12bf`; ts-fsrs 5.4.2 → 6.0.0, srs-kit 1.0.0; Node 24.22.2 | `d66bddbe6` (runtime), `b7fe04438` (FSRS API); 2026-11-05: explicit FSRS6Model/UTC calendar-day policy, original weights and review facts retained. 34 migration contracts, real SQLite grade/replay/undo/concurrency, desktop/mobile-owner training and model sync, browser parity and scoped lint passed; desktop/companion builds, Electron native health, CLI SEA version smoke and Mac Hidden Native threshold training → trained grade → normal process restart passed. Logs: `.tmp/waits/t714-1-fsrs-*.log`, `.tmp/artifacts/T714-1/`. | Next centralized check owner: hosted dependency hardening plus full quality on a candidate containing both commits; Windows system Node24 provision/ABI/build remains unverified (trial registered). Existing T7 concurrency test fails on both Node22/24 because its empty inputs omit workflow defaults; independent seed recorded, not repaired here or counted green. Older training spec assumes Reading mode has Show Answer; comprehensive read-scope spec above covers the intended training/grade/restart contract. No QA dispatch, manual dev push, release or PR closure here. |

The #200 local blocker recorded in `a6257b5f6` is resolved. Electron virtualizes
ASAR archives as directories; universal packaging needs raw files, as on Node.
The existing merge test now scopes `process.noAsar` to that operation and restores
it in `finally`, retaining both architecture and payload assertions. New physical
file assertions failed before the fix and passed afterward; logs are
`.tmp/waits/t712-asar-regression-red.log` and the green log above. The same old
failure was reproduced with 45.2.1, so it was not a runtime-upgrade regression.
See [Electron's documented raw archive semantics](https://www.electronjs.org/docs/latest/tutorial/asar-archives#treating-an-asar-archive-as-a-normal-file).

The 2026-11-04 assessment matched Electron 45.2.2 to the [then-latest stable release](https://releases.electronjs.org/release/v45.2.2).
Its npm publication was 2026-11-03T21:43:24.912Z; the Electron maturity exception
applies. Official notes list Wayland hidden-parent and CSS-removal fixes plus
Chromium/Node updates, without a disclosed security advisory: follow the normal
Foliole release schedule; no major-version follow-up is required.

On 2026-11-05, #199 advanced to head `220c9689ee68139169d0a9b78b354c1da93ce979`
and lucide-react 1.63.0. The older implementation above does not cover that target;
the current proposal's local validation blocker is recorded below.

## Reviewed proposals and deferred adoption

2026-11-06, T730: #209 (`app/renovate`, base `dev`, head
`cd7e3709f0c69b4af9a400be55b2aac82a30c80b`) is **not adopted**: Node
26.13.0 is already provisioned by `3bf3d290e`; replacing engines
`>=26.13.0 <27` with `v26.13.0` only rejects later compatible Node26 patches.
Local semver checks confirm that difference; manifest and lock engines agree.
The [official release](https://nodejs.org/en/blog/release/v26.13.0) is dated
2026-10-28; release maturity is not the reason for rejection. PR remains open
under this batch's no-unvalidated-closure restriction. Next dependency batch
owner rechecks changed proposals. The requested Node npm engines exception now
uses `replace`, retaining ranges and out-of-range proposals; other packages keep
`pin`. Regression: red before, green after; hosted reconciliation is unverified.
Re-listed and reviewed all six open bot proposals: #208/#203/#199 already have
local implementations, #201 remains with its existing QA owner, and #189's
AGP 9.5.1 compatibility/build validation remains a separate native increment.

Every reviewed proposal ends with an explicit decision. Locally implemented
updates may remain open with the pending-QA handoff above, owned by the next
centralized check task rather than an indefinitely active dependency task.
Close adopted proposals after the evidence above. Close rejected or upstream-
deferred proposals after recording the actual reason; closure does not claim
adoption, validation or vulnerability repair.
Do not bulk-close unreviewed, human-authored or out-of-scope proposals to reach zero.
An access failure or interrupted review remains visibly incomplete with an owner.

For a deferral, record the package and exact proposed version, evidence, upstream
condition to resume, review date and reviewing owner here. The dependency-batch
handler rechecks these conditions before selecting upgrades, including when a
related package changes while the deferred target stays the same. Renovate owns
version discovery and the existing PR notification path triggers dependency batches;
no separate model timer is required. Renovate does not evaluate arbitrary application
compatibility conditions. If no batch or explicit review occurs, no condition
review is claimed. Unchanged blockers stay quiet. When a condition clears, adopt
through the ordinary local validation and QA workflow; the original closed PR
remains a historical decision and need not be reopened to implement the upgrade.
Update or remove the row when that decision lands. A failed upstream query is
unknown, not an unchanged or resolved condition.

Renovate matches closed proposals using their branch and version-bearing title.
Major proposals use the full target version so rejecting one version does not
ignore the whole major series. Before closing an older major-only title, rename
it to the matching full-version title. Do not use broad ignore rules or forced
recreation of the same rejected version. For grouped or nonunique proposals,
verify the updater's actual recreation behavior before closing. The dependency
batch review also covers support changes without a new target version.

| Proposal | Deferred target and evidence | Resume condition | Reviewed | Owner |
| --- | --- | --- | --- | --- |
| [#191](https://github.com/campfirium/foliole/pull/191) | pdfjs-dist 6.4.299; React-PDF 11.0.0 pins 6.3.289, creating mismatched main and worker runtimes. | Official React-PDF supports a matching newer PDF.js; adopt and validate the pair. | 2026-11-03 | Dependency batch handler |
| [#192](https://github.com/campfirium/foliole/pull/192) | minimatch 10.2.6; actual glob7 escaped-name regression, plus GHSA-g3hv-75wg-m249 still affects this target. | Upstream installer/temp/rimraf/glob chain supports a patched matcher, or a reviewed alternative passes the existing installer behavior tests; advisory repair remains separate. | 2026-11-03 | Dependency batch handler |
| [#193](https://github.com/campfirium/foliole/pull/193) | TypeScript 7.0.2; typescript-eslint 8.72.1 requires TypeScript <6.1 and the new compiler API is not stable. | Official lint tooling supports TS7 and the production compiler-API consumers have a supported migration path. | 2026-11-03 | Dependency batch handler |

The 2026-11-04 batch also rechecked the earlier deferrals: React-PDF latest
11.0.0 still pins PDF.js 6.3.289; typescript-eslint latest 8.72.1 still requires
TypeScript below 6.1. The legacy matcher regression persists with the newer
11.0.2 proposal, so #192's compatibility resume condition is not met. These
checks do not claim that any existing security advisory has been repaired.

Before the local installer backport above, the 2026-11-05 batch rechecked
those upstream versions and the installer chain:
React-PDF and typescript-eslint retain the constraints above; electron-winstaller
5.4.4 still uses temp, whose latest 0.9.4 uses rimraf 2.6.x and glob 7.
The isolated #201 graph still fails escaped-name matching while the installed
graph passes (`.tmp/artifacts/T714/minimatch/result.json`). No PR was closed.
The ts-fsrs [official migration guide](https://open-spaced-repetition.github.io/ts-fsrs/guide/migration)
separates package/API adoption from upgrading the model to FSRS-7; this review
does not authorize a model change or invent missing memory/history.

See [Renovate closed-PR matching](https://docs.renovatebot.com/key-concepts/pull-requests/)
and [version title configuration](https://docs.renovatebot.com/configuration-options/#commitmessageextra).

References: [Renovate installation](https://docs.renovatebot.com/getting-started/installing-onboarding/),
[PR hourly limit](https://docs.renovatebot.com/configuration-options/#prhourlylimit),
[PR concurrency](https://docs.renovatebot.com/configuration-options/#prconcurrentlimit),
[branch concurrency inheritance](https://docs.renovatebot.com/configuration-options/#branchconcurrentlimit),
[free hosting](https://docs.renovatebot.com/mend-hosted/overview/),
[Ionic reference configuration](https://github.com/ionic-team/ionic-react-conference-app/blob/main/renovate.json),
[Swift manager](https://docs.renovatebot.com/modules/manager/swift/).

## FSRS-7 model and optimizer adoption (2026-11-06)

The model upgrade selects FSRS-7 in the already adopted ts-fsrs 6.0.0 API.
`fsrs-browser` 6.6.0 is replaced by
`@open-spaced-repetition/binding-wasm32-wasip1` 0.6.0 for single-thread Worker
training. Scheduling, training and held-out evaluation use fractional UTC days
and the same 34-weight model. Historical 21-weight training records remain facts
but cannot supply weights or consume the new model's training eligibility.

The published WASI loader creates an emnapi 2.0.0-beta.2 context, while npm can
resolve its wasm-runtime peer range to emnapi 1.11.2. That combination fails on
initialization with `this.bridge.setLastError is not a function`, independently
of Vitest. The scoped wasm-runtime overrides align both emnapi peers to the
loader's exact version; no generated loader or installed package is patched.
Remove these overrides when the upstream dependency graph resolves a compatible
context/core pair itself, after repeating real Worker training and restart.

Local evidence includes real WASM training, exact-candidate chronological
holdout evaluation, independent SQLite parameter exchange, schema upgrade
rollback/retry, grade/undo/reopen, browser import and mobile owner hydration.
The next centralized QA candidate should include this model/optimizer change
and run dependency hardening and full quality. No separate QA, release, public
push or dependency PR closure is implied by this adoption record.
