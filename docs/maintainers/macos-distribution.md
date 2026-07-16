# macOS Distribution Contract

Foliole maintains one sandboxed macOS product with two delivery channels. The GitHub package is the long-running test vehicle for the future Mac App Store package; it is not a separate, less restricted direct-download edition.

## Channel matrix

| Contract | GitHub testing | Mac App Store |
| --- | --- | --- |
| Electron runtime | MAS arm64 build | MAS arm64 build |
| Apple App Sandbox | Required | Required |
| Bundle ID | `com.campfirium.foliole` | `com.campfirium.foliole` |
| Signing identity | Developer ID Application | Apple Development / Apple Distribution |
| Provisioning profile | Developer ID profile | MAS development / distribution profile |
| Hardened Runtime | Required | Required by the maintained package shape |
| Notarization | Required before external GitHub distribution | Not separately required |
| App Store review | No | Yes |

The GitHub channel may differ only where the delivery channel requires it: certificate, provisioning profile, notarization, and DMG/ZIP wrapping. It must not switch to the standard Darwin Electron runtime or remove App Sandbox to make packaging easier.

## Why this shape is fixed

Apple requires Mac App Store apps to run in App Sandbox. Electron only supports App Sandbox with its MAS build, while a Developer ID Application certificate may sign either the normal or MAS build. Keeping the GitHub test package on the MAS build exposes store-only file and capability restrictions during daily testing instead of at submission time.

Security-scoped bookmarks are part of this contract. Finder/Open With/Open Panel authorization must survive restart without broad filesystem access or a second confirmation prompt.

## Mechanical enforcement

Run the source contract check after changing macOS packaging, entitlements, signing, or Electron runtime selection:

```sh
node scripts/macos/check-distribution-contract.mjs
```

An already-built app can be audited independently:

```sh
node scripts/macos/verify-packaged-app.mjs --app artifacts/macos/github-arm64/mac-arm64/Foliole.app
```

Add `--notarized` when the app is expected to carry a stapled ticket.

The MAS and GitHub config builders execute the same assertions during packaging. The check fails when the bundle ID, MAS runtime selection, App Sandbox entitlements, profile requirement, signing entry, Team ID, Hardened Runtime, or channel targets drift. Before reporting package success, both builders also verify the real app signature, embedded profile, main-app entitlements, and inherited Helper entitlements. The notarized GitHub path additionally validates the stapled app ticket.

The downloaded GitHub Electron runtime is obtained through `@electron/get` with `platform: mas` and is cached only under the versioned MAS runtime contract. The package test suite must keep the download platform and dynamic builder configuration covered.

## Maintained commands

- `npm run macos:mas:dev`: build and install the locally testable MAS development package.
- `npm run macos:mas:distribution`: build the App Store distribution package.
- `npm run macos:github:package`: build a Developer ID-signed local GitHub test DMG/ZIP. It is not ready for external distribution without notarization.
- `npm run macos:github:notarize`: build through the notarization path after approved credentials are configured.

The Developer ID provisioning profile is supplied through `FOLIOLE_MACOS_DEVELOPER_ID_PROVISIONING_PROFILE`. Notarization credentials belong in the macOS Keychain or approved CI secrets; they must never be committed.

Before publishing a GitHub artifact, verify the Developer ID signature, embedded profile, App Sandbox entitlements, notarization ticket, Gatekeeper assessment, and checksum. App Store artifacts follow the MAS signing and submission checks instead of the Developer ID notarization path.

## Official references

- [Electron Mac App Store submission guide](https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide/)
- [Apple: Developer ID certificates](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/)
- [Apple: Notarizing macOS software before distribution](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
