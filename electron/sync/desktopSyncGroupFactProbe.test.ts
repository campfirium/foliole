import { expect, it, vi } from 'vitest';

const fetchFacts = vi.hoisted(() => vi.fn());
const loadActive = vi.hoisted(() => vi.fn());

vi.mock('./desktopSyncGroupHttp.js', () => ({ fetchDesktopWorkgroupJson: fetchFacts }));
vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => ({ sqlite: {} }),
  runWithDatabaseConnectionOwner: (work: () => unknown) => work()
}));
vi.mock('../database/betterSqliteDbPort.js', () => ({ createBetterSqliteDbPort: () => ({}) }));
vi.mock('../../lib/core/sync/syncPackKnownFactClaims.js', () => ({
  clearSyncPackKnownFactClaims: vi.fn(),
  loadActiveSyncPackFactRound: loadActive,
  stageSyncPackKnownFactClaims: vi.fn()
}));
vi.mock('../../lib/core/sync/syncPackFactPresence.js', () => ({
  encodeSyncPackFactClaims: () => ({ versions: '', parents: '', reviews: '' }),
  probeSyncPackFactPresence: () => ({ versions: [], parents: [], reviews: [] })
}));

import { prepareDesktopSyncPackFactRequest } from './desktopSyncGroupFactProbe.js';

it('rebases a lost fact view onto a fresh single-page frontier', async () => {
  loadActive.mockReturnValue({ sourceViewId: 'old-view', window: {
    frontier_state_seq: 7, source_epoch: 'old-epoch' } });
  fetchFacts.mockReset().mockRejectedValueOnce(
    new Error('sync_group_http_409:sync_pack_source_view_unavailable')
  ).mockResolvedValueOnce({ from_state_seq: 4, to_state_seq: 5,
    frontier_state_seq: 9, source_epoch: 'new-epoch', index_id: 'new-index',
    versions: [], parents: [], reviews: [] });

  const result = await prepareDesktopSyncPackFactRequest({
    after: 4, endpointUrl: 'http://localhost:38641', frontierStateSeq: 7,
    groupId: 'group', localDeviceId: 'receiver', sourcePeerId: 'source',
    pathWithQuery: '/companion/sync-pack?after_state_seq=4&page_contract=bounded-v1' +
      '&frontier_state_seq=7&source_epoch=old-epoch',
    secret: 'test-key', sourceEpoch: 'old-epoch'
  });

  const retriedFacts = new URL(fetchFacts.mock.calls[1]![0].pathWithQuery,
    'http://localhost:38641');
  expect(retriedFacts.searchParams.has('fact_view')).toBe(false);
  expect(retriedFacts.searchParams.has('frontier_state_seq')).toBe(false);
  const pack = new URL(result.pathWithQuery, 'http://localhost:38641');
  expect(result.roundRebased).toBe(true);
  expect(pack.searchParams.getAll('frontier_state_seq')).toEqual(['9']);
  expect(pack.searchParams.getAll('source_epoch')).toEqual(['new-epoch']);
  expect(pack.searchParams.get('fact_index_id')).toBe('new-index');
});

it('uses a saved fact view frontier when the outer receive position is older', async () => {
  loadActive.mockReturnValue({ sourceViewId: 'saved-view', window: {
    frontier_state_seq: 9, source_epoch: 'epoch' } });
  fetchFacts.mockReset().mockResolvedValueOnce({ source_view_id: 'saved-view',
    complete: true, ready: true, from_state_seq: 4, to_state_seq: 5,
    frontier_state_seq: 9, source_epoch: 'epoch' });

  const result = await prepareDesktopSyncPackFactRequest({
    after: 4, endpointUrl: 'http://localhost:38641', frontierStateSeq: 7,
    groupId: 'group', localDeviceId: 'receiver', sourcePeerId: 'source',
    pathWithQuery: '/companion/sync-pack?after_state_seq=4&page_contract=bounded-v1' +
      '&frontier_state_seq=7&source_epoch=epoch',
    secret: 'test-key', sourceEpoch: 'epoch'
  });

  expect(result.roundRebased).toBe(true);
  expect(new URL(result.pathWithQuery, 'http://localhost').searchParams.get('frontier_state_seq'))
    .toBe('9');
  expect(fetchFacts.mock.calls[0]![0].pathWithQuery).toContain('fact_view=saved-view');
});
