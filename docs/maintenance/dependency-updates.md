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

### Locally implemented updates awaiting centralized QA

T726 completed full QA for `7e5abc6426417cbe9616748cceaef8e9cca0c226`:
[Android/full 42068459605](https://github.com/campfirium/foliole/actions/runs/42068459605)
and [iPhone/full 42074860935](https://github.com/campfirium/foliole/actions/runs/42074860935),
including dependency hardening, Windows, Android and iOS native coverage. Repairs
integrate into dev `4adcb9cbf`; actual dev combination checks pass and the registered
QA workspace is released. T726-1 now owns closure pending scheduled remote
dev delivery and current-head review; do not repeat green QA just to wait for delivery.
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

These entries hand validation and closure to the next centralized check task;
they are not upstream compatibility deferrals and do not start QA themselves.
Use repository `campfirium/foliole`, base `dev`, unless a row explicitly says
otherwise. Record the verified author/head, implementation commit, local
evidence and required QA coverage. Candidate containment alone is not a pass.

| PR and reviewed proposal | Local implementation and evidence | Required QA and closure owner |
| --- | --- | --- |
| [#208](https://github.com/campfirium/foliole/pull/208); `app/renovate`; head `72bb53e3c0370b218ab51d90cac10ebb636e2d49`; knip 6.43.0 → 6.44.0 | `4c344a3e2`; 2026-11-06, T728: official release and npm provenance agree; npm published 2026-10-29T19:44:31Z, satisfying seven-day maturity. Node 26.13.0 satisfies unchanged engines; dependency declarations are unchanged. Local npm regeneration changes only knip, without the proposal's incidental lockfile churn. Baseline and upgraded `npm run deps:scan`, `npm ls knip --depth=0` and `npm run quality:fast` pass. Logs: `.tmp/waits/pr208-baseline-scan.log`, `pr208-install.log`, `pr208-validation.log`. Development analyzer only: no product/runtime behavior change or new device-trial gap; host acceptance skipped. | Next centralized check owner: desktop quality including dependency scan and hosted dependency hardening on a candidate containing this commit, then dev integration, remote containment and current-head review before closure. PR remains open; no QA dispatch or manual dev push in this task. Existing implementations remain with T726-1; newly reviewed #189 AGP 9.5.1 is unadopted and remains for the next small native increment. |
| #200 Electron 45.2.3; `app/renovate`; head `83eef9aff15383635f149ab82917347946d9de3c` | `2c54b5086`; official GitHub latest stable and npm agree, published 2026-11-04T21:39:17Z, beyond four-hour maturity. Actual executable reports 45.2.3. Native ABI/SQLite/DNS-SD lifecycle, six files / 36 preload/database/installer/security contracts, desktop build, quality:fast and both Hidden Native presentation/main-path specs pass. Logs `.tmp/waits/t726-electron-install.log`, `t726-electron-validation.log`. | T726 owns full QA and dependency hardening, integration, remote containment and closure. Stable target 45.2.3 is matched; no major follow-up. Official notes list upstream component backports, no disclosed advisory: no separate release acceleration, follow normal publication. Mac results do not prove Windows installation or native shell behavior. |
| #207 Node 26.13.0 / @types/node 26.6.6; `app/renovate`; head `9d91b8f3effdb25c5b53d59f92aaf14105e099d6` | `3bf3d290e`; engines retain the lower bound (`>=26.13.0 <27`); Mac development Node, hosted pins, checksum-verified SEA runtime and Windows provisioning contracts align. Seven files / 23 tests, desktop/companion builds, native health, scoped lint and quality:fast pass. A real SEA CLI regression failed before the disk-backed loader fix and passes afterward; actual signed CLI `--version` returns protocol metadata successfully. Logs `.tmp/waits/t726-node26-local.log`, `t726-sea-red.log`, `t726-sea-green.log`, `t726-node26-cli-final.log`, `t726-node26-fast.log`. | T726 owns full QA, hosted hardening and integrated remote containment before closure. Windows physical Node26 provisioning/ABI/build remains unverified; hosted Node installation is not proof of the local Windows environment. #187's exact Node24 pin conflicts with this coherent baseline and is not adopted. |
| #204 protobuf-gradle-plugin 0.10.1, head `643d1318545ce7eb2c9b03ae846ba2917e3989fa`; #206 Capacitor 8.6.0, head `b9ecacda818b22ddc959611a9e6922428dbf097d`; both `app/renovate` | `7f7dd523e`; peers/maturity and upstream runtime/CLI changes reviewed. SQLCipher/security-evidence tests 23, bridge/editing/SQLite contracts 53 and build/plugin contracts 6 pass. Android debug plus androidTest APKs and unsigned engineering release AAB build; iOS generic unsigned compile and both Swift graphs resolve. Capacitor tag revision matches the app lock; native health passes. Logs `.tmp/waits/t726-native-install.log`, `t726-native-runtime-contracts.log`, `t726-native-final.log`; graph `.tmp/artifacts/T726/swift-graph/inventory.json` has zero graph errors but incomplete advisory coverage, not a security pass. | T726 full QA with dependency hardening and both native hosts, then integrated dev/remote containment and re-review/closure. Local AAB is engineering-only, using existing code3 without allocation/upload; it is not the final signed delivery. Official Capacitor download URL returned 504; the same GitHub release asset was fetched via API and matched both manifest/release SHA256 before Xcode consumed its standard artifact cache; no manifest, framework or source was patched. |
| #203 react-virtual 3.14.24 / virtual-core 3.19.9, head `96f1853dad1e2fb44694cb1157462a843689fac7`; #205 liquidjs 10.30.1, head `f5b966dd336a9dce7341b454251b2b31f3336698`; #199 lucide-react 1.64.0, head `c603db536b44ec9af6cdd0836bc473b7e0aafa90`; all `app/renovate` | `a84623efb`; seven-day maturity and peers verified; 10 files / 55 tests, desktop build, native health and quality:fast pass. Hidden Native list navigation/sorting with 99/152 rows passed twice (6 tests), screenshots inspected. Real wheel input replaces invalid DOM scrolling during restoration; original position assertions retained. Logs: `.tmp/waits/t726-routine-readoption.log`, `t726-list-wheel-acceptance.log`, `t726-repaired-fast.log`. | T726 owns explicitly requested full QA, hardening, integration, remote dev containment, re-review and closure, plus Android beta and iPhone TestFlight external review. Not yet hosted-validated or closed. |
| [#201](https://github.com/campfirium/foliole/pull/201); `app/renovate`; head `79374fade5d55c3932768518b55f09a61b3f3130`; replace the incompatible glob7 override through an installer backport | `0b47d3fae`; 2026-11-05: verified electron-winstaller 5.4.4 plus upstream cleanup backport and explicitly retained synchronous/asynchronous/callback, wildcard and escaped-name contracts; actual graph now uses glob14.0.3/minimatch11.0.3 with no temp/rimraf2/glob7/minimatch3. Missing tracked-directory sibling deletion reproduced in both modes before the fix; all 19 focused contracts now pass. Build, dependency scan, scoped lint and final Electron native health pass; full and production npm audit report zero vulnerabilities. The tarball rebuild is byte-reproducible; 48 upstream files, all vendor/resources/install-script bytes are unchanged. Logs: `.tmp/waits/t714-2-cleanup-red.log`, `t714-2-final-contracts.log`, `t714-2-build.log`, `t714-2-native-final.log`; archive/audit evidence: `.tmp/artifacts/T714-2/`. | Next centralized check owner: hosted dependency hardening and desktop packaging/installer quality on a candidate containing this commit; verify root local-tarball resolution, unchanged architecture selection, retained cleanup and escaped-name tests. Windows-native cleanup/path semantics and NSIS build/install remain unverified in the existing desktop trial batch. Total `quality:fast` remains red only at the pre-existing T7 default-input fixture (S714-3); no green aggregate claim. Then verify remote dev containment, re-review current proposal and close PR. No QA dispatch or manual dev push here. |
| [#199](https://github.com/campfirium/foliole/pull/199); `app/renovate`; head `c8696b8b0846698325451f977da23bf3dda396e3`; lucide-react 1.61.0 → 1.62.0 | `eb4f2558f`; 2026-11-04: `npm run test:files -- src/shared/ui/LucideIconCatalog.test.ts src/features/nodes/components/NodeTreeRowIconGraphic.test.tsx src/features/settings/components/sections/SettingsRailIconPicker.test.tsx src/companion/CompanionSelectionAnnotationToolbar.test.tsx` passed (20 tests); `npm run build` passed; `npm ls lucide-react react --depth=0` confirmed compatible peers. | Full QA [41941716807](https://github.com/campfirium/foliole/actions/runs/41941716807) passed at `ea7a7518c`; repairs integrated into dev `86a8cd2cf` and QA workspace released. Remote dev repair containment awaits normal scheduled delivery. Re-read on 2026-11-05: current Renovate head `220c9689ee68139169d0a9b78b354c1da93ce979` now targets 1.63.0; this frozen candidate contains only 1.62.0, so keep the changed PR open and use its existing deferral below for the newer proposal. QA owner: T251-13B. |
| [#200](https://github.com/campfirium/foliole/pull/200); `app/renovate`; head `ef50d39e37ec51ab967254b12ce1857f7ae95689`; Electron 45.2.1 → 45.2.2 | `390a759ac`; 2026-11-04: native rebuild/health passed (SQLite ABI, security bookmarks and DNS-SD lifecycle); six focused files passed (29 tests), covering preload, SQLite lifecycle, import/reimport, installer cleanup, toolchain compatibility and minimatch limits; ordinary-Node toolchain tests and scoped lint passed; `quality:fast` passed (including 28 related tests); desktop build and both hidden-native presentation/main-path smoke specs passed. Logs: `.tmp/waits/t712-final-local.log`, `.tmp/waits/t712-asar-regression-green.log`, `.tmp/waits/t712-electron-runtime.log`, `.tmp/waits/t712-fast-and-desktop.log`. | Full QA [41941716807](https://github.com/campfirium/foliole/actions/runs/41941716807) passed at `ea7a7518c`; repairs integrated into dev `86a8cd2cf` and QA workspace released. On 2026-11-05 the verified Renovate proposal retained head `ef50d39e37ec51ab967254b12ce1857f7ae95689` and was already CLOSED by the bot; no agent closure or new Electron adoption was performed. Remote dev contains `390a759ac`, but final repair containment awaits normal scheduled delivery; retain this row until that evidence is verified, then remove it. QA owner: T251-13B. |
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

## Historical batch local validation blocker

Resolved locally on 2026-11-05: `08d9c1106` repairs the baseline (25 files / 156 tests, build and lint green); `5044474c5` repairs preview placement and the stale release-queue assertion; `a84623efb` adopts the routine updates above. Logs: `.tmp/waits/t726-baseline-contracts-green.log` and `t726-repaired-fast.log`. The user explicitly authorized this task to repair related errors and finish full QA plus Android and iPhone test-channel submissions. Native #204/#206, coherent Node26 #207 and latest Electron #200 remain next. The former writer has finished. Android code3 (`0.7.17.3.ea7a7518c`) is IN_REVIEW as of 2026-11-05T14:21:35Z; preserve it until approval/publication. The older blocker and target records below are historical, not instructions to revert the validated updates.

2026-11-05, owner T726: re-listed all nine open `app/renovate` proposals for `campfirium/foliole` / `dev` and read current bodies, comments and full diffs. No PR was closed, merged or adopted in this attempt. Existing #201 implementation remains owned by centralized QA; do not reinstall it. After restoring dependencies, `npm run electron:native:health` passed, including native rebuild, SQLite ABI and DNS-SD lifecycle (`.tmp/waits/t726-baseline-native.log`).

- Tested #203 (`96f1853dad1e2fb44694cb1157462a843689fac7`, react-virtual 3.14.24 / virtual-core 3.19.9), #205 (`f5b966dd336a9dce7341b454251b2b31f3336698`, liquidjs 10.30.1) and current #199 (`c603db536b44ec9af6cdd0836bc473b7e0aafa90`, lucide-react 1.64.0). All meet npm's seven-day age rule. Ten focused files passed 55 contracts for list positions/remeasurement, icon consumers and production Liquid theme/site rendering. `npm run build` failed with 60 TypeScript errors; restoring all three original packages reproduced exactly the same 60 diagnostics. Manifests and lockfile are restored without a diff. Logs: `.tmp/waits/t726-routine-checks.log` and `.tmp/waits/t726-baseline-build.log`. This supersedes #199's earlier target-specific blocker below, not its historical QA evidence.
- Recheck trigger: after companion/image-cloze implementation owners repair missing typography fixture fields, unsupported Testing Library `exact` options, the callable mock/Storage fixtures and optional image-region types, T726 or the next dependency batch reruns those ten files and `npm run build`, then native health and applicable host acceptance before any adoption commit or pending-QA registration. Do not repair unrelated feature fixtures in the dependency task or count the failed build as green.
- #204 (`643d1318545ce7eb2c9b03ae846ba2917e3989fa`, protobuf-gradle-plugin 0.10.1) and #206 (`b9ecacda818b22ddc959611a9e6922428dbf097d`, Capacitor 8.6.0) received proposal review only; native compatibility/build and generated graph validation remain unperformed, not failed or rejected. Resume these as separate native increments under the active small-increment rule; no native files were changed.
- #207 (`9d91b8f3effdb25c5b53d59f92aaf14105e099d6`) only widens engines to `<27` and updates Node types to 26.6.6; it does not provision Node 26.13.0. Preserve the lower bound and migrate `.node-version`, CI, CLI SEA checksum/runtime and Windows provisioning together when implementing. T725 currently writes overlapping Android release workflows; wait for that writer to finish before runtime migration. #187 (`9c6fedb125780058b1cdb3e90487af72a66020b2`) proposes exact Node24 engines and remains unadopted pending the coherent runtime decision, not a second competing engines write.
- #200 now proposes 45.2.3 (`83eef9aff15383635f149ab82917347946d9de3c`), whereas installed Electron remains 45.2.2. [Official latest stable 45.2.3](https://releases.electronjs.org/release/v45.2.3) is the required target; no major follow-up is needed. Its notes list upstream component backports without a disclosed advisory: no separate release acceleration, follow normal publication. Runtime adoption and its native/build/Hidden Native checks remain unperformed; the old 45.2.2 QA row does not cover this changed proposal.

## Reviewed proposals and deferred adoption

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
| [#199](https://github.com/campfirium/foliole/pull/199); `app/renovate`; head `220c9689ee68139169d0a9b78b354c1da93ce979` | lucide-react 1.63.0 passed seven-day maturity and compatible React peers. Six focused files passed (30 tests), including icon consumers and installer/toolchain contracts, but `npm run build` failed with TS2352 in `src/shared/platform/companion/runtime/companionImageBackup.integration.test.ts:36`: the backup-port fixture lacks required methods. The same failure reproduces after restoring 1.62.0; the dependency change was reverted, not adopted. Logs: `.tmp/waits/t714-local-validation.log`, `.tmp/waits/t714-baseline-build.log`. | After the existing mobile-backup work repairs its baseline typecheck, the next dependency batch reruns the four icon-consumer tests listed above, `npm run build`, and `npm ls lucide-react react --depth=0` on the current reviewed target; only then commit and register centralized QA. Keep the PR open. | 2026-11-05 | Dependency batch handler; backup implementation owner repairs the unrelated baseline |

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
