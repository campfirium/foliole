// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createDesktopFramedSyncFiles } from '../../../electron/sync/desktopFramedSyncFiles.js';

import { encodeFramedSyncStream, readFramedSyncStream } from './framedSyncBinaryStream.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from './framedSyncContract.js';
import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { inventoryBucket, summarizeInventoryBuckets } from './framedSyncInventoryBuckets.js';
import { compareInventoryEntry } from './framedSyncInventoryDigest.js';
import { framedSyncInventorySummary } from './framedSyncInventorySummary.js';
import { exchangeRequestSyncInventory, type RequestSyncExchange } from './requestSyncDatabaseExchange.js';
import { decodeRequestSyncInventory, iterateRequestSyncInventory } from './requestSyncInventoryWire.js';
import { prepareRequestSyncWire, readRequestSyncWire } from './requestSyncWire.js';

it.each([false, true])('retrieves complete details including a newer bucket snapshot (changed=%s)', async sourceChanges => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'request-detail-'));
  const files = createDesktopFramedSyncFiles(root);
  const entries: FramedSyncInventoryEntry[] = Array.from({ length: 2100 }, (_, index) => ({
    globalId: `${index}-${'n'.repeat(500)}`, objectType: 'node', sharedStateHash: new Uint8Array(32),
    frontierFactIds: [`v${index}`], requiredRelationIds: [], reviewFactIds: [], resourceHashes: [],
    stateFactIds: [], currentVersionId: `v${index}`, versionStates: [`v${index}:body`], unready: false
  })).sort(compareInventoryEntry);
  const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    initiatorDeviceId: 'local', initiatorLibraryEpoch: 'local-epoch',
    responderDeviceId: 'peer', responderLibraryEpoch: 'peer-epoch' } as const;
  const groupKey = new Uint8Array(32).fill(7);
  const exchange: RequestSyncExchange = { context, groupKey, request: async (_path, body, consume) => {
    const request = await decodeRequestSyncInventory((async function* () {
      for await (const decoded of readRequestSyncWire({ context, groupKey, ...body })) yield decoded.message;
    })());
    expect(request.entries).toEqual([]);
    if (sourceChanges && request.selectedBuckets.length) entries[0] = { ...entries[0]!, sharedStateHash: new Uint8Array(32).fill(2) };
    const ids = new Set(request.detailGlobalIds);
    const selected = ids.size ? entries.filter(entry => ids.has(entry.globalId)) :
      framedSyncInventorySummary(entries.filter(entry => request.selectedBuckets.includes(inventoryBucket(entry))));
    const buckets = summarizeInventoryBuckets(entries);
    const response = await prepareRequestSyncWire({ context, groupKey,
      messages: async function* () { yield* iterateRequestSyncInventory({ entries: request.bucketSummary ? [] : selected, roundId: request.roundId,
        ...(request.bucketSummary ? { bucketSummary: true, bucketHashes: buckets.hashes, unreadyBuckets: buckets.unready } : {}) }); } });
    try { return await consume(await readFramedSyncStream(encodeFramedSyncStream(response))); }
    finally { await response.frames.return(undefined); }
  } };
  try {
    const result = exchangeRequestSyncInventory({ files,
      readSnapshot: async () => { throw new Error('unexpected_snapshot'); },
      write: async () => { throw new Error('unexpected_write'); }
    }, exchange, entries.map(entry => ({ ...entry, sharedStateHash: new Uint8Array(32).fill(1) })));
    expect((await result).remote).toEqual(entries);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);
