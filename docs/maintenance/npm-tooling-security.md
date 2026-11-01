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

One legacy Squirrel Windows installer chain still requires glob 7's regexp pattern
representation and minimatch 3.1.5. Forcing minimatch 11 there breaks actual file
matching. That old minimatch implementation lacks the level-two preprocessing
mechanism described in this advisory, and the adversarial fixture produces one
pattern there. This is a narrow source-based applicability assessment, not proof
that an old library has no vulnerabilities. The curated advisory range still
includes that version: its audit finding and GitHub alert remain open. No ignore,
alert dismissal, custom dependency patch or blanket audit fix is applied.

The compatibility contract covers real ASAR unpacking, builder includes/excludes,
legacy installer glob matching, template file lists, active lint ordering and Mac
Mach-O universal merging. Mac fixture success does not attest a real Windows
installer or a published application. Known alert state must remain visible until
the remaining supported dependency path or advisory metadata is resolved.
