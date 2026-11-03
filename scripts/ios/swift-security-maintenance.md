# Swift dependency security evidence

## Fixed advisory and vendor refresh

```sh
node scripts/ios/ios-security-controls.mjs .tmp/artifacts/ios-security/controls
node scripts/ios/ios-security-maintenance.mjs .tmp/artifacts/ios-security/current
# Actual Mac graph, binary components, tools/SDK and read-only explicitly selected iPhone OS:
node scripts/ios/ios-security-maintenance.mjs .tmp/artifacts/ios-security/mac --resolve --device <explicit-device-udid>
# Merge into an existing complete maintenance report without changing the owner schema:
node scripts/ios/ios-security-maintenance.mjs .tmp/artifacts/ios-security/merged --base-coverage PATH_TO_COVERAGE_JSON
```

The entry downloads Trivy 0.76.1 into a repository-local rebuildable tools cache, validates
the official release SHA-256 before extraction, and checks every pin from both locks against
the scanner inventory. `FOLIOLE_TRIVY_BIN` may select an already-qualified binary. The DB is
refreshed by Trivy and its actual `UpdatedAt` must be within 26 hours. Swift advisories come
from GHSA; zero results do not cover vendor-only announcements or embedded components.
Positive controls use isolated Package.resolved metadata for Capacitor 8.5.0/8.5.1 and
GHSA-rvm3-566m-v7fv. They never execute vulnerable code or change the app's dependencies.

Official APIs retain releases and public advisories for the four pinned remote packages,
their implementation repositories, and protoc's vendored Protobuf/Abseil. Versions come
from both locks, evaluated manifests, pinned `Sources/protobuf/VERSIONS.json`, actual
framework headers/core and npm plugin manifests. UTF8-range shares the vendored Protobuf
revision; Abseil's bundled cctz shares its recorded revision. SDK/system libraries belong
to the selected Xcode/SDK and OS, not a guessed separate package version. Cordova's binary
is pinned by Capacitor's URL/checksum; plist `1.0` is not an Apache Cordova version.
Protobuf's release tag and its C++ library version are distinct: the fixed entry reads
`GOOGLE_PROTOBUF_VERSION` from the pinned vendored header (v35.1 currently embeds C++
7.35.1). Public advisories are filtered by ecosystem/package identity before range matching;
PHP/Python/Java bindings do not become iOS C++ findings. Supported ranges are evaluated;
ambiguous multi-branch syntax or unknown identities stay explicit review items.

SQLCipher's implementation release API is positively checked against its 4.19 announcement
and both named fixes; the reviewed predicate covers 4.x below 4.19. SQLite's official CVE
table is checked against CVE-2026-11822/3.53.2 and parsed with explicit non-core exclusions.
Below-fix versions require exposure review, not automatic exploitability claims.
Apple Developer RSS was discovered from its official release page; the security release
metadata table is qualified against a known iOS security release and a real CVE/WebKit
advisory. Markup changes fail explicitly. New versions and advisory notices are review
items, distinct from confirmed affected-version findings. Mac, CI and device evidence
remain separate. WebKit and Common Crypto follow Apple OS security maintenance; no
independent version is invented. A successful read is source health, not universal safety.

Each `ios-security.json` retains raw source files, digests, response dates, source errors,
scanner/graph evidence and existing-schema checks. HTTP/parse/date/pagination failures are
errors. Release windows must reach the installed baseline when a full page is returned;
advisory pagination is never silently truncated. Empty advisory lists never attest safety.
Unknown applicability is an explicit informational review finding, so successful source
recovery cannot silently report overall clean. Fresh complete source evaluation can retire
old findings after a version upgrade; source failure preserves the previous facts.

`mergeIosSecurityCoverage` consumes a complete existing coverage report and combines
same-asset provenance without replacing other-platform findings or refreshing expired
evidence. Its result uses the existing durable owner and notification transport. The shared
adapter records the pre-iOS layer inside its report evidence: retrying that report replaces
the prior iOS attempt, so a recovered source can recover without duplicating findings.
The retained other-platform layer keeps its original timestamp and qualification.
Reports created before this retry provenance was introduced should use a freshly collected
base report; they are rebuildable evidence, not a second durable state owner. The shared
scheduled job must invoke this adapter before artifact upload; no separate scheduler,
daemon, model timer or GitHub poller is supplied here. Until that shared call has actually
run, local execution does not establish automatic daily coverage or CI qualification.

Behavior verification includes source failure/malformed data, stale evidence, discovery,
deduplication, child-process restart, recovery and recurrence against the production owner
and existing inbox, with an isolated publisher/transport boundary. Live source/scanner
qualification is separately recorded in the task evidence; queued inbox events are not
claimed as desktop delivery without a corresponding transport receipt.

## Dependency graph extraction

Run from the repository root. This entry collects evidence without changing dependency versions,
installing an app, upgrading Xcode, or querying a vulnerability database.

```sh
npm run test:files -- scripts/ios/swift-security-evidence.test.mjs
node scripts/ios/swift-security-inventory.mjs .tmp/artifacts/swift-security/locks
# macOS with the installed Xcode and existing npm plugins:
node scripts/ios/swift-security-inventory.mjs .tmp/artifacts/swift-security/mac --resolve
```

`inventory.json` records the candidate, dirty state, input hashes, timestamps, host tools,
two separately qualified graphs and collection errors. Exit 0 means extraction succeeded;
it never means security is clean. `overallStatus` remains `incomplete`. Use a fresh output
directory per candidate. Do not promote logs left over from a failed collection.

The default route needs neither Swift nor Xcode and labels both `Package.resolved` files as
lock evidence. It cannot establish local/generated/plugin edges or live iOS resolution.
The macOS route uses Xcode's pinned App resolution and SwiftPM's pinned host dependency tree.
It compares versions, URLs and revisions against each lock; recursively evaluates local and
resolved manifests; checks remote edges against the relevant lock; and preserves binary target
URLs/checksums. Xcode resolution state is an environment artifact, not a public lock format.
Unrecognized formats, missing locks and unsupported dependency types produce errors.

The App roots are `CapApp-SPM` and `FramedSyncRuntimePackage`, referenced by the Xcode project.
The host root is `ios/App/Package.swift`. Inspect project references when changing these roots.
Generated Capacitor manifests derive from npm inputs; fix their owner rather than editing
`node_modules` or the generated manifest. Lock-only results cannot replace Mac evidence.

For every remote package in **both** graphs, record a dated review of the maintainer's public
security advisories **and** releases/changelog. Include the upstream implementation repository
when the Swift repository only distributes binaries. Empty advisory lists do not attest safety.
Record affected/patched ranges, installed versions, application exposure, source failures,
unknown component versions and an actionable disposition. Attach exact package revisions and
input hashes. Refresh official review within 8 days, and re-extract after candidate, manifest,
lock or toolchain changes; pre-release review must use the actual candidate/build environment.
Automatic Swift vulnerability lookup is unsupported by this entry. Do not assert universal
OSV or `Package.resolved` scanner coverage. This command does not schedule, deliver, or aggregate
maintenance results; those belong to the existing maintenance owner.

Binary distribution pins establish wrapper versions and checksums, not all embedded component
versions. Check framework metadata/headers and vendor release notes separately. Apple-managed
Common Crypto and OS/WebKit require OS/vendor evidence; they are not app dependency upgrades.
SQLCipher upgrades affect database behavior across hosts and require coordinated production-path
SQLite, encryption/reopen, import/export and sync compatibility verification before adoption.
