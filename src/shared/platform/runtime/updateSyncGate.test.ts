import { describe, expect, it } from 'vitest';

import { normalizeMobileChannels, normalizeUpdateManifest } from '../updateCheckModel';

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

const READY = { status: 'available', version: '0.8.3' };

describe('sync gate', () => {
  it('reports nothing for releases that keep sync intact', () => {
    expect(resolveSyncGateMissing(manifestWith({}), null, '0.8.3')).toEqual([]);
    expect(resolveSyncGateMissing(null, null, '0.8.3')).toEqual([]);
  });

  it('lists the channels that are not available yet', () => {
    const manifest = manifestWith({ syncBreaking: true });
    expect(resolveSyncGateMissing(manifest, { apk: READY }, '0.8.3')).toEqual(['ios', 'googlePlay']);
    expect(resolveSyncGateMissing(manifest, null, '0.8.3')).toEqual(['ios', 'googlePlay', 'apk']);
  });

  it('treats a channel as ready only when available at the pending version or newer', () => {
    const manifest = manifestWith({ syncBreaking: true });
    const channels = {
      apk: { status: 'available', version: '0.8.4' },
      googlePlay: { status: 'update-in-review', version: '0.8.3' },
      ios: { status: 'available', version: '0.8.2' }
    };
    expect(resolveSyncGateMissing(manifest, channels, '0.8.3')).toEqual(['ios', 'googlePlay']);
  });

  it('is clear once every channel is available', () => {
    const manifest = manifestWith({ syncBreaking: true });
    expect(resolveSyncGateMissing(manifest, { apk: READY, googlePlay: READY, ios: READY }, '0.8.3')).toEqual([]);
  });

  it('reads channels from downloads.json', () => {
    expect(normalizeMobileChannels({
      platforms: { android: { status: 'available', version: '0.8.3' } },
      storeChannels: { 'android-play': { status: 'in-review', version: '0.8.3' }, ios: { status: 'available', version: '0.8.3' } }
    })).toEqual({ apk: READY, googlePlay: { status: 'in-review', version: '0.8.3' }, ios: READY });
    expect(normalizeMobileChannels({ platforms: {} })).toBeNull();
    expect(normalizeMobileChannels(null)).toBeNull();
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
