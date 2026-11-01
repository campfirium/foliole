# Swift dependency security evidence

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
