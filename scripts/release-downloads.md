# Scoped releases and complete downloads

The release owner selects platforms from actual changes and verified cross-version
data/sync compatibility. Product or local schema version changes alone do not mean
old peers are incompatible. Ordinary compatible fixes may ship independently:

```sh
npm run release:intent -- --platforms windows --sync compatible --basis "Windows-only installer fix; sync contracts unchanged"
```

This previews the scope without writing. Add `--write` to save it. An explicit
`--sync coordinated` assessment requires every active platform; do not mark an
unknown compatibility state compatible just to prepare an intent. Historical
intents, updater bridge records and public release history remain unchanged.

## Download table

After T7 assembles the exact unpublished Draft, run from its frozen checkout:

```sh
npm run release:downloads -- --output .tmp/artifacts/release-download-table.md
```

The command reads the exact Draft's source and assets plus published history for
omitted platforms. It prints a full table and optionally saves the preview under
`.tmp/artifacts`. It does not edit a GitHub Release, approved copy or public history.
Include that table when approving the final body. Prose may be reviewed earlier.

For a Windows-only 0.7.18, the Windows cell may link to its 0.7.18 installer while
macOS and Linux retain verified 0.7.17 packages. Android likewise retains its own
latest public APK; before its first public APK it remains unavailable. Linux's
AppImage must actually exist alongside its DEB. iPhone retains the existing
TestFlight invitation without inventing a version-specific store URL.

`release-publish.mjs` checks every active platform, each exact destination, and
visible installer versions before making the Draft public. It refuses missing,
extra or fabricated links. It does not rewrite copy during publication or copy
old assets under a new tag. Installer link text and formatting can still be edited
provided the platform, visible version and exact destination stay correct.

Existing mobile-channel availability checks apply only when that platform is
selected. An unchanged mobile platform is not a reason to upload again or wait for
a new review. Complete Android/iPhone review continuation and publication checks
remain separate release requirements; download presence does not prove them.

Website downloads continue through the existing verified directory and site
dispatch. The separate website task owns Android template consumption; this
command does not deploy the website or change updater/sync behavior.
