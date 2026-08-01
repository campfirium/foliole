// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  fetchPublishedRelease,
  prepareReleaseManifestSite,
  validateReleaseManifestPublication
} from './prepare-release-manifest-site.mjs';

const VERSION = '0.9.0';
const REPOSITORY = 'campfirium/foliole';
const MANIFEST = {
  desktopUpdater: {
    firstCapableVersion: VERSION,
    manualUpgradeFrom: '0.7.0',
    verifiedBaselineVersion: VERSION
  },
  latest: VERSION,
  releases: [{
    url: `https://github.com/${REPOSITORY}/releases/tag/v${VERSION}`,
    version: VERSION
  }]
};
const RELEASE = {
  draft: false,
  published_at: '2026-07-31T00:00:00Z',
  tag_name: `v${VERSION}`
};

describe('release manifest Pages preparation', () => {
  it('accepts only metadata whose latest entry names the published Release', () => {
    expect(validateReleaseManifestPublication({
      manifest: MANIFEST,
      release: RELEASE,
      repository: REPOSITORY
    })).toEqual({ expectedTag: 'v0.9.0', version: VERSION });
  });

  it('preserves 0.7.1 bootstrap metadata without claiming updater capability', () => {
    const manifest = {
      desktopUpdater: {
        firstCapableVersion: null,
        manualUpgradeFrom: '0.7.0',
        verifiedBaselineVersion: null
      },
      latest: '0.7.1',
      releases: [{
        url: `https://github.com/${REPOSITORY}/releases/tag/v0.7.1`,
        version: '0.7.1'
      }]
    };
    expect(validateReleaseManifestPublication({
      manifest,
      release: { ...RELEASE, tag_name: 'v0.7.1' },
      repository: REPOSITORY
    })).toEqual({ expectedTag: 'v0.7.1', version: '0.7.1' });
  });

  it.each([
    ['draft', { ...RELEASE, draft: true }],
    ['missing publication time', { ...RELEASE, published_at: null }],
    ['wrong tag', { ...RELEASE, tag_name: 'v0.8.0' }]
  ])('rejects a %s release state', (_label, release) => {
    expect(() => validateReleaseManifestPublication({ manifest: MANIFEST, release, repository: REPOSITORY }))
      .toThrow('already-published');
  });

  it('rejects a manifest URL that does not identify its latest public Release', () => {
    expect(() => validateReleaseManifestPublication({
      manifest: { ...MANIFEST, releases: [{ version: VERSION, url: 'https://example.test' }] },
      release: RELEASE,
      repository: REPOSITORY
    })).toThrow('must link');
  });

  it('rejects promotion when updater baseline metadata does not name a public release', () => {
    expect(() => validateReleaseManifestPublication({
      manifest: {
        ...MANIFEST,
        desktopUpdater: { ...MANIFEST.desktopUpdater, verifiedBaselineVersion: '0.8.0' }
      },
      release: RELEASE,
      repository: REPOSITORY
    })).toThrow('public manifest releases');
  });

  it('queries the official published-release endpoint with explicit API headers', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ json: async () => RELEASE, ok: true, status: 200 });
    await expect(fetchPublishedRelease({ fetchImpl, repository: REPOSITORY, token: 'token', version: VERSION }))
      .resolves.toEqual(RELEASE);
    const [url, request] = fetchImpl.mock.calls[0];
    expect(url).toBe(`https://api.github.com/repos/${REPOSITORY}/releases/tags/v${VERSION}`);
    expect(request.headers.Authorization).toBe('Bearer token');
    expect(request.headers['X-GitHub-Api-Version']).toBe('2026-03-10');
  });

  it('fails closed when the public endpoint cannot find the tag', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(fetchPublishedRelease({ fetchImpl, repository: REPOSITORY, version: VERSION }))
      .rejects.toThrow('HTTP 404');
  });

  it('rejects preparation before I/O when metadata has not reached dev', async () => {
    await expect(prepareReleaseManifestSite({ ref: 'refs/heads/release' }))
      .rejects.toThrow('only be prepared from dev');
  });
});
