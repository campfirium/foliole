// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { createPlatformDownloadDirectory, readPublicReleaseInventory, storeChannelsForRelease } from './release-download-directory.mjs';

const registry = {
  platforms: [
    { id: 'macos', status: 'active', architectures: ['arm64'], deliveryChannel: 'github-release', downloadAsset: 'Foliole-macOS-{version}.dmg' },
    { id: 'windows', status: 'active', architectures: ['x64'], deliveryChannel: 'github-release', downloadAsset: 'Foliole-Windows-{version}.exe' },
    { id: 'linux', status: 'active', architectures: ['x64'], deliveryChannel: 'github-release', downloadAsset: 'Foliole-Linux-Experimental-amd64-{version}.deb' }
  ]
};
const manifest = {
  latest: '0.8.2',
  releases: [
    { version: '0.8.2', platforms: ['windows', 'linux'] },
    { version: '0.8.1', platforms: ['macos'] }
  ]
};
const publishedReleases = {
  '0.8.2': { draft: false, published_at: '2026-08-03', tag_name: 'v0.8.2', assets: [
    { name: 'Foliole-Windows-0.8.2.exe' },
    { name: 'Foliole-Linux-Experimental-amd64-0.8.2.deb' }
  ] },
  '0.8.1': { draft: false, published_at: '2026-08-02', tag_name: 'v0.8.1', assets: [{ name: 'Foliole-macOS-0.8.1.dmg' }] }
};

describe('public platform download directory', () => {
  it('keeps each platform on its newest applicable public Release and exact asset', () => {
    const directory = createPlatformDownloadDirectory({ manifest, publishedReleases, registry });
    expect(directory.productVersion).toBe('0.8.2');
    expect(directory.platforms.windows).toMatchObject({ tag: 'v0.8.2', version: '0.8.2' });
    expect(directory.platforms.linux).toMatchObject({
      asset: 'Foliole-Linux-Experimental-amd64-0.8.2.deb',
      url: 'https://github.com/campfirium/foliole/releases/download/v0.8.2/Foliole-Linux-Experimental-amd64-0.8.2.deb'
    });
    expect(directory.platforms.macos).toMatchObject({
      tag: 'v0.8.1',
      url: 'https://github.com/campfirium/foliole/releases/download/v0.8.1/Foliole-macOS-0.8.1.dmg',
      version: '0.8.1'
    });
  });

  it('fails closed for a missing or extra-derived platform asset', () => {
    expect(() => createPlatformDownloadDirectory({
      manifest, registry,
      publishedReleases: { ...publishedReleases, '0.8.1': { ...publishedReleases['0.8.1'], assets: [] } }
    })).toThrow('download asset');
  });
});

it('keeps the fixed TestFlight invitation outside exact GitHub download assets', () => {
  const withStore = { platforms: [...registry.platforms,
    { id: 'ios', status: 'active', deliveryChannel: 'testflight' }] };
  expect(createPlatformDownloadDirectory({ registry: withStore, manifest, publishedReleases }))
    .toEqual(createPlatformDownloadDirectory({ registry, manifest, publishedReleases }));
});

it('selects the highest published version with the exact uploaded APK', async () => {
  const asset = version => ({ name: `Foliole-Android-${version}.apk`, state: 'uploaded',
    digest: `sha256:${'a'.repeat(64)}` });
  const release = (version, assets, draft = false) => ({
    tag_name: `v${version}`, draft, published_at: '2026-11-07', assets
  });
  const expected = release('0.8.1', [asset('0.8.1')]);
  const fetchImpl = async () => ({ ok: true, json: async () => [
    release('0.8.3', [asset('0.8.3')], true),
    release('0.8.2', [asset('0.8.1')]), expected,
    release('0.8.0', [asset('0.8.0')])
  ] });
  await expect(readPublicReleaseInventory({ fetchImpl, repository: 'campfirium/foliole' })).resolves.toMatchObject({ androidApk: expected });
});

it('hides an older store build when a newer independent APK is released', () => {
  const ios = { version: '0.8.0', build: 'old-build', status: 'available', url: 'https://testflight.apple.com/join/example' };
  const play = { version: '0.8.1', build: '5', status: 'in-review' };
  expect(storeChannelsForRelease({ ios, 'android-play': play }, '0.8.0', '0.8.1')).toEqual({
    ios: { version: '0.8.0', build: 'old-build', status: 'update-pending' },
    'android-play': play
  });
});

it('changes the website revision when an existing public Release body changes', async () => {
  const record = { tag_name: 'v0.8.1', draft: false, published_at: '2026-11-07', assets: [] };
  const inventory = body => readPublicReleaseInventory({
    repository: 'campfirium/foliole',
    fetchImpl: async () => ({ ok: true, json: async () => [{ ...record, body }] })
  });
  const before = await inventory('In Review');
  expect(await inventory('In Review')).toEqual(before);
  expect((await inventory('Published')).changelogRevision).not.toBe(before.changelogRevision);
});
