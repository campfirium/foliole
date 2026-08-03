// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  assertPublishedManifestScope,
  assertT7Publication,
  resolveReleasePublication
} from './release-publication-contract.mjs';

function identity(mode, selectedPlatforms = ['windows']) {
  return {
    activePlatforms: ['macos', 'windows'],
    intent: { publicationMode: mode, selectedPlatforms, version: '0.9.0' }
  };
}

const BRIDGE_MANIFEST = {
  desktopUpdater: { compatibilityBridgeVersion: '0.8.0' },
  releases: [{ version: '0.8.0', platforms: ['macos', 'windows'] }]
};

describe('release publication contract', () => {
  it('requires the bridge to cover every active platform and become repository latest', () => {
    expect(assertT7Publication(identity('bridge', ['macos', 'windows']), { releases: [] }))
      .toEqual({ bridgeVersion: '0.9.0', makeLatest: true, mode: 'bridge' });
    expect(() => assertT7Publication(identity('bridge'), { releases: [] }))
      .toThrow('select every active platform');
  });

  it('keeps scoped releases away from repository latest after a complete bridge', () => {
    expect(resolveReleasePublication(identity('scoped'), BRIDGE_MANIFEST))
      .toEqual({ bridgeVersion: '0.8.0', makeLatest: false, mode: 'scoped' });
    expect(() => resolveReleasePublication(identity('scoped'), { releases: [] }))
      .toThrow('requires a compatibility bridge version');
  });

  it('keeps historical intent out of T7 and freezes published platform scope', () => {
    expect(() => assertT7Publication(identity('legacy'), BRIDGE_MANIFEST)).toThrow('historical only');
    const manifest = {
      ...BRIDGE_MANIFEST,
      latest: '0.9.0',
      releases: [...BRIDGE_MANIFEST.releases, { version: '0.9.0', platforms: ['windows'] }]
    };
    expect(assertPublishedManifestScope({ identity: identity('scoped'), manifest }))
      .toEqual({ bridgeVersion: '0.8.0', makeLatest: false, mode: 'scoped' });
    expect(() => assertPublishedManifestScope({
      identity: identity('scoped'),
      manifest: { ...manifest, releases: [...BRIDGE_MANIFEST.releases, { version: '0.9.0', platforms: ['macos'] }] }
    })).toThrow('platforms must exactly match');
  });
});
