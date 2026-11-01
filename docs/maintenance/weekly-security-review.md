# Weekly official-source security review

Run this review each Monday at 10:00 Asia/Shanghai in the saved local project.
The durable owner is `.lab/internal/security-maintenance/`; scheduling belongs to
the project automation, independently of an implementation chat. Keep the computer
on and the app running for local scheduled work. A configured schedule is separate
from execution evidence. The first review must actually read current primary sources.

Read `security-coverage.md`, `security-owner.md`, and the current owner status first.
Capture the current revision, working-tree mode and `securityInputIdentity`. Inventory
actual locks/resolved graphs and every workflow `uses` reference; do not maintain a
second fixed version list. Previous evidence can explain history but cannot qualify
another candidate or host. Re-run the same contract before release for its candidate
and actual build environment, without changing the active release.

Review all of the following; a failed source is an error, never an empty clean result:

| Asset | Primary sources and required comparison |
| --- | --- |
| Swift packages | Every remote in both current graphs: package owner releases and advisories, plus the upstream project when a distribution repository publishes none. Review local/npm plugin dependency edges. |
| Embedded libraries | Zetetic releases and provider matrix, SQLite CVEs/release notes, actual Android crypto fork and Apple OS provider; compare packaged components separately from wrappers. |
| Gradle | Gradle releases/security advisories and current Wrapper version/checksum. Do not infer distribution safety from Maven zero matches. |
| JDK | Each actual distributor's security updates and Oracle/OpenJDK eMudhra guidance; inspect actual selected trust stores independently per environment. |
| Node/npm | Node security releases, npm/cli releases and advisories; compare host Node and Electron's bundled Node separately. |
| Electron/Capacitor | Electron releases/upstream Chromium fixes, Chrome security releases, Capacitor main and Swift distribution advisories/releases. New release alone is not proof of a vulnerable application path. |
| Apple tools | Apple Developer release notes and Apple security releases; actual Xcode/Swift/SDK version. |
| Android tools | Android SDK/Build Tools release notes, official repository metadata and actual build selection; installed tools are not necessarily consumed. |
| Actions | Every distinct remote action owner/repository in parsed workflow references, its current referenced release, security advisories and newer security notes. Local reusable workflows remain in the source inventory. Preserve the deliberate Actions Dependabot exclusion. |
| Android OS/WebView | Android security bulletins, Chromium/WebView announcements and device/vendor patch evidence from the device batch. App rebuilds do not repair OS vulnerabilities. |
| Apple OS/WebKit | Apple security release notes and actual Mac/iPhone OS/WebKit evidence; separate unknown device state from known host facts. |

Check releases as well as advisory pages: an empty advisory page does not establish
complete coverage. Record source URL, date, installed/selected version, affected/fixed
predicate, applicability and limits. New high/critical information needs prompt
assessment. Version-only changes without a security predicate remain update candidates.
Query repository Alerts read-only when available; preserve a source-access error when
unavailable. Do not close or ignore alerts, change settings, merge PRs, publish, update
global tools, install devices, or adopt dependencies from this recurring review.

Write a JSON review under `.tmp/artifacts/<task>/` with `schemaVersion: 1`, `checkedAt`,
`candidate: { revision, inputDigest }`, a named `environment`, and `assets`. Include
exactly the asset IDs whose declaration has an `official-review` route. Each row has:

- `asset`, `status` (`clean`, `findings`, `unsupported`, or `error`) and a concrete `reason`;
- `versions` (named actual observations, explicitly marking unknowns), `sources` (primary HTTPS URLs);
- `packages` (the reviewed native packages or action repositories where applicable);
- `findings` (an array; empty when none is established).

Each finding carries `package`, `platform`, `advisory` (a stable official ID or dated
upstream-review identity), `versions`, `severity`, `source`, `affectedRange` when known,
and an `assessment` explaining the predicate and remaining uncertainty. An upstream
review candidate must not be relabeled a confirmed CVE. Unknown coverage remains
unsupported/error even after a successful source read. Clean requires known versions.

```sh
node scripts/security/security-maintenance.mjs OUTPUT --official-review REVIEW.json
node scripts/security/security-owner-cli.mjs import OUTPUT/coverage.json ENVELOPE.json package-lock.json
node scripts/security/security-owner-cli.mjs status
```

The local envelope uses `kind: local`, `repository: campfirium/foliole` and the actual
`headSha`. Collector performs both live npm audits and validates review freshness,
candidate/input and environment. Supply matching Android/Swift reports through the
existing options when available; otherwise leave resolution gaps visible. `incomplete`
and exit 1 are expected when any required scope is unsupported or has findings.
The review's URLs, actual versions and assessments persist in owner observations;
changed findings/errors and recovery use the existing notification queue. Do not
refresh old evidence dates or clear another environment's facts. Read `status` for
separate enqueue and delivery results. Keep a short dated narrative beside the review.

For testing the scheduled task, execute this contract manually once and retain the
actual source responses, report, import receipt and delivery evidence; then verify
the saved schedule's identity and next occurrence. This proves a manual first run,
not a future automatic invocation. Review the first scheduled output when it arrives.
