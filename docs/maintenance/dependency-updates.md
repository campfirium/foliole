# Dependency updates

## Current handover phase

The repository prepares the free Mend-hosted Renovate app through
`.github/renovate.json`. Every ordinary update initially requires approval in the
Dependency maintenance dashboard. Do not approve proposals during qualification.
Dependabot remains the active version updater until a successful hosted Renovate
job proves access to this repository and the expected dependency candidates.
Installing the app alone does not prove extraction or successful operation.

After qualification, make one change on `dev` that sets each Dependabot ordinary
version-update limit to zero and releases Renovate's routine minor/patch updates
from dashboard approval. Keep approval for major updates, Electron, better-sqlite3
and the Capacitor SQLite plugin, including a group containing that plugin.
Check existing proposals for the same package/version before releasing a group.
Existing PRs are not closed by this handover. To roll back, restore the previous
Dependabot limits and require approval for all Renovate ordinary updates again.

Keep GitHub's dependency graph, Dependabot alerts and security updates enabled.
Renovate vulnerability fix PRs are disabled to avoid a second security-fix owner.
Native inventories, Trivy and vendor checks keep their existing responsibilities.

## Update policy

- Renovate opens at most two concurrent ordinary PRs, with one new PR per hour.
  Existing proposals and GitHub security updates are outside this limit.
- Ordinary updates wait seven days and use Monday 09:00–12:00 Asia/Shanghai.
  Electron retains its existing latest-stable review policy without this delay.
- No update is automatically merged. Major and database/runtime changes require
  explicit review; a PR is an untrusted proposal, not permission to execute it.
- Capacitor packages share a group; plugins must satisfy peer compatibility, and
  do not all need identical version numbers. CodeMirror/Lezer share an editor
  group. Both hand-owned SwiftProtobuf declarations share a native runtime group.
- npm updates belong to the root manifest. Gradle and Wrapper updates belong to
  `android/`. Swift updates belong to the two hand-owned package manifests.
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
Renovate proposals retain the existing general PR review path; the Dependabot
author exception is not extended to a new bot automatically.

References: [Renovate installation](https://docs.renovatebot.com/getting-started/installing-onboarding/),
[free hosting](https://docs.renovatebot.com/mend-hosted/overview/),
[Ionic reference configuration](https://github.com/ionic-team/ionic-react-conference-app/blob/main/renovate.json),
[Swift manager](https://docs.renovatebot.com/modules/manager/swift/).
