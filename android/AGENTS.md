# AGENTS

## Scope

- Applies to `android/**`, `scripts/android/**`, `capacitor.config.ts`, Android host sync, emulators, deployment, logs, and Capacitor Android integration.
- Follow this file alongside root `AGENTS.md` when working in these scopes.

## Android Host Rules

- Android is a production host, not a temporary experiment directory; apply host-level standards.
- Use `Capacitor` to host companion Web artifacts. Do not put shared business logic directly in `android/**`.
- `android/` contains only the native host project, Gradle, Manifest, resources, platform permissions, and platform plugin integration.
- Android Java / Capacitor plugins are platform adapters for permissions, lifecycle, files, SQLite execution, bridge implementation, and host APIs; they must not contain higher-level workflows or business decisions.
- The Android host consumes only `dist/companion` build artifacts. Do not turn native directories into a second business frontend.
- For capabilities affecting Android and potentially iPhone, define the shared bridge/contract or `src/companion/**` capability before connecting the Android host.
- Except for host-specific permissions, lifecycle, intents, plugin seams, and device integration, Android requirements must first reuse or extract `src/shared/**`, `src/features/**`, or shared contracts. An Android entry point does not justify private Android/companion implementations of node lists, navigation logic, browsing semantics, state transitions, or other non-native capabilities.
- For the initial Android delivery, prioritize storage, lifecycle, sync entry points, and review using real data; do not first expand desktop-scale UI breadth or complex editing surfaces.
- Check official Capacitor and Android documentation before changing Android permissions, lifecycle, file access, sharing, intents, or plugin seams.

## E-Reader Support

- E-ink readers follow the current companion dependency and WebView requirements; historical Android or WebView targets are not permanent support commitments.
- Within the supported runtime range, prioritize startup, sync, directories, reading, search, settings, and usable click targets; static visual degradation is acceptable.
- Keep platform adaptations in the companion build chain or thin host adapters without duplicating business UI or workflows.

## Implementation Rules

- Do not duplicate React business state, review semantics, sync semantics, or data models in `android/**`; keep shared logic in the TypeScript shared layer.
- Before adding an Android capability, determine whether it should be exposed through a Capacitor plugin/bridge. Feature code must not directly depend on Android APIs.
- Keep `capacitor.config.ts` `webDir` pointing to `dist/companion`. Explain any required change together with its impact on the companion build and host sync path.
- When adding native shell configuration, permissions, or plugins, check whether existing `scripts/android/**` workflows need updates.
- Do not make Android-specific implementations the repository-wide default unless explicitly requested.
- Serialize Android/companion paths writing mobile SQLite sync, review, resources, cursors, pairing, or workspace sync metadata through the shared companion sync writer queue. Internal cursor saves already inside the same writer task must not enqueue again and deadlock.

## Validation

- `capacitor:sync:before` prepares the pinned SQLCipher 4.20.0 JNI/LibTomCrypt build with DBPAGE using NDK 25.2.9519653. It retains the vendor AAR Java classes and publishes the rebuilt AAR/POM to root `.cache/mobile-sqlcipher/maven`; the Gradle exclusive repository prevents an implicit vendor-binary fallback. Run `npm run test:files -- scripts/build/mobile-sqlcipher-sources.test.mjs` before the existing host build entry. This hook does not install or operate a device.

- `npm run android:web:dev` is the companion browser preview entry. Its development server serves a local SQLite copy and injects a development-only preview host. It is for UI debugging, not device, Capacitor host, or acceptance evidence; preview code must not enter production builds.
- Hosted Linux `android:sync`, `android:host:lint`, and `android:host:test` serve native host quality checks.
