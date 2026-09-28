import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { DEFAULT_SYNC_PACK_PAGE_BUDGET } from '../database/syncPackPageBudget.js';

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
    applied: true, appliedTombstoneNodeIds: [], participatingArticleIds: [], appliedBlobCount: 1, appliedGroupFactCount: 3,
    appliedObjectCount: 4, appliedReviewOpIds: ['review-a'],
    fromStateSeq: 0, frontierStateSeq: 4, sourceEpoch: 'epoch-a', handledConflictCount: 0, toStateSeq: 4
  })).resolves.toEqual({
    appliedNodeIds: ['node-a', 'node-b'],
    appliedObjectIds: ['node_reading:node-a', 'attachment:attachment-a'],
    appliedReviewOpIds: ['review-a']
  });
});

it('does not report a replayed pack as a new workspace change', async () => {
  const query = vi.fn();
  await expect(collectSyncPackAppliedEvent({ query } as unknown as DbPort, {
    applied: false, appliedTombstoneNodeIds: [], participatingArticleIds: [], appliedBlobCount: 0, appliedGroupFactCount: 0,
    appliedObjectCount: 0, appliedReviewOpIds: [],
    fromStateSeq: 4, frontierStateSeq: 4, sourceEpoch: 'epoch-a', handledConflictCount: 0, toStateSeq: 4
  })).resolves.toEqual({ appliedNodeIds: [], appliedObjectIds: [], appliedReviewOpIds: [] });
  expect(query).not.toHaveBeenCalled();
});

it('reports a prior deletion applied from a pack whose state cursor is current', async () => {
  const query = vi.fn();
  await expect(collectSyncPackAppliedEvent({ query } as unknown as DbPort, {
    applied: false, appliedTombstoneNodeIds: ['node-a'], participatingArticleIds: [],
    appliedBlobCount: 0, appliedGroupFactCount: 0, appliedObjectCount: 0,
    appliedReviewOpIds: [], fromStateSeq: 4, frontierStateSeq: 4,
    sourceEpoch: 'epoch-a', handledConflictCount: 0, toStateSeq: 4
  })).resolves.toEqual({ appliedNodeIds: ['node-a'], appliedObjectIds: [], appliedReviewOpIds: [] });
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
      body: { getReader: () => ({ read: () => stalled }) }
    } as unknown as Response);
  });
  try {
    await expect(fetchDesktopSyncGroupPackBody({
      groupId: 'group-1', headers: {}, pathWithQuery: '/companion/sync-pack?after_state_seq=0',
      outputPath: '/tmp/foliole-stalled-pack-test.json',
      timeoutMs: 5, url: 'http://peer/companion/sync-pack?after_state_seq=0'
    })).rejects.toThrow('sync_group_structure_pack_timeout');
  } finally {
    fetchMock.mockRestore();
  }
});

it('stops an oversized encrypted page before writing or applying it', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-oversized-pack-test-'));
  const cancel = vi.fn(async () => undefined);
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    headers: { get: () => 'application/vnd.foliole.workgroup-aead+json' },
    body: { getReader: () => ({ cancel, read: vi.fn(async () => ({
      done: false, value: new Uint8Array(DEFAULT_SYNC_PACK_PAGE_BUDGET.transferBytes + 1)
    })) }) }
  } as unknown as Response);
  try {
    await expect(fetchDesktopSyncGroupPackBody({
      groupId: 'group-1', headers: {}, pathWithQuery: '/companion/sync-pack?after_state_seq=0',
      outputPath: path.join(tempRoot, 'encrypted.json'),
      url: 'http://peer/companion/sync-pack?after_state_seq=0'
    })).rejects.toThrow('sync_pack_encrypted_payload_limit_exceeded');
    expect(cancel).toHaveBeenCalledOnce();
  } finally {
    fetchMock.mockRestore();
    await fs.rm(tempRoot, { force: true, recursive: true });
  }
});
