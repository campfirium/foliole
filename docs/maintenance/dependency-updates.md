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
The retired dashboard Issue #185 is not a user support request.

## Local adoption

The Foliole Desktop monitor leaves verified bot proposals in GitHub for the next
centralized check (`deferDependencyPrs: true` in its personal PR declaration).
Independent PRs retain their review route. The separate Dependabot alert monitor
only pages for high or critical runtime alerts (`urgentRuntimeOnly: true`). Confirm
affected shipped versions and urgency before handling an alert ahead of check.
Review [durable security maintenance](security-owner.md#centralized-check-ownership)
in the same pre-freeze batch, including findings and failed or unknown coverage.

At the start of a new centralized check, before freezing the candidate, list
all open PRs with `gh pr list --repo campfirium/foliole --state open --limit 1000
--json number,title,author,baseRefName,headRefOid,isDraft,url`. Use that inventory
as the batch boundary. Review non-draft proposals targeting `dev` from exactly
`app/dependabot` or `app/renovate` using the dependency review workflow. List
other PRs separately for independent review. Recheck existing deferrals, reuse
recorded implementations where the current proposal is covered, and defer
blocked groups with a reason and next action. Report inventory failures as
unknown and continue the authorized QA scope. Later arrivals go to the next
check. An explicitly requested standalone dependency batch uses the same
inventory and local workflow.

For centralized check preparation or an authorized standalone batch, one agent reviews
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
below. The centralized check owner then freezes its candidate. A standalone
batch finishes here. Do not start a check workspace, remote run
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
After the actual dev combination passes integration validation, the active QA
owner pushes the validated dev tip and verifies remote containment before PR
closure. Scheduled Dev Quality follows its own schedule. Do not use PR count
to determine install, test, commit or task count.

## Pending centralized QA

### November 12 iOS dependency batch

[#237](https://github.com/campfirium/foliole/pull/237) targets
`campfirium/foliole:dev`, verified `app/renovate` head
`9eb4eb7a5d041375562e454e7b478adedbaf1ec2`. Adoption commit `07fa653f2`
updates SwiftProtobuf to 1.40.0. Both graphs resolved the official tag, 100
Swift host tests passed, and the unsigned iOS simulator build succeeded.
Run iOS host and dependency hardening coverage in the next centralized QA.

### November 12 UI dependency batch

The proposals target `campfirium/foliole:dev`. Adoption commit `18e991ba7`
passed 16 icon and virtual-list tests, the desktop and companion web builds,
and the production npm audit. Run desktop/shared coverage and dependency
hardening in the next centralized QA.

| Proposal | Verified author / reviewed head | Local target |
| --- | --- | --- |
| [#235](https://github.com/campfirium/foliole/pull/235) | `app/renovate` / `84ef2a9998e73f890ef6469da988601e32216ce9` | TanStack React Virtual 3.14.26 and Virtual Core 3.19.11 |
| [#236](https://github.com/campfirium/foliole/pull/236) | `app/renovate` / `82eb5acf7f17782045f40e7e6d474e11cf6f578c` | Lucide React 1.68.0 |

### November 12 Android dependency batch

The proposals target `campfirium/foliole:dev`. Adoption commit `737910d5c`
passed the Android debug APK and instrumentation APK builds and JVM tests.
Both debug dependency graphs resolve AndroidX SQLite 2.7.1. The local build
had no Firebase configuration, so the actual push flow remains unverified.
Run Android host checks and dependency hardening in the next centralized QA.

| Proposal | Verified author / reviewed head | Local target |
| --- | --- | --- |
| [#233](https://github.com/campfirium/foliole/pull/233) | `app/renovate` / `349da626bb8bed03c3e7a6a741b1cb605a03092b` | AndroidX SQLite 2.7.1 in both compile and runtime graphs |
| [#238](https://github.com/campfirium/foliole/pull/238) | `app/renovate` / `687838fa13ca1ee0bc11bac4db191044fe237aa8` | Google Services Gradle plugin 4.6.0 |

### November 12 Node.js security assessment

Foliole 0.8.1 ships Electron 45.2.3 with Node.js 24.22.2. Electron 45.3.0
still embeds 24.22.2. Desktop LAN sync serves cleartext HTTP/1, and the
WebDAV HTTPS client uses default certificate trust. The reviewed sync paths
do not use Node HTTP/2 or TLS server hooks, or switch CA policies on a
shared HTTPS agent. This does not clear the bundled parser and other Node
components included in the upstream security release.

Recheck the official Electron stable notes in the next dependency batch.
Adopt the stable build that includes Node 24.22.3 or the equivalent
backports. The standalone Node 26.13.1 patch applies separately to the
development and CI toolchain.

[Node security release](https://github.com/nodejs/node/releases/tag/v24.22.3)
and [Electron runtime table](https://releases.electronjs.org/release?channel=stable).

The separately authorized [Gradle security patch](gradle-security-update.md) is
outside the already frozen November 11 full-QA candidate.

### Completed November 10 npm batch

The November 10 npm batch was implemented in `c6525a361`. Local validation passed
65 tests covering HTML paste, Mermaid rendering, review scheduling and Windows
installer matching. Desktop and companion web builds passed. The production npm
audit reported zero vulnerabilities.

[Full QA 42924886618](https://github.com/campfirium/foliole/actions/runs/42924886618)
passed for `5004b5eea`, including dependency hardening. The integrated dev
commit `14727bd25` passed 149 local tests and was verified on origin/dev.
The QA workspace was released and all nine reviewed proposals below were
verified closed.

| Proposal | Verified author / reviewed head | Local target |
| --- | --- | --- |
| [#220](https://github.com/campfirium/foliole/pull/220) | `app/renovate` / `cd839d7dc0c42ba14e8ad359735b2f02156f9976` | parse5 8.1.0 |
| [#221](https://github.com/campfirium/foliole/pull/221) | `app/renovate` / `b853e76511d1647fc32c966477d15fde673f1eff` | minimatch 11.0.4 |
| [#223](https://github.com/campfirium/foliole/pull/223) | `app/renovate` / `8a864cf32ad6b17e4d622f9bc2d7a5431e55284e` | @emnapi/core 2.0.0-beta.3 in the existing WASM runtime override |
| [#224](https://github.com/campfirium/foliole/pull/224) | `app/renovate` / `5bf7f48ce3bccbe79395b074d650f129f9ceb323` | @emnapi/runtime 2.0.0-beta.3 in the existing WASM runtime override |
| [#225](https://github.com/campfirium/foliole/pull/225) | `app/renovate` / `1ad7e695ed5231d303cb2e7826c2785948a9da6c` | @vitejs/plugin-react 6.2.1 |
| [#230](https://github.com/campfirium/foliole/pull/230) | `app/renovate` / `66d50d104efc0110de47e4d7e65b82ad696421c3` | Tailwind CSS and its Vite plugin 4.3.4 |
| [#231](https://github.com/campfirium/foliole/pull/231) | `app/renovate` / `47708b878a8e94528287bc8400a98a4460a823f9` | lucide-react 1.67.0 |
| [#232](https://github.com/campfirium/foliole/pull/232) | `app/renovate` / `24db1fca5f71487fda3ba81c9d31f12d6499ec6f` | Vitest 5.1.0 |
| [#234](https://github.com/campfirium/foliole/pull/234) | `app/renovate` / `05de307ebca650615c1902240fff8ce0ec0ca499` | Mermaid 12.3.0 |

The proposals target `campfirium/foliole:dev`. The paired WASM overrides retain
the required FSRS binding that the proposed lockfiles removed.

### Completed November 9 npm batch

The local npm batch was committed as `0f0d4f6d3` on `dev`. npm resolved all
four updated packages under the seven-day policy. The production audit found
zero vulnerabilities, and nine Mac desktop scenarios passed, including the
large-folder virtual list.

[Centralized full QA 42494591393, attempt 2](https://github.com/campfirium/foliole/actions/runs/42494591393/attempts/2)
passed for `e94c172d6cfbfd7628bb6aa3e652db70471fb558`, including dependency
hardening. The first attempt on that candidate hit the Ubuntu lint memory cap.
The failed-job rerun passed on the same commit. The actual dev combination
passed 134 affected tests and was delivered as `086d53f83`. The registered QA
workspace was released, and the three unchanged reviewed proposals were
verified closed.

| Closed PR | Verified author / reviewed head | Adopted version |
| --- | --- | --- |
| [#216](https://github.com/campfirium/foliole/pull/216) | `app/renovate` / `5b5d2baabcd6f18776ccb5d105cf1a780a170ec6` | knip 6.44.1 |
| [#218](https://github.com/campfirium/foliole/pull/218) | `app/renovate` / `de21a9a3d0fa6ac73bf4d9bbf834d37800c185e0` | react-virtual 3.14.25 and virtual-core 3.19.10 |
| [#219](https://github.com/campfirium/foliole/pull/219) | `app/renovate` / `de513dec72a0931784f3e2d49e2d9eb7086ce08c` | globals 17.14.0 |

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
Full [centralized QA 42322090713](https://github.com/campfirium/foliole/actions/runs/42322090713)
passed for `bb98335b080fc5679bb8b9fe8e8729f5e673005c`, including hosted dependency
hardening, Windows/Linux checks, Android host and iOS simulator coverage. Initial
Mac preflight lacked `JAVA_HOME`; supplying the existing JDK21 resolved it without
source changes or a preflight bypass. Integration checks passed on dev
`a6cad9595a40d2cfc00a96d9a2c5da4baf227b7d`, remote dev contains the candidate,
and the registered QA workspace is released. Published 0.8.0 artifacts are unchanged.

The same full candidate contains `4c344a3e2` (knip 6.44.0), `d66bddbe6`
and `b7fe04438` (FSRS6 integration). PR #208 was rechecked at unchanged head
`72bb53e3c0370b218ab51d90cac10ebb636e2d49` and [closed after validation and delivery](https://github.com/campfirium/foliole/pull/208#issuecomment-6700712587).
PR #202 is confirmed closed at unchanged head
`cef38822a5969ddfe5eb0dc7ee3f172a464c12bf`; its implemented dependency/runtime
changes are covered by this full QA and remote containment. Existing physical
Windows provisioning trials remain independent and are not claimed passed here.

### Completed November 8 dependency batch

[Centralized full QA 42386297275](https://github.com/campfirium/foliole/actions/runs/42386297275)
passed for `125c63e317950504828d098cdb43a448dc10cbb3`, including dependency
hardening and Android host quality. The repair registered the companion priority
sync integration test for the controlled Electron SQLite runner. The actual
dev combination passed nine affected tests and integrated as `f58358211`.
The registered QA workspace was released. Remote dev `556f4f848` contains the
implementations and repair, and all five proposals below were verified closed.

| Closed PR | Verified author / reviewed head | Adoption | Local evidence | Hosted coverage |
| --- | --- | --- | --- | --- |
| [#210](https://github.com/campfirium/foliole/pull/210#issuecomment-6713895671) | `app/renovate` / `bd1bb58b10dfec49b3d0c4ee79c7d3995c6638ad` | lucide-react 1.66.0, `97eff8c57` | Icon catalog, desktop and companion builds | Full and dependency hardening |
| [#211](https://github.com/campfirium/foliole/pull/211#issuecomment-6713895658) | `app/renovate` / `4bf66e46dd8966661f58bb0513f8adea19941305` | ESLint 10.14.0, `97eff8c57` | Lint routing tests, quality:fast, minimatch 11.0.3 / brace-expansion 5.0.12 resolved | Full and dependency hardening |
| [#212](https://github.com/campfirium/foliole/pull/212#issuecomment-6713895690) | `app/renovate` / `28389f7d04d2cdc200351b6e54d73276408fc747` | @lezer/common 1.5.5, `97eff8c57` | Markdown parser and projection tests, desktop and companion builds | Full and dependency hardening |
| [#189](https://github.com/campfirium/foliole/pull/189#issuecomment-6713895689) | `app/renovate` / `b99428c73ce733d8400434be01444fbaf21b791e` | AGP 9.5.1, `48036cc2e` | JDK 21 debug APK build with Gradle 9.9.0 | Android host within full, dependency hardening |
| [#213](https://github.com/campfirium/foliole/pull/213#issuecomment-6713895649) | `app/renovate` / `370c222aa0ba4950bb91d2d2a1324babc1b81ab6` | Gradle 9.9.0, `48036cc2e` | Official distribution and regenerated Wrapper JAR checksums, tampered-download rejection, debug APK build | Android host within full, dependency hardening and Wrapper validation |

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
version discovery. Centralized check preparation and explicitly requested batches trigger review;
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
| [#222](https://github.com/campfirium/foliole/pull/222) | pdfjs-dist 6.5.438; React-PDF 11.0.0 still pins 6.3.289, so the proposal installs two incompatible PDF.js versions. | At the next dependency review, check the latest React-PDF dependency and verify the matching viewer and worker together. | 2026-11-12 | Dependency batch handler |
| [#226](https://github.com/campfirium/foliole/pull/226) | OkHttp 5.5.1; the published Android AAR requires compile SDK 37, while Foliole and the Mac build environment use 36. | At the next dependency review, check SDK 37 availability and a working Android build lane, then validate OkHttp and the WebDAV client. | 2026-11-12 | Dependency batch handler |
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
