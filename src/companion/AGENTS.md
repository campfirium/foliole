# AGENTS

## Scope

- Applies to `src/companion/**` and companion renderer shell tasks.
- Follow this file alongside root `AGENTS.md`. If the task also touches `android/**` or `capacitor.config.ts`, read `android/AGENTS.md` as well.

## Companion Surface Rules

- `src/companion/**` is an independent companion renderer shell, not a miniature copy of `src/app/**`.
- Android/iPhone companion serves frequent viewing, review, lightweight actions, and mobile contexts by default. Do not directly inherit dense desktop layouts, multiple panels, heavy hover dependencies, or keyboard-driven command flows.
- Reuse small shared UI elements, bridges, and contracts from `src/shared/**` and `src/shared/platform/**`. Do not import Electron host implementations directly.
- Keep companion page shells, routing, mobile interactions, and touch surfaces in `src/companion/**`; do not move them back into `src/app/**`.
- Except for mobile-specific page shells, gestures, layout density, navigation composition, and small touch wrappers, companion must not add private business capabilities by default. Capabilities with the same name, responsibility, or perceived behavior as desktop must converge in the shared layer before companion consumes them.

## Implementation Rules

- The companion renderer must not directly depend on Electron-only bridges, Windows-only paths, desktop-only runtime assumptions, or direct SQLite connections.
- Check existing desktop/shared sources of truth before implementing. Do not independently rewrite business logic, review logic, queue logic, state progression, or persistence semantics in `src/companion/**`.
- Access host capabilities through stable interfaces in `src/shared/platform/**`. If an interface is insufficient, extend the contract before connecting the host.
- For companion surfaces affecting persisted results, explicitly cover the bridge/runtime/storage path; do not implement only immediate Web shell state.
- Keep mobile-only interactions in the companion shell rather than scattering platform branches through shared features.
- Companion may adapt layout, density, touch interactions, and styling, but must not redefine shared business semantics. If desktop implementation is too host-coupled, make the smallest shared extraction before continuing companion wiring.
