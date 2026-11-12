// @vitest-environment node
import fs from 'node:fs';
import { expect, it } from 'vitest';
import { createReleaseIntent, resolveReleasePlatformIdentity } from './release-platform-contract.mjs';
import { createReleaseDownloadTable, assertReleaseDownloadTable } from './release-download-table.mjs';
import { readReleaseDownloadPreview, previewReleaseDownloads } from './release-download-preview.mjs';
import { publishRelease } from './release-publish.mjs';

const registry = JSON.parse(fs.readFileSync('.github/release-platforms.json'));
const sha = 'a'.repeat(40);
function fixture(platforms = ['windows']) {
  const intent = createReleaseIntent({ registry, version: '0.7.18', publicationMode: 'scoped', platforms,
    compatibility: { mode: 'compatible', basis: 'Only selected hosts change; prior sync clients remain compatible.' } });
  const identity = resolveReleasePlatformIdentity({ registry, intent, packageVersion: '0.7.18', sha });
  const candidate = { draft: true, tag_name: 'v0.7.18', target_commitish: sha, assets: identity.managedAssets.map(name => ({ name })) };
  const manifest = { latest: '0.7.17', desktopUpdater: { compatibilityBridgeVersion: '0.7.17' },
    releases: [{ version: '0.7.17', platforms: ['macos', 'windows', 'linux', 'android'] }] };
  const published = { draft: false, published_at: '2026-11-03', tag_name: 'v0.7.17', assets: registry.platforms
    .flatMap(platform => platform.managedAssets.map(name => ({ name: name.replaceAll('{version}', '0.7.17') }))) };
  return { identity, candidate, manifest, publishedReleases: { '0.7.17': published } };
}

function persistFixture(f) {
  fs.mkdirSync('.tmp/artifacts', { recursive: true });
  const root = fs.mkdtempSync('.tmp/artifacts/release-download-preview-');
  fs.mkdirSync(`${root}/.github`); fs.mkdirSync(`${root}/releases`);
  fs.writeFileSync(`${root}/package.json`, JSON.stringify({ version: f.identity.intent.version }));
  fs.writeFileSync(`${root}/.github/release-platforms.json`, JSON.stringify(registry));
  fs.writeFileSync(`${root}/.github/release-intent.json`, JSON.stringify(f.identity.intent));
  fs.writeFileSync(`${root}/releases/update-manifest.json`, JSON.stringify(f.manifest));
  return root;
}

it('lists Windows 0.7.18 alongside each other platform own published version and the existing TestFlight invitation', () => {
  const expected = createReleaseDownloadTable(fixture());
  expect(expected.table).toContain('[EXE](https://github.com/campfirium/foliole/releases/download/v0.7.18/Foliole-Windows-x64-0.7.18.exe)');
  expect(expected.table).toContain('[DMG](https://github.com/campfirium/foliole/releases/download/v0.7.17/Foliole-macOS-arm64-0.7.17.dmg)');
  expect(expected.table).toContain('/v0.7.17/Foliole-Linux-Experimental-amd64-0.7.17.AppImage');
  expect(expected.table).toContain('/v0.7.17/Foliole-Android-0.7.17.apk');
  expect(expected.table).toContain('[TestFlight](https://testflight.apple.com/join/PszuhyJA)');
  expect(expected.table).not.toContain('/v0.7.18/Foliole-macOS');
  expect(assertReleaseDownloadTable(`### Fixed\n\nA Windows fix.\n\n${expected.table}`, expected)).toBeTruthy();
});

it('uses all selected new assets for a coordinated scope and keeps the public history untouched', () => {
  const f = fixture(registry.platforms.map(platform => platform.id)); const before = JSON.stringify(f.manifest);
  const table = createReleaseDownloadTable(f).table;
  expect(table).toContain('| **macOS** | **Windows** | **Linux (Experimental)** | **iPhone** | **Android** |');
  expect(table).toContain('| :---: | :---: | :---: | :---: | :---: |');
  expect(table).toContain('| Apple Silicon | x64 | x64 | TestFlight | Open Testing |');
  expect(table.split('\n').at(-1)).toMatch(/^\| \[DMG\].*\[EXE\].*\[DEB\].*\[AppImage\]/u);
  expect(table).not.toContain('| 0.7.18 |');
  expect(table).not.toContain('/v0.7.17/');
  expect(table).toContain('/v0.7.18/Foliole-Android-0.7.18.apk');
  expect(JSON.stringify(f.manifest)).toBe(before);
});

it('shows an unavailable platform without inventing its first public APK link', () => {
  const f = fixture(); f.manifest.releases[0].platforms = ['macos', 'windows', 'linux'];
  const preview = createReleaseDownloadTable(f);
  expect(preview.columns.find(column => column.header === 'Android').links).toEqual([]);
  expect(preview.table).toContain('Not available');
  expect(preview.table).not.toContain('.apk');
});

it.each(['draft', 'asset', 'target', 'tag', 'appimage'])(
  'refuses unverified carried or candidate identity: %s', problem => {
    const f = fixture(); const old = f.publishedReleases['0.7.17'];
    if (problem === 'draft') old.draft = true;
    if (problem === 'asset') old.assets = old.assets.filter(asset => !asset.name.endsWith('.dmg'));
    if (problem === 'target') f.candidate.target_commitish = 'b'.repeat(40);
    if (problem === 'tag') f.candidate.tag_name = 'v0.7.19';
    if (problem === 'appimage') old.assets = old.assets.filter(asset => !asset.name.endsWith('.AppImage'));
    expect(() => createReleaseDownloadTable(f)).toThrow();
  });

