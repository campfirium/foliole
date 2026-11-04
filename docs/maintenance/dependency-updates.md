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

These entries hand validation and closure to the next centralized check task;
they are not upstream compatibility deferrals and do not start QA themselves.
Use repository `campfirium/foliole`, base `dev`, unless a row explicitly says
otherwise. Record the verified author/head, implementation commit, local
evidence and required QA coverage. Candidate containment alone is not a pass.

| PR and reviewed proposal | Local implementation and evidence | Required QA and closure owner |
| --- | --- | --- |
| [#199](https://github.com/campfirium/foliole/pull/199); `app/renovate`; head `c8696b8b0846698325451f977da23bf3dda396e3`; lucide-react 1.61.0 → 1.62.0 | `eb4f2558f`; 2026-11-04: `npm run test:files -- src/shared/ui/LucideIconCatalog.test.ts src/features/nodes/components/NodeTreeRowIconGraphic.test.tsx src/features/settings/components/sections/SettingsRailIconPicker.test.tsx src/companion/CompanionSelectionAnnotationToolbar.test.tsx` passed (20 tests); `npm run build` passed; `npm ls lucide-react react --depth=0` confirmed compatible peers. | Next centralized check task: hosted dependency hardening and risk-matched desktop/shared/companion coverage, then remote dev containment and PR closure; no QA run started by this handoff. |

| [#200](https://github.com/campfirium/foliole/pull/200); `app/renovate`; head `ef50d39e37ec51ab967254b12ce1857f7ae95689`; Electron 45.2.1 → 45.2.2 | `390a759ac`; 2026-11-04: native rebuild/health passed (SQLite ABI, security bookmarks and DNS-SD lifecycle); six focused files passed (29 tests), covering preload, SQLite lifecycle, import/reimport, installer cleanup, toolchain compatibility and minimatch limits; ordinary-Node toolchain tests and scoped lint passed; `quality:fast` passed (including 28 related tests); desktop build and both hidden-native presentation/main-path smoke specs passed. Logs: `.tmp/waits/t712-final-local.log`, `.tmp/waits/t712-asar-regression-green.log`, `.tmp/waits/t712-electron-runtime.log`, `.tmp/waits/t712-fast-and-desktop.log`. | Next centralized check task: hosted dependency hardening and desktop quality covering runtime/native compatibility, SQLite/preload and packaging contracts, then remote dev containment and PR closure. No QA run or manual dev push started here; Mac evidence does not prove other native hosts. |

The #200 local blocker recorded in `a6257b5f6` is resolved. Electron virtualizes
ASAR archives as directories; universal packaging needs raw files, as on Node.
The existing merge test now scopes `process.noAsar` to that operation and restores
it in `finally`, retaining both architecture and payload assertions. New physical
file assertions failed before the fix and passed afterward; logs are
`.tmp/waits/t712-asar-regression-red.log` and the green log above. The same old
failure was reproduced with 45.2.1, so it was not a runtime-upgrade regression.
See [Electron's documented raw archive semantics](https://www.electronjs.org/docs/latest/tutorial/asar-archives#treating-an-asar-archive-as-a-normal-file).

Electron 45.2.2 matches the [official latest stable release](https://releases.electronjs.org/release/v45.2.2).
Its npm publication was 2026-11-03T21:43:24.912Z; the Electron maturity exception
applies. Official notes list Wayland hidden-parent and CSS-removal fixes plus
Chromium/Node updates, without a disclosed security advisory: follow the normal
Foliole release schedule; no major-version follow-up is required.

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
| [#201](https://github.com/campfirium/foliole/pull/201); `app/renovate`; head `79374fade5d55c3932768518b55f09a61b3f3130` | minimatch 11.0.2 replaces only the glob 7.2.3 compatibility override (3.1.5), not the modern 11.0.3 override. An isolated real glob 7.2.3 graph with the proposed matcher returns no match for `literal\\[1\\].txt`; the current graph correctly returns `literal[1].txt`, violating the existing installer cleanup regression contract. PR remains open under this batch's restriction against closing unvalidated proposals. | On the next dependency batch, including related installer/temp/rimraf/glob updates, verify upstream compatibility and rerun `npm run test:files -- scripts/windows/installer-temporary-files.test.mjs scripts/security/security-toolchain-compatibility.test.mjs` against the reviewed candidate; adopt only when escaped-name matching and cleanup pass. | 2026-11-04 | Dependency batch handler |

The 2026-11-04 batch also rechecked the earlier deferrals: React-PDF latest
11.0.0 still pins PDF.js 6.3.289; typescript-eslint latest 8.72.1 still requires
TypeScript below 6.1. The legacy matcher regression persists with the newer
11.0.2 proposal, so #192's compatibility resume condition is not met. These
checks do not claim that any existing security advisory has been repaired.

See [Renovate closed-PR matching](https://docs.renovatebot.com/key-concepts/pull-requests/)
and [version title configuration](https://docs.renovatebot.com/configuration-options/#commitmessageextra).

References: [Renovate installation](https://docs.renovatebot.com/getting-started/installing-onboarding/),
[PR hourly limit](https://docs.renovatebot.com/configuration-options/#prhourlylimit),
[PR concurrency](https://docs.renovatebot.com/configuration-options/#prconcurrentlimit),
[branch concurrency inheritance](https://docs.renovatebot.com/configuration-options/#branchconcurrentlimit),
[free hosting](https://docs.renovatebot.com/mend-hosted/overview/),
[Ionic reference configuration](https://github.com/ionic-team/ionic-react-conference-app/blob/main/renovate.json),
[Swift manager](https://docs.renovatebot.com/modules/manager/swift/).
