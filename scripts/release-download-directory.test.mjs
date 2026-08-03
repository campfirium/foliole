// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { createPlatformDownloadDirectory } from './release-download-directory.mjs';

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
