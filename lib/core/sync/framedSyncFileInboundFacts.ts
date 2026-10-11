import { bytesToHex } from '@noble/hashes/utils.js';

import { FRAMED_SYNC_LIMITS } from './framedSyncContract.js';
import { framedSyncInboundAttemptDirectory, framedSyncInboundDirectory,
  requireFramedSyncFileInbound } from './framedSyncFileInboundRecord.js';
import type { FramedSyncFilePort } from './framedSyncFilePort.js';
import type { InboundFactInput } from './framedSyncStagingContract.js';

function factKey(input: Pick<InboundFactInput, 'transferId' | 'attemptId'>, index: number) {
  return `${framedSyncInboundAttemptDirectory(input.transferId, input.attemptId)}/facts/${index}.fact`;
}

export function createFramedSyncFileInboundFacts(files: FramedSyncFilePort) {
  return {
    async stageInboundFact(input: InboundFactInput) {
      return files.exclusive(framedSyncInboundDirectory(input.transferId), async () => {
        const record = await requireFramedSyncFileInbound(files, input.transferId, input.attemptId);
        if (record.state !== 'header_declared' || !record.header) throw new Error('inbound_header_required');
        const index = record.header.facts.findIndex((fact) => fact.factId === input.factId && fact.kind === input.factKind &&
          fact.globalId === input.globalId && fact.objectType === input.objectType);
        if (index < 0) throw new Error('inbound_fact_undeclared');
        const key = factKey(input, index);
        const prior = await files.read(key);
        if (prior) {
          if (bytesToHex(prior) !== bytesToHex(input.canonicalBytes)) throw new Error('inbound_fact_identity_conflict');
          return 'identical' as const;
        }
        await files.write(key, input.canonicalBytes);
        return 'created' as const;
      });
    },
    async loadAttemptFacts(transferId: Uint8Array, attemptId: Uint8Array) {
      const record = await requireFramedSyncFileInbound(files, transferId, attemptId);
      const facts: InboundFactInput[] = [];
      let totalBytes = 0;
      for (const [index, fact] of (record.header?.facts ?? []).entries()) {
        const canonicalBytes = await files.read(factKey({ transferId, attemptId }, index));
        totalBytes += canonicalBytes?.length ?? 0;
        if (totalBytes > FRAMED_SYNC_LIMITS.maxCanonicalManifestBytes) throw new Error('canonical_manifest_byte_limit_exceeded');
        if (canonicalBytes) facts.push({ ...fact, factKind: fact.kind, canonicalBytes, transferId, attemptId });
      }
      return facts;
    }
  };
}
