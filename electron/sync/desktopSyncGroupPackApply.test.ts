import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';

import {
  collectSyncPackAppliedEvent,
  fetchDesktopSyncGroupPackBody
} from './desktopSyncGroupPackApply.js';

it('reports applied pack identities so the renderer reloads committed sync facts', async () => {
  const query = vi.fn()
    .mockResolvedValueOnce([{ id: 'node-a' }, { id: 'node-a' }, { id: 'node-b' }])
    .mockResolvedValueOnce([
      { object_id: 'node-a', object_type: 'node_reading' },
      { object_id: 'node-a', object_type: 'node_reading' },
      { object_id: 'attachment-a', object_type: 'attachment' }
    ]);

  await expect(collectSyncPackAppliedEvent({ query } as unknown as DbPort, {
    applied: true, appliedBlobCount: 1, appliedGroupFactCount: 3,
    appliedObjectCount: 4, appliedReviewOpIds: ['review-a'],
    fromStateSeq: 0, handledConflictCount: 0, toStateSeq: 4
  })).resolves.toEqual({
    appliedNodeIds: ['node-a', 'node-b'],
    appliedObjectIds: ['node_reading:node-a', 'attachment:attachment-a'],
    appliedReviewOpIds: ['review-a']
  });
});

it('does not report a replayed pack as a new workspace change', async () => {
  const query = vi.fn();
  await expect(collectSyncPackAppliedEvent({ query } as unknown as DbPort, {
    applied: false, appliedBlobCount: 0, appliedGroupFactCount: 0,
    appliedObjectCount: 0, appliedReviewOpIds: [],
    fromStateSeq: 4, handledConflictCount: 0, toStateSeq: 4
  })).resolves.toEqual({ appliedNodeIds: [], appliedObjectIds: [], appliedReviewOpIds: [] });
  expect(query).not.toHaveBeenCalled();
});

it.each(['headers', 'body'])('cancels a structure pack stalled at %s', async (stage) => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
    const stalled = new Promise<never>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
    if (stage === 'headers') return stalled;
    return Promise.resolve({
      ok: true,
      headers: { get: () => 'application/vnd.foliole.workgroup-aead+json' },
      arrayBuffer: () => stalled
    } as unknown as Response);
  });
  try {
    await expect(fetchDesktopSyncGroupPackBody({
      groupId: 'group-1', headers: {}, pathWithQuery: '/companion/sync-pack?after_state_seq=0',
      timeoutMs: 5, url: 'http://peer/companion/sync-pack?after_state_seq=0'
    })).rejects.toThrow('sync_group_structure_pack_timeout');
  } finally {
    fetchMock.mockRestore();
  }
});
