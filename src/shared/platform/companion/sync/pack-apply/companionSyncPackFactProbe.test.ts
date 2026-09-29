import { expect, it, vi } from 'vitest';

import { DesktopSyncHttpError } from '../../../companionDesktopSyncHttp';

import { prepareCompanionSyncPackFactRequest } from './companionSyncPackFactProbe';

const fetchDesktopJson = vi.hoisted(() => vi.fn());
const read = vi.hoisted(() => vi.fn());
vi.mock('../../../companionDesktopSyncHttp', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../companionDesktopSyncHttp')>(),
  fetchDesktopJson
}));
vi.mock('../../runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({ read })
}));
vi.mock('../../network/signedRequest', () => ({ createSignedRequestHeaders: async () => ({}) }));

it('restarts a stale fixed frontier from the same applied cursor', async () => {
  read.mockResolvedValue(null);
  fetchDesktopJson.mockReset()
    .mockRejectedValueOnce(new DesktopSyncHttpError('stale', { status: 409,
      path: '/companion/sync-pack-facts',
      body: '{"error":"sync_pack_source_view_unavailable"}' }))
    .mockResolvedValueOnce({ source_view_id: 'view', complete: true, ready: true,
      from_state_seq: 399, to_state_seq: 400, frontier_state_seq: 404,
      source_epoch: 'epoch' });
  const prepared = await prepareCompanionSyncPackFactRequest(
    'http://desktop.local/companion/sync-pack?after_state_seq=399&page_contract=bounded-v1&frontier_state_seq=401&source_epoch=epoch',
    { groupId: 'group', peerId: 'peer' });
  expect(fetchDesktopJson.mock.calls.map((call) => call[1])).toEqual([
    '/companion/sync-pack-facts?after_state_seq=399&page_contract=bounded-v1&frontier_state_seq=401&source_epoch=epoch',
    '/companion/sync-pack-facts?after_state_seq=399&page_contract=bounded-v1'
  ]);
  expect(new URL(prepared.url).searchParams.get('frontier_state_seq')).toBe('404');
  expect(prepared.roundRebased).toBe(true);
  expect(new URL(prepared.url).searchParams.get('after_state_seq')).toBe('399');
});

it('resumes a saved fact view with its own frontier after the receive frontier has grown', async () => {
  read.mockResolvedValue({ sourceViewId: 'saved-view', window: {
    from_state_seq: 484, to_state_seq: 485, frontier_state_seq: 531, source_epoch: 'epoch'
  } });
  fetchDesktopJson.mockReset().mockResolvedValue({ source_view_id: 'saved-view',
    complete: true, ready: true, from_state_seq: 484, to_state_seq: 485,
    frontier_state_seq: 531, source_epoch: 'epoch' });
  const prepared = await prepareCompanionSyncPackFactRequest(
    'http://desktop.local/companion/sync-pack?after_state_seq=484&page_contract=bounded-v1&frontier_state_seq=503&source_epoch=epoch',
    { groupId: 'group', peerId: 'peer' });
  expect(fetchDesktopJson.mock.calls[0]?.[1]).toContain('frontier_state_seq=531');
  expect(fetchDesktopJson.mock.calls[0]?.[1]).toContain('fact_view=saved-view');
  expect(new URL(prepared.url).searchParams.get('frontier_state_seq')).toBe('531');
  expect(prepared.roundRebased).toBe(true);
});
