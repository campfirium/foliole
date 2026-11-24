import { describe, expect, it } from 'vitest';

import { normalizeUpdateManifest } from './updateCheckModel';
import { isSyncWaitSatisfied, listSyncWaitTargets, resolveSyncGateMissing } from './updateSyncGate';

function manifestWith(release: Record<string, unknown>) {
  return normalizeUpdateManifest({
    releases: [{
      platforms: ['macos'],
      url: 'https://github.com/campfirium/foliole/releases/tag/v0.8.3',
      version: '0.8.3',
      ...release
    }],
    schemaVersion: 1
  });
}

describe('sync gate', () => {
  it('reports nothing for releases that keep sync intact', () => {
    expect(resolveSyncGateMissing(manifestWith({}), '0.8.3')).toEqual([]);
    expect(resolveSyncGateMissing(null, '0.8.3')).toEqual([]);
  });

  it('lists the channels that are not available yet', () => {
    const manifest = manifestWith({ mobileAvailability: { apk: true }, syncBreaking: true });
    expect(resolveSyncGateMissing(manifest, '0.8.3')).toEqual(['ios', 'googlePlay']);
    expect(resolveSyncGateMissing(manifestWith({ syncBreaking: true }), '0.8.3')).toEqual(['ios', 'googlePlay', 'apk']);
  });

  it('is clear once every channel is available', () => {
    const manifest = manifestWith({
      mobileAvailability: { apk: true, googlePlay: true, ios: true },
      syncBreaking: true
    });
    expect(resolveSyncGateMissing(manifest, '0.8.3')).toEqual([]);
  });

  it('satisfies a wait when its target is no longer missing', () => {
    expect(isSyncWaitSatisfied('ios', ['googlePlay'])).toBe(true);
    expect(isSyncWaitSatisfied('ios', ['ios', 'googlePlay'])).toBe(false);
    expect(isSyncWaitSatisfied('all', ['googlePlay'])).toBe(false);
    expect(isSyncWaitSatisfied('all', [])).toBe(true);
  });

  it('offers per-store waits and an all-platforms wait only when more than one thing is missing', () => {
    expect(listSyncWaitTargets(['ios', 'googlePlay'])).toEqual(['ios', 'googlePlay', 'all']);
    expect(listSyncWaitTargets(['ios'])).toEqual(['ios']);
    expect(listSyncWaitTargets(['apk'])).toEqual(['all']);
  });
});
