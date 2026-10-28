# AGENTS

## Scope

- Applies to `ios/**`, `scripts/ios/**`, and iPhone/iPad native host integration.
- The iOS host uses Capacitor 8, Swift Package Manager, and Xcode 26. Follow this file alongside root `AGENTS.md`.

## iOS Host Rules

- iOS and Android are companion native hosts; keep shared business logic in the TypeScript shared layer and `src/companion/**`.
- `ios/` contains only the Capacitor iOS native project, Xcode project, Info.plist, resources, permissions, and platform plugin integration.
- iOS may consume companion capabilities, including Sync Group, through shared capability/bridge contracts. Business semantics, durable state models, and frontend implementation stay shared. `ios/` implements verifiable native host seams only, without shared-state copies or a second business implementation.
- Existing native capabilities include `FolioleCompanionBootstrap`, Keychain pairing and local network requests, validated downloads of the existing sync-pack format, and local apply. Bootstrap must initialize the shared schema through Capacitor SQLite, persist a stable iOS device identity, and report ready only after the database is readable/writable. Pairing keys belong only in Keychain. Load workspace state from shared SQLite truth. Sync-pack transfer must validate same-origin envelopes, target identity, and SQLite before returning the cache DB; apply must reuse shared `DbPort` semantics and persist cursors in `companion_meta`. Register shared runtime capabilities and bridge contracts before adding capabilities such as Sync Group. Reject missing methods or host failures explicitly; never silently fall back to Web, empty objects, or optimistic defaults.
- Do not use the iOS host directory as a second business implementation; shared business logic must not enter Swift/Objective-C host code.
- Extract shared bridge/contracts before connecting capabilities that affect both Android and iOS.
- Check official Capacitor and Apple documentation before changing iOS permissions, lifecycle, file access, sharing, background behavior, or plugin seams.
- Keep the iOS Bundle ID `com.campfirium.foliole.ios`. Preserve the existing Android identity in `capacitor.config.ts`; iOS integration must not rewrite Android Application ID.

## Validation

- Public minimal iOS workflow: `npm run android:web:build`, `npx cap sync ios`, `node -e "import('./scripts/ios/ios-local-storage.mjs').then(({ prepareIosAcceptanceCache }) => prepareIosAcceptanceCache(process.cwd()))"`, then `xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -destination 'generic/platform=iOS Simulator' -derivedDataPath .cache/ios-acceptance-build/DerivedData CODE_SIGNING_ALLOWED=NO build`. Generic compilation must not write DerivedData to `.tmp/artifacts/<task-entry>`.
- For changes not requiring a real iOS runtime, start with registered explicit file checks. `quality:ios*` and `ios:sync:preflight` are hosted-only.
- Isolated Simulator acceptance must retain Xcode local signing and verify signatures before installation. `CODE_SIGNING_ALLOWED=NO` is only for generic compilation without running the App; do not reuse its output to accept Keychain or visible runtime behavior, as missing entitlements produce false failures.
- Use `npx cap open ios` when the project must be opened manually; use `npx cap run ios --target <device-id>` when visible Simulator or device acceptance is required.
- Production builds must not include `FOLIOLE_DEV_LIVE_RELOAD`.
- For host/plugin changes, complete companion build and `npx cap sync ios` before the unsigned native build. Run applicable Simulator scenarios when user-visible behavior enters the iOS runtime.
- Non-iOS daily quality entry points do not run iOS preflight by default. `sync:sql-surface:scan` escalates iOS runtime gaps to hard failures only when the scanned scope contains an `iosRuntime` capability marker.
- When adding iOS host scripts or npm entry points, update this file with their public commands, minimum verification order, and preview/acceptance rules.
- First challenge the shared fail-closed journey readiness contract with `node scripts/journey-readiness-cli.mjs --output .tmp/artifacts/journey-readiness/dry-run/receipt.json`. After narrow verification and committing the candidate, use `node scripts/with-resource-gate.mjs exclusive -- node scripts/macos/journey-readiness-local-qualification.mjs` for the sole formal Mac/signed Simulator qualification. It performs companion build, `npx cap sync ios`, clean candidate freezing, exclusive Simulator creation/signature checks/installation, receipt enforcement, and exact cleanup. `FOLIOLE_JOURNEY_READINESS_SCENARIO=device-identity` adds only the registered device-anchor scenario through the same entry and exclusive gate, followed by another frozen-candidate check. Do not extrapolate local `ready` to physical devices or other hosts.
- Route iOS runtime contract Swift/SwiftPM module caches, scratch build caches, and shared acceptance DerivedData/SourcePackages/ModuleCache to root `.cache/`. Put per-run app copies and evidence in `.tmp/artifacts/`. Prepare and refresh only the directories used when writing or hitting a cache; repository-wide cleanup follows the explicit root workflow.
