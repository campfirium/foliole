# Gradle security patch: November 11, 2026

## Scope and evidence

The user authorized updating `campfirium/foliole:dev` from Gradle 9.9.0 to
9.9.1 for GHSA-3cfg-jpcr-gfp3, GHSA-gqrr-4j89-5267 and GHSA-pcp8-98xm-c6pr.
This is a direct security fix, not adoption or closure of a dependency PR.
Implementation commit: `e877c9fb7` on local `dev`.
The changes affect the Android build toolchain, not the installed app runtime.

- [Version catalog code execution](https://github.com/gradle/gradle/security/advisories/GHSA-3cfg-jpcr-gfp3).
- [Project-controlled daemon registry](https://github.com/gradle/gradle/security/advisories/GHSA-gqrr-4j89-5267).
- [Stale daemon registry](https://github.com/gradle/gradle/security/advisories/GHSA-pcp8-98xm-c6pr).
- [Gradle 9.9.1 release](https://docs.gradle.org/9.9.1/release-notes.html).

The downloaded official all-distribution SHA-256 is
`f20c816177c0ff192881874852260771b462903aef3e794b0dac4759d1fda284`.
Wrapper assets were regenerated in an empty project using that verified
distribution. Both scripts and the JAR are byte-identical to the tracked assets;
the official Wrapper JAR SHA-256 is
`621008afc4f5d59357fcf06ffa644dd5aade5e091bdc363742710445f73cdaf8`.
Only the distribution URL/checksum and security version floor need changing.

## Local validation

The tightened security contract failed on 9.9.0 before the update. With 9.9.1,
all five Wrapper/native-source integrity tests passed, including rejecting altered
distribution bytes before runtime loading. Focused test lint passed.
The fixed Mac build entry completed companion Web build, Capacitor sync and
`assembleDebug` / `assembleDebugAndroidTest` with Gradle 9.9.1 and JDK 21.
No device installation or runtime acceptance was performed: this patch only
changes the build toolchain and creates no new device behavior to accept.
Logs: `.tmp/waits/T753-android-build.log` and
`.tmp/waits/T753-wrapper-regeneration.log`. This is not hosted QA acceptance.
`npm ls --depth=0` passed; `npm audit --omit=dev` found zero vulnerabilities.
The npm audit is not evidence of native or Gradle vulnerability coverage.

## QA handoff

The already running full-QA candidate must remain frozen. Its result cannot
qualify this later patch. The next centralized QA owner should include this
patch with other eligible repairs, verify candidate containment, and run Android
host quality, dependency hardening and Wrapper validation on that candidate.
Do not start another full run solely for this update. Broaden coverage if the
combined repairs require it. No push, remote dispatch, PR/alert closure, security
setting change or publication is authorized by this record. Existing source
failures and unknown security coverage remain unresolved.
