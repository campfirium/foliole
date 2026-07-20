import { describe, expect, it } from 'vitest';

import {
  resolveRestoreNodeCandidates,
  type RestoreNodeCandidate
} from './nodeRestoreConflicts.js';

function candidate(overrides: Partial<RestoreNodeCandidate> = {}): RestoreNodeCandidate {
  return {
    createdAt: '2026-07-21T00:00:00.000Z',
    deletedAt: '2026-07-21T01:00:00.000Z',
    id: 'trash-node',
    importContentFingerprint: 'content-a',
    importSourceFingerprint: 'source-a',
    ...overrides
  };
}

describe('node restore conflicts', () => {
  it('selects the earliest live node with identical complete provenance', () => {
    const result = resolveRestoreNodeCandidates(['trash-node'], [
      candidate(),
      candidate({ createdAt: '2026-07-20T00:00:00.000Z', deletedAt: null, id: 'live-b' }),
      candidate({ createdAt: '2026-07-20T00:00:00.000Z', deletedAt: null, id: 'live-a' })
    ]);

    expect(result).toEqual({
      restoredNodeIds: [],
      skippedConflicts: [{ liveNodeId: 'live-a', trashNodeId: 'trash-node' }]
    });
  });

  it.each([
    { importContentFingerprint: null },
    { importSourceFingerprint: null }
  ])('restores when target provenance is incomplete: %o', (overrides) => {
    expect(resolveRestoreNodeCandidates(['trash-node'], [
      candidate(overrides),
      candidate({ deletedAt: null, id: 'live-node' })
    ])).toEqual({ restoredNodeIds: ['trash-node'], skippedConflicts: [] });
  });

  it('ignores deleted and differently fingerprinted candidates', () => {
    expect(resolveRestoreNodeCandidates(['trash-node'], [
      candidate(),
      candidate({ id: 'deleted-match' }),
      candidate({ deletedAt: null, id: 'different-content', importContentFingerprint: 'content-b' })
    ])).toEqual({ restoredNodeIds: ['trash-node'], skippedConflicts: [] });
  });
});
