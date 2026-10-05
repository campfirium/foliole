// @vitest-environment node
import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import type { CanonicalFact } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';

import { finishDesktopFramedSyncTransfer } from './desktopFramedSyncProcessInbound.js';

const hash = (value: number) => new Uint8Array(32).fill(value);
const fact = (kind: number, globalId = 'node-a', blobs: CanonicalFact['blobs'] = []): CanonicalFact => ({
  blobs, body: [], factId: `fact-${kind}-${globalId}`, globalId, kind,
  objectType: 'node', sharedStateHash: hash(kind)
});

function finish(facts: readonly CanonicalFact[], blobs: Parameters<typeof finishDesktopFramedSyncTransfer>[0]['blobs']) {
  return finishDesktopFramedSyncTransfer({
    blobs, blobCount: BigInt(blobs.length),
    context: {
      groupId: 'group', protocolVersion: 21, receiverDeviceId: 'receiver',
      receiverLibraryEpoch: 'epoch-r', senderDeviceId: 'sender', senderLibraryEpoch: 'epoch-s'
    },
    db: { transaction: vi.fn() } as unknown as DbPort,
    facts, factCount: BigInt(facts.length),
    frame: {
      attemptId: new Uint8Array(16), authenticatedPlaintext: new Uint8Array(),
      ciphertext: new Uint8Array(), frameHeader: new Uint8Array(), frameType: 5,
      preamble: new Uint8Array(), sequence: 0n, transferId: hash(9)
    },
    manifestHash: hash(8), staging: {} as FramedSyncStagingPort
  });
}

it.each([
  ['multiple node facts', [fact(2), fact(2)]],
  ['unknown fact kind', [fact(5)]],
  ['facts from multiple nodes', [fact(3), fact(4, 'node-b')]]
])('rejects %s before staging or applying', async (_name, facts) => {
  await expect(finish(facts, [])).rejects.toThrow('framed_sync_process_fact_set_invalid');
});

it('rejects a node fact whose blob content set does not match', async () => {
  const descriptor = { byteLength: 1n, required: true, role: 1, sha256: hash(1) };
  await expect(finish([fact(2, 'node-a', [descriptor])], [
    { data: Uint8Array.of(1), sha256: hash(2) }
  ])).rejects.toThrow('framed_sync_blob_content_set_mismatch');
});
