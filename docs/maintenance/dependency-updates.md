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

- No additional proposal schedule is imposed. The standard Renovate defaults
  apply: up to ten concurrent PRs and two new PRs per hour. These throttle CI
  bursts; they are not targets for how few updates the maintainer should see.
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
behavior. Commit the locally validated candidate before active remote QA.
Dependency validation and its repairs/rechecks use the registered workspace on
`check`: workspace operations use `quality:qa:workspace` from the development
checkout, while `quality:remote` runs from the clean QA checkout. The QA owner
handles preflight, hosted checks, bounded repairs, verified integration and
workspace release. Scheduled dev checks, their repairs and rechecks retain dev;
release checks and subsequent handling retain the release lane. A failure or a
larger repair does not automatically transfer ownership or change lanes.

Follow affected host rules without turning ordinary updates into full release
acceptance. A blocked group does not hold unrelated eligible updates. Before
closing a covered proposal, verify required checks for the exact QA candidate,
its integration into dev and remote dev containment, including any QA repairs.
Do not use PR count to determine install, test, commit or task count.

References: [Renovate installation](https://docs.renovatebot.com/getting-started/installing-onboarding/),
[free hosting](https://docs.renovatebot.com/mend-hosted/overview/),
[Ionic reference configuration](https://github.com/ionic-team/ionic-react-conference-app/blob/main/renovate.json),
[Swift manager](https://docs.renovatebot.com/modules/manager/swift/).
