# Windows installer cleanup backport

This local package preserves electron-winstaller's published CommonJS installer,
resources, signing tools, architecture selection script and MIT license. Foliole's
production Windows target remains NSIS. Builder's required Squirrel peer brings
this package into the development dependency graph even when that target is idle.

Base: [electron-winstaller 5.4.4](https://registry.npmjs.org/electron-winstaller/-/electron-winstaller-5.4.4.tgz),
published 2026-07-01. SHA-512 integrity:
`j9ETcBGJaXxAY/b6UBpR7LZfjdU4BAO+yvr4ifqHEdyuc3UNCy91PDGkWKY5UQ4coHNYfnwFggrqD6QPeFGAlg==`.

The cleanup approach follows upstream [change #607](https://github.com/electron/windows-installer/pull/607),
commit `93ca6a4eb3afd758aeefed32dbe9b6021951eef3`. Published stable versions do not
yet contain that change. Local changes replace only the temporary-directory helper,
its declarations and dependency metadata, and add the cleanup-pattern adapter:

- Native `mkdtemp` creates tracked directories; native `rm` cleans exact paths with
  retries, including directories containing glob characters. Missing tracked paths
  never expand to matching siblings. Normal process exit keeps best-effort cleanup.
- Explicit synchronous, Promise and callback cleanup, plus `{dir, prefix}` input,
  retain the behavior covered by Foliole's installer contracts.
- The explicit glob/removal exports retain wildcard cleanup, dot/ignore handling,
  escaped filenames and `nonull` brace results using glob 14.0.3/minimatch 11.0.3.
  They do not retain the retired temp package's unrelated file/stream APIs.
- The unmaintained temp/rimraf2/glob7 chain is removed. No installed module is patched.

Rebuild from the verified registry tarball, with the project's Node/npm toolchain:

```sh
curl --fail --location https://registry.npmjs.org/electron-winstaller/-/electron-winstaller-5.4.4.tgz --output .tmp/artifacts/electron-winstaller-5.4.4.tgz
node electron/vendor/winstaller-backport/repack.mjs .tmp/artifacts/electron-winstaller-5.4.4.tgz
```

`repack.mjs` verifies the upstream integrity before extraction, copies the readable
overlays above, removes the source-only `prepare` build hook (the published
artifact has no TypeScript project), and uses `npm pack --ignore-scripts`. The resulting versioned
tarball is the dependency input on every host; installation still runs upstream's
unchanged architecture selection script. The source tarball is rebuildable input,
not a second tracked copy. The published MIT license remains inside the package.

Remove this directory and the override once an eligible official stable release
contains equivalent cleanup and passes the same installer and packaging contracts.
Local Mac checks do not prove Windows installation or signing success.
