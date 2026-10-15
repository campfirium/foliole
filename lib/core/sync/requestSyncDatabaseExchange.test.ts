// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createDesktopFramedSyncFiles } from '../../../electron/sync/desktopFramedSyncFiles.js';

import { encodeFramedSyncStream, readFramedSyncStream } from './framedSyncBinaryStream.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from './framedSyncContract.js';
import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { framedSyncInventorySummary } from './framedSyncInventorySummary.js';
import { exchangeRequestSyncInventory, type RequestSyncExchange } from './requestSyncDatabaseExchange.js';
import { decodeRequestSyncInventory, iterateRequestSyncInventory } from './requestSyncInventoryWire.js';
import { prepareRequestSyncWire, readRequestSyncWire } from './requestSyncWire.js';

it('retrieves every changed object without uploading local inventories, including large detail requests', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'request-detail-'));
  const files = createDesktopFramedSyncFiles(root);
  const entries: FramedSyncInventoryEntry[] = Array.from({ length: 2100 }, (_, index) => ({
    globalId: `${index}-${'n'.repeat(500)}`, objectType: 'node', sharedStateHash: new Uint8Array(32),
    frontierFactIds: [`v${index}`], requiredRelationIds: [], reviewFactIds: [], resourceHashes: [],
    stateFactIds: [], currentVersionId: `v${index}`, versionStates: [`v${index}:body`], unready: false
  }));
  const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    initiatorDeviceId: 'local', initiatorLibraryEpoch: 'local-epoch',
    responderDeviceId: 'peer', responderLibraryEpoch: 'peer-epoch' } as const;
  const groupKey = new Uint8Array(32).fill(7);
  const exchange: RequestSyncExchange = { context, groupKey, request: async (_path, body, consume) => {
    const request = await decodeRequestSyncInventory((async function* () {
      for await (const decoded of readRequestSyncWire({ context, groupKey, ...body })) yield decoded.message;
    })());
    expect(request.entries).toEqual([]);
    const ids = new Set(request.detailGlobalIds);
    const selected = ids.size ? entries.filter(entry => ids.has(entry.globalId)) : framedSyncInventorySummary(entries);
    const response = await prepareRequestSyncWire({ context, groupKey,
      messages: async function* () { yield* iterateRequestSyncInventory({ entries: selected, roundId: request.roundId }); } });
    try { return await consume(await readFramedSyncStream(encodeFramedSyncStream(response))); }
    finally { await response.frames.return(undefined); }
  } };
  try {
    const result = await exchangeRequestSyncInventory({ files,
      readSnapshot: async () => { throw new Error('unexpected_snapshot'); },
      write: async () => { throw new Error('unexpected_write'); }
    }, exchange, entries.map(entry => ({ ...entry, sharedStateHash: new Uint8Array(32).fill(1) })));
    expect(result.remote).toEqual(entries);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);
