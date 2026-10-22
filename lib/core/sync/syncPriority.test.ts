import { expect, it } from 'vitest';

import { SYNC_PRIORITY_TIER, selectSyncUpstream } from './syncPriority.js';

const device = (deviceId: string, tier: number = SYNC_PRIORITY_TIER.desktop) => ({ deviceId, tier });

it('picks the highest-ranked reachable device above itself and none for the top device', () => {
  const peers = [device('b'), device('d'), device('a', SYNC_PRIORITY_TIER.mobile)];
  expect(selectSyncUpstream(device('c'), peers, peer => peer)).toEqual(device('d'));
  expect(selectSyncUpstream(device('e'), peers, peer => peer)).toBeNull();
  expect(selectSyncUpstream(device('z', SYNC_PRIORITY_TIER.mobile), peers, peer => peer)).toEqual(device('d'));
});

it('ranks a foreground desktop above every device ID', () => {
  const foreground = device('a', SYNC_PRIORITY_TIER.foregroundDesktop);
  expect(selectSyncUpstream(device('z'), [device('y'), foreground], peer => peer)).toEqual(foreground);
  expect(selectSyncUpstream(foreground, [device('z')], peer => peer)).toBeNull();
});
