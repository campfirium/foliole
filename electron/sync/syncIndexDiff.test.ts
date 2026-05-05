import { describe, expect, it } from 'vitest';

import type { NativeSyncIndexEntry } from '../../lib/platform/nativeStorageContract.js';

import { diffSyncIndex } from '../../lib/core/sync/syncIndexDiff.js';

function createEntry(overrides: Partial<NativeSyncIndexEntry> & Pick<NativeSyncIndexEntry, 'object_id'>): NativeSyncIndexEntry {
  const { object_id, ...rest } = overrides;
  return {
    content_hash: null,
    object_id,
    object_type: 'node',
    sync_version_id: null,
    updated_at: '2026-04-21T17:00:00.000Z',
    ...rest
  };
}

describe('diffSyncIndex', () => {
  it('splits local-only, remote-only, in-sync, and inspect candidates', () => {
    const result = diffSyncIndex(
      [
        createEntry({ object_id: 'node-1', sync_version_id: 'desktop#1', content_hash: 'hash-1' }),
        createEntry({ object_id: 'node-2', sync_version_id: 'desktop#2', content_hash: 'hash-2' }),
        createEntry({ object_id: 'node-4', sync_version_id: 'desktop#4', content_hash: 'hash-4' })
      ],
      [
        createEntry({ object_id: 'node-1', sync_version_id: 'desktop#1', content_hash: 'hash-1' }),
        createEntry({ object_id: 'node-3', sync_version_id: 'phone#3', content_hash: 'hash-3' }),
        createEntry({ object_id: 'node-4', sync_version_id: 'phone#4', content_hash: 'hash-4b' })
      ]
    );

    expect(result.inSync.map((entry) => entry.object_id)).toEqual(['node-1']);
    expect(result.pushCandidates.map((entry) => entry.object_id)).toEqual(['node-2']);
    expect(result.pullCandidates.map((entry) => entry.object_id)).toEqual(['node-3']);
    expect(result.inspectCandidates).toEqual([
      expect.objectContaining({
        local: expect.objectContaining({ object_id: 'node-4' }),
        reason: 'version_mismatch',
        remote: expect.objectContaining({ object_id: 'node-4' })
      })
    ]);
  });

  it('marks same content hash with different versions as inspect candidates', () => {
    const result = diffSyncIndex(
      [createEntry({ object_id: 'node-1', sync_version_id: 'desktop#7', content_hash: 'hash-same' })],
      [createEntry({ object_id: 'node-1', sync_version_id: 'phone#3', content_hash: 'hash-same' })]
    );

    expect(result.inspectCandidates).toEqual([
      expect.objectContaining({
        reason: 'same_content_hash'
      })
    ]);
  });

  it('rejects duplicate object ids on either side', () => {
    expect(() =>
      diffSyncIndex(
        [
          createEntry({ object_id: 'node-1' }),
          createEntry({ object_id: 'node-1', sync_version_id: 'desktop#2' })
        ],
        []
      )
    ).toThrow(/duplicate local sync index entry/i);

    expect(() =>
      diffSyncIndex(
        [],
        [
          createEntry({ object_id: 'node-2' }),
          createEntry({ object_id: 'node-2', sync_version_id: 'phone#2' })
        ]
      )
    ).toThrow(/duplicate remote sync index entry/i);
  });
});
