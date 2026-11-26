import { describe, expect, it } from 'vitest';

import type { FramedSyncInventoryDifference } from './framedSyncInventory.js';
import type { RequestSyncInventoryAnalysis } from './requestSyncInventoryAnalysis.js';
import { requestSyncRejection, requestSyncRoundUnsynced } from './requestSyncRoundUnsynced.js';
import { mergeSyncUnsyncedItems, syncUnsyncedCode, type SyncUnsyncedItem } from './syncUnsyncedItems.js';

const difference = (globalId: string, direction: 'local_to_remote' | 'remote_to_local' = 'local_to_remote') =>
  ({ objectType: 'node', globalId, direction }) as FramedSyncInventoryDifference;
const item = (globalId: string): SyncUnsyncedItem => ({ objectType: 'node', globalId, code: 'sync_item_failed',
  side: 'peer', stage: 'apply', firstSeenAt: '2026-01-01T00:00:00.000Z' });
const analysis = (differences: FramedSyncInventoryDifference[], unready: RequestSyncInventoryAnalysis['unready'] = new Map()) =>
  ({ differences, unready, stateUnchanged: true, pending: differences.length });

describe('sync unsynced record', () => {
  it('keeps only stable codes and never free exception text', () => {
    expect(syncUnsyncedCode('framed_sync_http_400:request_sync_version_missing:private-id')).toBe('request_sync_version_missing');
    expect(syncUnsyncedCode('UNIQUE constraint failed: nodes.title')).toBe('sync_item_constraint_failed');
    expect(syncUnsyncedCode('Cannot read /Users/someone/secret')).toBe('sync_item_failed');
  });

  it('names the side that failed from the direction and stage', () => {
    expect(requestSyncRejection(difference('a'), 'x', 'prepare').side).toBe('self');
    expect(requestSyncRejection(difference('a'), 'x', 'apply').side).toBe('peer');
    expect(requestSyncRejection(difference('a', 'remote_to_local'), 'x', 'apply').side).toBe('self');
  });

  it('keeps the first-seen time, keeps unattempted items and drops resolved ones', () => {
    const rejected = new Map([['a', requestSyncRejection(difference('a'), 'sync_item_failed')]]);
    const update = requestSyncRoundUnsynced(analysis([difference('a'), difference('waiting')]), rejected);
    const next = mergeSyncUnsyncedItems([item('a'), item('resolved'), item('waiting')], update, '2026-02-02T00:00:00.000Z');
    expect(next?.map(value => [value.globalId, value.firstSeenAt])).toEqual(
      [['a', '2026-01-01T00:00:00.000Z'], ['waiting', '2026-01-01T00:00:00.000Z']]);
    expect(mergeSyncUnsyncedItems([item('resolved')], requestSyncRoundUnsynced(analysis([]), new Map()))).toEqual([]);
  });

  it('records items one side cannot publish yet', () => {
    const unready = new Map([['node\0u', { objectType: 'node', globalId: 'u', side: 'remote' as const }]]);
    expect(requestSyncRoundUnsynced(analysis([], unready), new Map()).failed)
      .toEqual([{ objectType: 'node', globalId: 'u', code: 'sync_item_unready', side: 'peer', stage: 'inventory' }]);
  });
});
