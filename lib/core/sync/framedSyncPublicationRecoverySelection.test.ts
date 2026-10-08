import { expect, it } from 'vitest';

import { FRAMED_SYNC_PROTOCOL_VERSION } from './framedSyncContract.js';
import type { FramedSyncInventoryDifference } from './framedSyncInventory.js';
import { selectFramedSyncRecoveryManifest } from './framedSyncPublicationRecoverySelection.js';
import { projectFramedSyncResourceFact } from './framedSyncResourceFact.js';
import type { OutboundPublishInput } from './framedSyncStagingContract.js';

const digest = (value: number) => new Uint8Array(32).fill(value);
const binding = { demandId: 'demand-1', bodyHash: 'a'.repeat(64), globalId: 'article',
  sharedStateHash: digest(3), versionId: 'adopted-version' };
const resourceFact = (value: number) => {
  const hash = Buffer.from(digest(value)).toString('hex');
  return projectFramedSyncResourceFact(binding,
    { contentHash: hash, storageKey: `${hash}.png`, role: 2 }, 123n);
};

function publication(): OutboundPublishInput {
  const facts = [resourceFact(1), resourceFact(2)];
  return {
    contentId: digest(4), manifestHash: digest(4), transferId: digest(5),
    context: { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
      senderDeviceId: 'sender', senderLibraryEpoch: 'sender-epoch',
      receiverDeviceId: 'receiver', receiverLibraryEpoch: 'receiver-epoch' },
    manifest: { facts, blobs: facts.flatMap((fact) => fact.blobs) }
  };
}

function difference(hashes = [digest(2)]): FramedSyncInventoryDifference {
  return {
    direction: 'local_to_remote', globalId: binding.globalId, objectType: 'node',
    need: { frontierFactIds: [], requiredRelationIds: [], resourceHashes: hashes,
      reviewFactIds: [], sharedState: false },
    sourceSnapshot: { frontierFactIds: [binding.versionId], globalId: binding.globalId,
      objectType: 'node', requiredRelationIds: [], resourceHashes: [digest(1), digest(2)],
      reviewFactIds: [], sharedStateHash: binding.sharedStateHash }
  };
}

it('retries only missing attachment bytes from the frozen publication without sending article facts', () => {
  const original = publication();
  const selected = selectFramedSyncRecoveryManifest(original, difference());
  expect(selected.facts).toEqual([original.manifest.facts[1]]);
  expect(selected.blobs).toEqual(original.manifest.facts[1]!.blobs);
  expect(selected.facts[0]!.body).toEqual(original.manifest.facts[1]!.body);
  expect(selected.blobs.every((blob) => blob.role === 2)).toBe(true);
});

it('cannot borrow a resource fact belonging to another article', () => {
  expect(() => selectFramedSyncRecoveryManifest(publication(),
    { ...difference(), globalId: 'other-article' })).toThrow('framed_sync_recovery_fact_unavailable');
});

it('does not substitute other attachment bytes for a missing hash', () => {
  expect(() => selectFramedSyncRecoveryManifest(publication(), difference([digest(6)])))
    .toThrow('framed_sync_recovery_fact_unavailable');
});
