# Android resolved dependency security report

Run the registered Mac action from the checkout:

```sh
node scripts/android/macos-a5-dev.mjs dependency-security
```

This action reads the current Android project through its Gradle Wrapper, resolves selected dependency graphs and queries the public OSV Maven advisory API. It does not build an APK, install or start an application, acquire a device lease, start ADB, update dependencies, or change the global toolchain. It rejects formal acceptance mode. Existing Android project prerequisites must already be prepared; missing prerequisites produce an error rather than an implicit rebuild or fallback.

## Evidence

The command prints a report path under `.tmp/artifacts/security-maintenance/android/<run-id>/`:

- `inventory.json`: Gradle resolution results, selected versions, dependency edges, unresolved selectors, toolchain versions and uninspected configurations.
- `gradle.log`: extraction output.
- `report.json`: candidate/worktree identity, inventory integrity hash, query time, per-package source results, findings, errors and coverage gaps.

The source is explicitly a working-tree observation. Its HEAD and dirty flag do not attest a frozen release candidate. The inventory hash identifies the exact observed file; it is not a stable notification deduplication key.

## Checked scope

The report resolves the app's `debugRuntimeClasspath` and `releaseRuntimeClasspath` independently. It includes selected transitive Maven versions, each project's buildscript classpath, and resolvable protobuf tool configurations. A conflict-selected version is queried rather than its originally requested version. Packages with identical coordinates and versions share one query while retaining every contributing scope.

Coordinates come from Gradle's `ModuleComponentIdentifier`. Local files and unsupported or unidentified versions do not receive invented Maven identities. The API receives package coordinates and versions, not application data or source files. Pagination is followed separately for unfinished queries; HTTP failures, malformed data, missing results and repeated tokens produce errors while retaining findings already received.

`status` is scoped to resolved Maven dependencies and this advisory source:

| Status | Meaning |
| --- | --- |
| `clean` | Successfully checked packages had no matches in this source |
| `findings` | At least one package/version matched an advisory |
| `error` | Required resolution or advisory checks failed |
| `unsupported` | At least one coordinate could not be checked |

The command exits nonzero for findings, errors or unsupported inputs. A successful exit is not whole-platform security acceptance: `coverage` remains `partial` and `overallStatus` remains `incomplete` until the separate maintenance routes establish their evidence.

## Remaining responsibilities

Gradle distribution advisories require Gradle's official security announcements; an empty Maven lookup does not establish Gradle safety. JDK distributor patches and trust stores, Android SDK/Build Tools advisories, local or embedded native components such as SQLite/crypto libraries, and uninspected configurations are explicitly listed as gaps. Maven coordinates alone do not identify all code inside native binaries or project dependencies. Swift, OS/WebView, npm and GitHub Actions need their separate routes.

An advisory match establishes a version match, not a reachable exploit in the build or the shipped application. Review runtime versus build-time scopes, official conditions and remediation compatibility before changing dependency constraints. Do not silently force transitive build-tool versions or automatically dismiss findings after a build passes.

References: [Gradle resolution API](https://docs.gradle.org/current/javadoc/org/gradle/api/artifacts/result/ResolutionResult.html), [OSV batch API and pagination](https://google.github.io/osv.dev/post-v1-querybatch/).

## Build dependency remediation

`android/buildscript-security.gradle` supplies documented minimum-version constraints to root and plugin buildscript classpaths. It uses ordinary Gradle constraints: unused modules are not added and newer upstream versions are allowed. Netty and Bouncy Castle modules share a family baseline. AGP is aligned on the verified 9.4 patch line with Gradle 9.8; the Kotlin build plugin is upgraded for its build-cache deserialization advisory, while language/API settings preserve the existing source level.

`android/kotlin-runtime.gradle` limits the existing Kotlin standard-library compatibility rule to application compile/runtime classpaths. Compiler tooling resolves its own libraries; applying the old application stdlib version to compiler configurations can break the patched compiler. The application runtime dependency graph must remain unchanged for this build-only remediation.

Review these constraints when upgrading upstream build plugins. Remove a constraint only after an unconstrained resolved graph selects a fixed version, the live advisory check succeeds and debug/test APK plus release bundle builds pass. A successful build alone does not resolve a security finding; retain both before/after version evidence and current advisory results. Constraints do not remediate JDK, SDK or embedded native-library gaps.
