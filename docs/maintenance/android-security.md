# Android security maintenance

The independent `security_maintenance` job in Scheduled Dev Quality runs daily on `dev`, including when full quality skips and when there are no new commits. It resolves real debug/release runtime, buildscript and protobuf tool configurations, queries OSV, generates a graph using Gradle's official dependency-submission action and submits it with a retained GitHub API receipt, and reads the primary sources below. Setup/submission/source failures remain report failures or gaps, with evidence uploaded even on failure. Existing security artifact intake and durable owner notifications own delivery; this adds no daemon, second GitHub polling loop or model schedule.

| Asset | Version evidence | Automated source and limit | Responsibility |
| --- | --- | --- | --- |
| Runtime/build Maven dependencies | Selected components and dependency edges in real Gradle configurations | OSV Maven; GitHub submitted dependency graph; Dependabot version updates already configured | Project; transitive alerts may need direct-parent remediation |
| Gradle | Running distribution version; committed Wrapper checksum contract | Publisher repository advisories; official action validates Wrapper JARs; original official review stays independent | Project |
| JDK and trust store | Actual Gradle JVM vendor/version/home, selected trust-store digest, subjects and certificate fingerprints | Homebrew, Temurin or qualified Linux x64 Azul release metadata; Oracle/OpenJDK compromised-root control, parsed as data without executing downloaded code | Build-environment owner; other distributors and complete CVE applicability remain explicit gaps |
| SDK and tools | Selected compileSdk/Build Tools plus installed platform, platform-tools and command-line-tools source.properties | Google's SDK repository XML, parsed using the existing Capacitor CLI XML parser; release changes are assessment notices | Build-environment owner |
| SQLCipher and embedded libraries | Actual resolved AAR hash; each native library's hash and embedded SQLCipher/SQLite/LibTomCrypt identifiers | SQLCipher vendor release API; SQLite release history; LibTomCrypt release API | Project/vendor; binary identifiers do not establish fork backports or prove JNI behaviour |
| Android OS and WebView | Fixed-device read-only observation, independently timestamped | AOSP bulletin index and Chromium Dash stable Webview metadata | OEM owns OS updates; device administrator owns WebView updates; project owns compatibility and disclosure |

`vendor-notices` and `component-notices` qualify only their declared source, with a 26-hour TTL. A newer release is an informational impact-assessment request, not a vulnerability verdict. Unreadable, empty, malformed or unrecognised sources fail visibly. A fixed-device observation expires after eight days; hosted runners cannot attest a connected device. Original `official-review` obligations remain independent, including vendor-fork security assessment and broader toolchain qualification. Whole coverage must not be called clean merely because automated source results have zero matches.

## Local entry points

- `node scripts/android/macos-a5-dev.mjs dependency-security`: collect actual Mac build inputs and source results without installing or modifying device data.
- `node scripts/android/macos-a5-dev.mjs dependency-graph`: additionally generate a snapshot with the pinned official Gradle graph plugin, including Gradle itself and runtime/development scopes. This does not submit it or prove GitHub ingestion.
- `node scripts/android/macos-a5-dev.mjs security-device`: read only the fixed device's OS patch and WebView provider through the existing lifecycle lease; record `.lab/internal/security-maintenance/android-device.json`.
- `node scripts/security/security-maintenance.mjs OUTPUT --android-report REPORT`: assemble the existing coverage schema, retaining all other platform obligations.
- Use the existing `security-owner-cli.mjs` import/status commands and [security owner documentation](security-owner.md) for durable intake, assessment and delivery evidence.

Only a dated, candidate-matched API receipt with `result: SUCCESS` qualifies dependency submission. An Action step's success or an API acceptance that says it is superseded does not qualify. The small submission adapter fills this observed acknowledgement gap in the mature action; it does not scan dependencies. Retain the response and verify the current scheduled workflow and repository graph. No workflow, graph submission or version check authorizes merging PRs, dismissing alerts, changing repository security settings, publishing, broad upgrades or device resets.

The device used for compatibility testing may be out of security support. Supporting old readers is a functional compatibility promise, not a guarantee of security patches or an instruction to install new OS/WebView packages automatically.

## Hosted Java trust store

The Android host and scheduled security jobs use the existing `setup-java@v4` action with Zulu `21.0.13+1` and `check-latest`. The action's build-aware selector maps the vendor's `jdk_version: [21, 0, 13, 1]` to the tested Zulu 21.54.109 runtime, Java `21.0.13.0.3+1-LTS`. A generic `21` or `21.0.13` request can select an earlier build; the observed Temurin 21.0.12.1 and inspected Temurin 21.0.13+9 still contained roots identified by the [official compromised-root checker](https://ops.java/emudhra/).

The Linux x64 Zulu archive was matched against the SHA-256 returned by the [official metadata API](https://docs.azul.com/core/install/metadata-api). Its actual trust store contained none of the checker's four roots. Hosted acceptance must still inspect the actual Gradle JVM and selected trust store: a version selector or a successful setup step alone does not prove which runtime Gradle used. Other Azul host variants remain unsupported until independently qualified. This CI choice does not install or change a developer or device runtime.
