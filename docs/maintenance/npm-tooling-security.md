# npm build-tool security maintenance

The October 2026 minimatch advisory concerns attacker-controlled glob patterns
compiled with `optimizationLevel >= 2`. These dependencies are development tools;
it is not an observed APK memory failure. Ordinary application text is not a glob
expression passed to these tools.

The upstream fix limits expansion using `braceExpandMax` (default 100000) and skips
quadratic deduplication above 1000 patterns. A private 64 MiB child heap is not that
contract. Regression tests verify the documented default and an explicit limit in
a disposable process, together with normal packaging and lint behavior.

Sources:
- [Advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249)
- [Upstream resource-bound fix](https://github.com/isaacs/minimatch/commit/77a0f5c4b80bdc641c3c930a1d9edf5ad2db57f8)

The selected minimatch 11 runtime changes exports and pattern representations.
ASAR 4 and universal 3 replace legacy consumers; the lint configuration loads only
its existing import-order rule through the import-x package's public rule export.
Loading that package's entire plugin would also load unused rules requiring the
removed `makeRe` export. Modern glob selections use version 14 to include their
separate AbortSignal security fix. Overrides remain explicit and reviewable.

The Squirrel peer installed by builder formerly introduced temp/rimraf2/glob7 and
minimatch 3. Forcing minimatch 11 into glob7 broke escaped filename matching. The
tracked-directory cleanup also expanded a missing literal path into a glob,
allowing a matching sibling to be removed. Synchronous and asynchronous production
regressions reproduced that failure before the fix.

The local [installer backport](../../electron/vendor/winstaller-backport/README.md)
uses the official 5.4.4 artifact and upstream's native temporary-directory approach,
with the explicitly retained cleanup contracts. Tracked paths are removed literally;
explicit wildcard cleanup uses glob14/minimatch11.0.3. The installer, resources,
signing binaries and architecture selection script otherwise match the verified
official artifact. The production Windows target remains NSIS. A root file dependency
and an override select the same package for builder's Squirrel peer; npm's script
policy approves only that relative file source's unchanged install hook.

On 2026-11-05, both `npm audit --omit=dev --json` and the full `npm audit --json`
reported zero vulnerabilities. The current GHSA-g3hv-75wg-m249 record lists
`>=7.0.0, <11.0.1`, patched in 11.0.1; earlier metadata described a broader range.
Removal of the old chain and this current advisory assessment are distinct results.
No GitHub alert was dismissed and no remote alert state is inferred from npm audit.

The compatibility contract covers real ASAR unpacking, builder includes/excludes,
installer glob matching and cleanup, template file lists, active lint ordering and Mac
Mach-O universal merging. Mac fixture success does not attest a real Windows
installer or a published application. Centralized QA owns exact-candidate validation,
remote dev containment and the corresponding PR closure after local adoption.
