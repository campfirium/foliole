// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  events: [] as string[],
  setCursor: vi.fn(),
  peer: {
    endpoint_url: 'http://desktop-a:38641', group_id: 'group-1', local_device_id: 'desktop-b',
    peer_device_id: 'desktop-a', peer_device_kind: 'darwin', peer_device_name: 'Mac', timeline_id: 'timeline-1'
  }
}));

vi.mock('../../lib/core/database/syncState.js', () => ({
  getPeerCursor: () => '11',
  setPeerCursor: (...args: unknown[]) => {
    runtime.events.push('cursor');
    return runtime.setCursor(...args);
  }
}));
vi.mock('../../lib/platform/syncProtocolContract.js', () => ({ CURRENT_SYNC_PROTOCOL_DESCRIPTOR: {} }));
vi.mock('../database/connection.js', () => ({ openDatabaseConnection: () => ({ driver: {} }) }));
vi.mock('../database/syncGroupStore.js', () => ({
  joinDesktopSyncGroup: vi.fn(),
  loadDesktopSyncGroup: () => ({ group_id: 'group-1', local_member_state: 'active' })
}));
vi.mock('./companionMdnsAdvertisement.js', () => ({ refreshCompanionMdnsAdvertisement: vi.fn() }));
vi.mock('./companionPairingStore.js', () => ({
  loadPairedSyncGroupPeers: () => [runtime.peer], savePairedSyncGroupPeer: vi.fn()
}));
vi.mock('./desktopCompanionSyncPreference.js', () => ({ isDesktopCompanionSyncParticipating: () => true }));
vi.mock('./desktopSyncGroupCursorCommit.js', () => ({
  reportDesktopSyncGroupCursorCommitted: vi.fn(async () => { runtime.events.push('commit'); })
}));
vi.mock('./desktopSyncGroupPackApply.js', () => ({
  downloadAndApplyDesktopSyncGroupPack: vi.fn(async () => { runtime.events.push('apply'); return 17; })
}));
vi.mock('./desktopSyncPackAck.js', () => ({
  postDesktopSyncPackAck: vi.fn(async () => { runtime.events.push('ack'); return { status: 'ok' }; })
}));
vi.mock('./desktopSyncGroupPeerSingleFlight.js', () => ({
  runDesktopSyncGroupPeerSingleFlight: (_peerId: string, execute: () => Promise<unknown>) => execute()
}));
vi.mock('./desktopSyncGroupResources.js', () => ({
  assertDesktopSyncGroupResourcesComplete: vi.fn(),
  downloadDesktopSyncGroupResources: vi.fn(async () => { runtime.events.push('resources'); })
}));

import { continueDesktopSyncGroupSync } from './desktopSyncGroupJoin.js';

beforeEach(() => {
  runtime.events.length = 0;
  runtime.setCursor.mockReset();
});

it('acknowledges a received pack only after apply and cursor persistence', async () => {
  await continueDesktopSyncGroupSync(runtime.peer as never);

  expect(runtime.events).toEqual(['apply', 'cursor', 'ack', 'commit', 'resources']);
});

it('does not acknowledge when cursor persistence fails', async () => {
  runtime.setCursor.mockImplementationOnce(() => { throw new Error('cursor_write_failed'); });

  await expect(continueDesktopSyncGroupSync(runtime.peer as never)).rejects.toThrow('cursor_write_failed');
  expect(runtime.events).toEqual(['apply', 'cursor']);
});