it('rejects missing platforms, forged URLs, false visible versions and extra links before publication', () => {
  const preview = createReleaseDownloadTable(fixture());
  for (const table of [preview.table.replace('| **Android** |', '| **Other** |'), preview.table.replace('/v0.7.17/Foliole-macOS', '/v0.7.18/Foliole-macOS'),
    preview.table.replace('| 0.7.17 | 0.7.18 |', '| 0.7.18 | 0.7.18 |'), `${preview.table}\n[extra](https://example.com/)`, '### Download\n\nNo links']) {
    expect(() => assertReleaseDownloadTable(table, preview)).toThrow();
  }
  expect(assertReleaseDownloadTable(preview.table.replaceAll(' | ', '  |  '), preview)).toBeTruthy();
});

it('reads only exact published carry-forward releases and never mutates GitHub while preparing the complete table', async () => {
  const f = fixture(); const calls = [];
  const run = (command, args) => {
    calls.push([command, ...args]);
    return JSON.stringify(args.at(-1).endsWith('v0.7.18') ? f.candidate : f.publishedReleases['0.7.17']);
  };
  const preview = await readReleaseDownloadPreview({ identity: f.identity, manifest: f.manifest, cwd: '.', run });
  expect(preview.table).toContain('| 0.7.17 | 0.7.18 | 0.7.17 | — | 0.7.17 |');
  expect(calls).toEqual([
    ['gh', 'api', 'repos/campfirium/foliole/releases/tags/v0.7.17'], ['gh', 'api', 'repos/campfirium/foliole/releases/tags/v0.7.18']
  ]);
});

it('runs the actual preview entry with persisted inputs and preserves the approved copy and published manifest', async () => {
  const f = fixture(); const root = persistFixture(f);
  try {
    const history = JSON.stringify(f.manifest);
    const output = '.tmp/artifacts/table.md';
    const run = (command, args) => command === 'git' ? sha : JSON.stringify(args.at(-1).endsWith('v0.7.18') ? f.candidate : f.publishedReleases['0.7.17']);
    await previewReleaseDownloads({ cwd: root, run, output });
    expect(fs.readFileSync(`${root}/${output}`, 'utf8')).toContain('/v0.7.17/Foliole-macOS');
    expect(fs.readFileSync(`${root}/releases/update-manifest.json`, 'utf8')).toBe(history);
    await expect(previewReleaseDownloads({ cwd: root, run, output: 'releases/github/v0.7.18.md' })).rejects.toThrow(/\.tmp\/artifacts/u);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

it('publishes Windows-only without mobile credentials only after every carried platform is present in the body', async () => {
  const f = fixture(); const root = persistFixture(f); const calls = []; let published = false;
  let body = '### Fixed\n\nWindows fix.\n\n### Download\n\n| Windows |\n| --- |\n| Missing other platforms |';
  const run = (command, args) => {
    calls.push([command, ...args]);
    if (command === 'git') return args[0] === 'branch' ? 'release' : sha;
    if (args[0] === 'api') return JSON.stringify(f.publishedReleases['0.7.17']);
    if (args.includes('--draft=false')) { published = true; return ''; }
    if (!published) return JSON.stringify({ isDraft: true, tagName: 'v0.7.18', targetCommitish: sha, assets: f.candidate.assets, body });
    return JSON.stringify({ isDraft: false, tagName: 'v0.7.18' });
  };
  try {
    await expect(publishRelease({ cwd: root, run })).rejects.toThrow(/every active platform/u);
    expect(published).toBe(false);
    body = `### Fixed\n\nWindows fix.\n\n${createReleaseDownloadTable(f).table}`;
    expect(await publishRelease({ cwd: root, run })).toEqual({ expectedLatest: 'v0.7.18', tag: 'v0.7.18' });
    expect(published).toBe(true);
    expect(calls.filter(call => call[1] === 'api').every(call => call[2].endsWith('/v0.7.17'))).toBe(true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

it('retains Windows 0.7.18 when a subsequent macOS-only 0.7.19 becomes the next candidate', () => {
  const f = fixture(); expect(createReleaseDownloadTable(f).table).toContain('| 0.7.17 | 0.7.18 | 0.7.17 | — | 0.7.17 |');
  f.manifest.releases.unshift({ version: '0.7.18', platforms: ['windows'] }); f.manifest.latest = '0.7.18';
  f.publishedReleases['0.7.18'] = { ...f.candidate, draft: false, published_at: '2026-11-05' };
  const intent = createReleaseIntent({ registry, version: '0.7.19', publicationMode: 'scoped', platforms: ['macos'],
    compatibility: { mode: 'compatible', basis: 'macOS-only fix; sync unchanged.' } });
  f.identity = resolveReleasePlatformIdentity({ registry, intent, packageVersion: '0.7.19', sha });
  f.candidate = { draft: true, tag_name: 'v0.7.19', target_commitish: sha, assets: f.identity.managedAssets.map(name => ({ name })) };
  const table = createReleaseDownloadTable(f).table;
  expect(table).toContain('/v0.7.19/Foliole-macOS-arm64-0.7.19.dmg');
  expect(table).toContain('/v0.7.18/Foliole-Windows-x64-0.7.18.exe');
  expect(table).toContain('/v0.7.17/Foliole-Android-0.7.17.apk');
});
