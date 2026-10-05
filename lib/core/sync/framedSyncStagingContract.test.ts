import { describe, expect, it } from 'vitest';

import {
  canonicalContentId,
  canonicalTransferId,
  type CanonicalManifest
} from './framedSyncCanonicalManifest.js';
import {
  FRAMED_SYNC_PROTOCOL_VERSION,
  type FramedSyncContext
} from './framedSyncContract.js';
import {
  assertInboundManifestMatchesProposal,
  assertInboundHeaderMatchesProposal,
  assertInboundProposalLimits,
  assertOutboundPublication,
  type InboundHeaderDeclarationInput,
  type InboundProposalInput,
  type OutboundPublishInput
} from './framedSyncStagingContract.js';

const digest = (value: number) => new Uint8Array(32).fill(value);
const context: FramedSyncContext = {
  groupId: 'group-a', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
  receiverDeviceId: 'device-b', receiverLibraryEpoch: 'epoch-b',
  senderDeviceId: 'device-a', senderLibraryEpoch: 'epoch-a'
};

function manifest(): CanonicalManifest {
  return {
    blobs: [],
    facts: [1, 2].map((index) => ({
      blobs: [], body: [], factId: 'same-fact-id', globalId: `node-${index}`,
      kind: 2, objectType: 'node', sharedStateHash: digest(index)
    }))
  };
}

async function publication(): Promise<OutboundPublishInput> {
  const value = manifest();
  const contentId = await canonicalContentId(value);
  return {
    contentId, context, manifest: value, manifestHash: contentId,
    transferId: await canonicalTransferId(context, contentId)
  };
}

async function proposal(): Promise<InboundProposalInput> {
  const value = await publication();
  return {
    blobCount: 0n, contentId: value.contentId, context,
    factCount: 2n, totalBlobBytes: 0n, transferId: value.transferId
  };
}

function header(
  admitted: InboundProposalInput,
  value: OutboundPublishInput
): InboundHeaderDeclarationInput {
  return {
    attemptId: new Uint8Array(16),
    blobs: value.manifest.blobs,
    facts: value.manifest.facts.map((fact) => ({
      factId: fact.factId, globalId: fact.globalId, kind: fact.kind, objectType: fact.objectType,
      requiredBlobHashes: fact.blobs.filter((blob) => blob.required).map((blob) => blob.sha256),
      sharedStateHash: fact.sharedStateHash
    })),
    proposal: admitted,
    published: {
      blobCount: admitted.blobCount, contentId: admitted.contentId, context,
      factCount: admitted.factCount, manifestHash: admitted.contentId,
      totalBlobBytes: admitted.totalBlobBytes, transferId: admitted.transferId
    },
    reservationId: 'reservation-1'
  };
}

describe('framed sync staging boundary', () => {
  it('publishes full compound fact identities from one structured manifest', async () => {
    const value = await publication();
    await expect(assertOutboundPublication(value)).resolves.toMatchObject({
      contentId: value.contentId,
      transferId: value.transferId
    });
    expect(value.manifest.facts.map((fact) => [
      fact.kind, fact.objectType, fact.globalId, fact.factId
    ])).toEqual([
      [2, 'node', 'node-1', 'same-fact-id'],
      [2, 'node', 'node-2', 'same-fact-id']
    ]);
    await expect(assertOutboundPublication({
      ...value, transferId: digest(9)
    })).rejects.toThrow('outbound_transfer_identity_mismatch');
  });

  it('admits bounded proposals and exactly matches the decoded header manifest', async () => {
    const admitted = await proposal();
    const value = await publication();
    const declaration = header(admitted, value);
    expect(() => assertInboundProposalLimits(admitted)).not.toThrow();
    expect(() => assertInboundHeaderMatchesProposal(declaration)).not.toThrow();
    expect(() => assertInboundHeaderMatchesProposal({
      ...declaration,
      published: {
        ...declaration.published, factCount: 3n
      }
    })).toThrow('inbound_header_proposal_mismatch');
    await expect(assertInboundManifestMatchesProposal({
      attemptId: new Uint8Array(16), header: declaration, proposal: admitted, publication: value,
      reservationId: 'reservation-1'
    })).resolves.toBeUndefined();
    await expect(assertInboundManifestMatchesProposal({
      attemptId: new Uint8Array(16), header: declaration,
      proposal: { ...admitted, factCount: 3n },
      publication: value, reservationId: 'reservation-1'
    })).rejects.toThrow('inbound_manifest_proposal_mismatch');
    await expect(assertInboundManifestMatchesProposal({
      attemptId: new Uint8Array(16), header: declaration,
      proposal: {
        ...admitted, context: { ...admitted.context, receiverDeviceId: 'device-c' }
      },
      publication: value, reservationId: 'reservation-1'
    })).rejects.toThrow('inbound_manifest_proposal_mismatch');
    await expect(assertInboundManifestMatchesProposal({
      attemptId: new Uint8Array(16),
      header: { ...declaration, facts: declaration.facts.map((fact, index) =>
        index === 0 ? { ...fact, factId: 'other' } : fact) },
      proposal: admitted, publication: value, reservationId: 'reservation-1'
    })).rejects.toThrow('inbound_manifest_header_mismatch');
  });
});
