// @vitest-environment node
import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import type { CanonicalFact } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';

const mocks = vi.hoisted(() => ({
  applyNode: vi.fn(), applyRelations: vi.fn(), commitReceipt: vi.fn(),
  inventory: vi.fn(), restoreNode: vi.fn()
}));

vi.mock('../../lib/core/sync/framedSyncInventoryRead.js', () => ({
  readFramedSyncInventoryEntry: mocks.inventory
}));
vi.mock('../../lib/core/sync/syncNodeApplyExecutor.js', () => ({
  applySyncNodesWithDbPort: mocks.applyNode
}));
vi.mock('../database/desktopFramedSyncRelationReviewApply.js', () => ({
  applyDesktopFramedSyncRelationReviewFactsWithDbPort: mocks.applyRelations
}));
vi.mock('../database/desktopFramedSyncStaging.js', () => ({
  createDesktopFramedSyncStaging: () => ({ commitApplyAndReceipt: mocks.commitReceipt })
}));
vi.mock('./desktopFramedSyncNodeProjection.js', () => ({
  restoreDesktopFramedSyncNodeRecord: mocks.restoreNode
}));

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
      groupId: 'group', protocolVersion: 22, receiverDeviceId: 'receiver',
      receiverLibraryEpoch: 'epoch-r', senderDeviceId: 'sender', senderLibraryEpoch: 'epoch-s'
    },
    db: { transaction: vi.fn() } as unknown as DbPort,
    facts, factCount: BigInt(facts.length),
    frame: {
      attemptId: new Uint8Array(16), authenticatedPlaintext: new Uint8Array(),
      ciphertext: new Uint8Array(), frameHeader: new Uint8Array(), frameType: 5,
      preamble: new Uint8Array(), sequence: 0n, transferId: hash(9)
    },
    manifestHash: hash(8), resources: { complete: vi.fn() },
    staging: {} as FramedSyncStagingPort
  });
}

it.each([
  ['unsupported tombstone fact', [fact(5)]],
  ['facts from multiple nodes', [fact(3), fact(4, 'node-b')]]
])('rejects %s before staging or applying', async (_name, facts) => {
  await expect(finish(facts, [])).rejects.toThrow('framed_sync_process_fact_set_invalid');
});

it('atomically applies multiple versions of the same node', async () => {
  vi.clearAllMocks();
  const firstDescriptor = { byteLength: 1n, required: true, role: 1, sha256: hash(1) };
  const secondDescriptor = { byteLength: 1n, required: true, role: 1, sha256: hash(2) };
  const first = fact(2, 'node-a', [firstDescriptor]);
  const second = { ...fact(2, 'node-a', [secondDescriptor]), factId: 'version-2' };
  mocks.restoreNode.mockImplementation(({ manifest }) => ({
    object_id: 'node-a', version_id: manifest.facts[0].factId
  }));
  mocks.inventory.mockResolvedValue({ sharedStateHash: hash(7) });
  mocks.commitReceipt.mockImplementation(async (value) => value);
  const staging = {
    commitAuthenticatedFrame: vi.fn(), finalizeInboundAttempt: vi.fn(),
    markReadyToApply: vi.fn(), releasePins: vi.fn(), verifyAndMarkBlobAvailable: vi.fn()
  } as unknown as FramedSyncStagingPort;
  const db = { transaction: (task: (tx: DbPort) => unknown) => task({} as DbPort) } as DbPort;

  await finishDesktopFramedSyncTransfer({
    blobs: [
      { data: Uint8Array.of(1), sha256: firstDescriptor.sha256 },
      { data: Uint8Array.of(2), sha256: secondDescriptor.sha256 }
    ], blobCount: 2n,
    context: {
      groupId: 'group', protocolVersion: 22, receiverDeviceId: 'receiver',
      receiverLibraryEpoch: 'epoch-r', senderDeviceId: 'sender', senderLibraryEpoch: 'epoch-s'
    },
    db, facts: [first, second], factCount: 2n,
    frame: {
      attemptId: new Uint8Array(16), authenticatedPlaintext: new Uint8Array(),
      ciphertext: new Uint8Array(), frameHeader: new Uint8Array(), frameType: 5,
      preamble: new Uint8Array(), sequence: 0n, transferId: hash(9)
    },
    manifestHash: hash(8), resources: { complete: vi.fn() }, staging
  });

  expect(mocks.applyNode).toHaveBeenCalledWith(expect.anything(), [
    expect.objectContaining({ version_id: first.factId }),
    expect.objectContaining({ version_id: second.factId })
  ]);
});

it('rejects a node fact whose blob content set does not match', async () => {
  const descriptor = { byteLength: 1n, required: true, role: 1, sha256: hash(1) };
  await expect(finish([fact(2, 'node-a', [descriptor])], [
    { data: Uint8Array.of(1), sha256: hash(2) }
  ])).rejects.toThrow('framed_sync_blob_content_set_mismatch');
});

it('writes the actual post-apply node state hash into the receipt', async () => {
  const descriptor = { byteLength: 1n, required: true, role: 1, sha256: hash(1) };
  const incoming = fact(2, 'node-a', [descriptor]);
  const appliedStateHash = hash(7);
  mocks.inventory.mockResolvedValue({ sharedStateHash: appliedStateHash });
  mocks.restoreNode.mockReturnValue({ object_id: 'node-a' });
  mocks.commitReceipt.mockImplementation(async (value) => value);
  const staging = {
    commitAuthenticatedFrame: vi.fn(), finalizeInboundAttempt: vi.fn(),
    markReadyToApply: vi.fn(), releasePins: vi.fn(), verifyAndMarkBlobAvailable: vi.fn()
  } as unknown as FramedSyncStagingPort;
  const db = {
    transaction: (task: (tx: DbPort) => unknown) => task({} as DbPort)
  } as DbPort;

  await finishDesktopFramedSyncTransfer({
    blobs: [{ data: Uint8Array.of(1), sha256: descriptor.sha256 }], blobCount: 1n,
    context: {
      groupId: 'group', protocolVersion: 22, receiverDeviceId: 'receiver',
      receiverLibraryEpoch: 'epoch-r', senderDeviceId: 'sender', senderLibraryEpoch: 'epoch-s'
    },
    db, facts: [incoming], factCount: 1n,
    frame: {
      attemptId: new Uint8Array(16), authenticatedPlaintext: new Uint8Array(),
      ciphertext: new Uint8Array(), frameHeader: new Uint8Array(), frameType: 5,
      preamble: new Uint8Array(), sequence: 0n, transferId: hash(9)
    },
    manifestHash: hash(8), resources: { complete: vi.fn() }, staging
  });

  expect(mocks.commitReceipt).toHaveBeenCalledWith(expect.objectContaining({ appliedStateHash }));
  expect(mocks.commitReceipt).not.toHaveBeenCalledWith(expect.objectContaining({
    appliedStateHash: incoming.sharedStateHash
  }));
});
