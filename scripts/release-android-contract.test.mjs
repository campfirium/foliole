/* global Buffer */
// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { afterEach, expect, it } from 'vitest';
import { createDefaultReleaseIntent, resolveReleasePlatformIdentity } from './release-platform-contract.mjs';
import { prepareDefaultReleaseIntent } from './release-intent.mjs';
import { assertT7Publication } from './release-publication-contract.mjs';
import { createPlatformDownloadDirectory } from './release-download-directory.mjs';
import { assembleReleaseAssets } from './release-assembly-assets.mjs';
import { PLAY_APP_CERTIFICATE_SHA256 } from './android/play-generated-apk.mjs';

const registry = JSON.parse(fs.readFileSync('.github/release-platforms.json'));
const sha = 'a'.repeat(40); const version = '0.8.0';
const history = { latest: '0.7.17', desktopUpdater: { compatibilityBridgeVersion: '0.7.17' },
  releases: [{ version: '0.7.17', platforms: ['macos', 'windows', 'linux'] }] };
const roots = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function root() {
  fs.mkdirSync('.tmp/artifacts', { recursive: true });
  const folder = fs.mkdtempSync(path.resolve('.tmp/artifacts/android-release-contract-')); roots.push(folder); return folder;
}
function identity() {
  const intent = createDefaultReleaseIntent({ registry, version, publicationMode: 'scoped' });
  return resolveReleasePlatformIdentity({ registry, intent, packageVersion: version, sha });
}

it('defaults new releases to every active producer while preserving old scoped intent and bridge history', async () => {
  const selected = identity();
  expect(new Set(selected.intent.selectedPlatforms)).toEqual(new Set(['macos', 'windows', 'linux', 'ios', 'android']));
  expect(selected.hardGatePlatforms).toContain('android');
  expect(selected.managedAssets).toEqual(expect.arrayContaining([`Foliole-Android-${version}.apk`, `Foliole-Android-${version}-Play.json`]));
  const before = JSON.stringify(history);
  expect(assertT7Publication(selected, history).mode).toBe('scoped');
  const oldIntent = { schemaVersion: 1, version: '0.7.17', publicationMode: 'scoped',
    selectedPlatforms: ['macos', 'windows', 'linux'], scopeBasis: { macos: 'Historical scope', windows: 'Historical scope', linux: 'Historical scope' } };
  expect(resolveReleasePlatformIdentity({ registry, intent: oldIntent, packageVersion: '0.7.17', sha }).intent).toEqual(oldIntent);
  expect(JSON.stringify(history)).toBe(before);
  const folder = root(); fs.mkdirSync(path.join(folder, '.github'));
  fs.mkdirSync(path.join(folder, 'releases'));
  fs.writeFileSync(path.join(folder, '.github/release-platforms.json'), JSON.stringify(registry));
  fs.writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ version }));
  fs.writeFileSync(path.join(folder, 'releases/update-manifest.json'), JSON.stringify(history));
  const file = path.join(folder, '.github/release-intent.json'); fs.writeFileSync(file, 'previous intent');
  await prepareDefaultReleaseIntent(folder);
  expect(fs.readFileSync(file, 'utf8')).toBe('previous intent');
  await prepareDefaultReleaseIntent(folder, { write: true });
  expect(JSON.parse(fs.readFileSync(file))).toEqual(selected.intent);
  fs.writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ version: '0.7.17' }));
  await expect(prepareDefaultReleaseIntent(folder, { write: true })).rejects.toThrow(/published history/u);
});

it('maps Android store updates to an exact GitHub APK without adding TestFlight to the download directory', () => {
  const manifest = { latest: version, releases: [{ version, platforms: identity().intent.selectedPlatforms }] };
  const published = { draft: false, published_at: '2026-11-05', tag_name: `v${version}`,
    assets: identity().managedAssets.map(name => ({ name })) };
  const downloads = createPlatformDownloadDirectory({ registry, manifest, publishedReleases: { [version]: published } });
  expect(downloads.platforms.android).toMatchObject({ asset: `Foliole-Android-${version}.apk`,
    url: `https://github.com/campfirium/foliole/releases/download/v${version}/Foliole-Android-${version}.apk` });
  expect(registry.platforms.find(platform => platform.id === 'android').update.mode).toBe('store');
  expect(downloads.platforms.ios).toBeUndefined();
});

function producer() {
  const folder = root(); const inputRoot = path.join(folder, 'input'); const android = path.join(inputRoot, 'android');
  fs.mkdirSync(android, { recursive: true });
  const dex = Buffer.from('isolated trusted producer byte boundary');
  const member = path.join(folder, 'classes.dex'); fs.writeFileSync(member, dex);
  const asset = `Foliole-Android-${version}.apk`; const apk = path.join(android, asset);
  execFileSync('zip', ['-j', apk, member]);
  const bytes = fs.readFileSync(apk);
  const receipt = { schemaVersion: 1, sourceSha: sha, acceptedSha: sha, version, runId: '42', versionCode: 4,
    packageName: 'com.campfirium.foliole.android', asset, channel: 'play-beta', deploymentId: 7,
    certificateSha256: PLAY_APP_CERTIFICATE_SHA256, aabSha256: 'b'.repeat(64),
    apkSha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length,
    dexSha256: { 'classes.dex': createHash('sha256').update(dex).digest('hex') },
    releaseName: `${version}.4.${sha.slice(0, 9)}`, releaseLifecycleState: 'RELEASE_LIFECYCLE_STATE_IN_REVIEW' };
  const file = path.join(android, `Foliole-Android-${version}-Play.json`);
  fs.writeFileSync(file, JSON.stringify(receipt));
  const full = identity();
  const selected = resolveReleasePlatformIdentity({ registry, intent: { ...full.intent, selectedPlatforms: ['android'],
    scopeBasis: { android: 'Isolated asset verification' } }, packageVersion: version, sha });
  return { folder, inputRoot, outputRoot: path.join(folder, 'output'), identity: selected, receipt, file, apk, asset };
}

it('assembles exact APK assets and refuses changed bytes without destroying the previous verified output', async () => {
  const f = producer(); const names = await assembleReleaseAssets(f);
  expect(new Set(names)).toEqual(new Set([f.asset, `Foliole-Android-${version}-Play.json`]));
  const old = fs.readFileSync(path.join(f.outputRoot, f.asset));
  fs.writeFileSync(f.apk, 'corrupted');
  await expect(assembleReleaseAssets(f)).rejects.toThrow(/digest or size/u);
  expect(fs.readFileSync(path.join(f.outputRoot, f.asset))).toEqual(old);
});

it('rejects wrong source, signature claims and code changes even when superficial APK checksums are replaced', async () => {
  for (const patch of [{ sourceSha: 'c'.repeat(40) }, { certificateSha256: 'c'.repeat(64) }, { deploymentId: 0 }]) {
    const f = producer(); fs.writeFileSync(f.file, JSON.stringify({ ...f.receipt, ...patch }));
    await expect(assembleReleaseAssets(f)).rejects.toThrow(/exact Play candidate/u);
  }
  const f = producer(); fs.writeFileSync(path.join(f.folder, 'classes.dex'), 'modified code');
  execFileSync('zip', ['-j', f.apk, path.join(f.folder, 'classes.dex')]);
  const bytes = fs.readFileSync(f.apk);
  fs.writeFileSync(f.file, JSON.stringify({ ...f.receipt, apkSha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length }));
  await expect(assembleReleaseAssets(f)).rejects.toThrow(/executable code differs/u);
});
