import { bytesToHex } from '@noble/hashes/utils.js';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import type { ManifestBlobDescriptor } from '../../lib/core/sync/framedSyncBlobContract.js';
import type { CanonicalFact } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import type { TransferReceiptStage } from '../../lib/core/sync/framedSyncContract.js';
import { restoreFramedSyncNodeReadingFact } from '../../lib/core/sync/framedSyncNodeReadingFact.js';
import { restoreFramedSyncNodeMetadata } from '../../lib/core/sync/framedSyncNodeRestore.js';
import { restoreFramedSyncObjectStateFact } from '../../lib/core/sync/framedSyncObjectStateFact.js';
import type { FramedSyncStagingPort } from '../../lib/core/sync/framedSyncStagingPort.js';

import type { AuthenticatedTransferFrame } from './desktopFramedSyncAuthenticatedTransferFrames.js';
import { DesktopFramedSyncInboundResourceStore } from './desktopFramedSyncInboundResourceStore.js';
import { headerFromWire } from './desktopFramedSyncProcessHeader.js';
import { admitDesktopFramedSyncTransfer } from './desktopFramedSyncProcessInbound.js';
import { loadDesktopFramedSyncReadyFacts } from './desktopFramedSyncReadyFacts.js';
import type { DesktopFramedVerifiedInbound } from './desktopFramedSyncVerifiedApply.js';

export class DesktopFramedVerifiedReceiverState {
  attemptAdmitted = false;
  readonly bodies = new Map<string, ManifestBlobDescriptor>();
  readonly facts: CanonicalFact[] = [];
  existingReceipt: TransferReceiptStage | null = null;
  published: AuthenticatedTransferFrame['published'] | null = null;
  ready: DesktopFramedVerifiedInbound | null = null;
  resources: DesktopFramedSyncInboundResourceStore | null = null;

  async admit(input: { db: DbPort; event: AuthenticatedTransferFrame; staging: FramedSyncStagingPort }) {
    const { event, staging } = input;
    const header = headerFromWire(event.decoded.payload, event.published);
    for (const blob of header.blobs) if (blob.role === 1 || blob.role === 5) {
      this.bodies.set(bytesToHex(blob.sha256), blob);
    }
    this.resources = new DesktopFramedSyncInboundResourceStore({
      attemptId: event.frame.attemptId, descriptors: header.blobs, staging,
      transferId: event.published.transferId
    });
    this.existingReceipt = await staging.loadReceipt(event.published.transferId);
    if (this.existingReceipt && await staging.loadInboundProposal(event.published.transferId)) {
      await staging.releasePins(event.published.transferId, 'business_reference_committed');
    }
    if (!this.existingReceipt) this.ready = await loadDesktopFramedSyncReadyFacts(input.db, event.published);
    if (!this.existingReceipt && !this.ready) await admitDesktopFramedSyncTransfer({
      attemptId: event.frame.attemptId, firstFrame: event.frame, header, staging
    });
    this.attemptAdmitted = !this.existingReceipt && !this.ready;
  }
}

export function verifiedReceiverNodeMetadata(facts: readonly CanonicalFact[]) {
  const first = facts[0];
  if (!first || facts.some((fact) => fact.globalId !== first.globalId || fact.objectType !== first.objectType ||
    ![1, 2, 3, 4].includes(fact.kind))) throw new Error('framed_sync_process_fact_set_invalid');
  for (const fact of facts) if (fact.kind === 1) {
    if (fact.objectType === 'node') restoreFramedSyncNodeReadingFact(fact);
    else restoreFramedSyncObjectStateFact(fact);
  }
  return facts.filter((fact) => fact.kind === 2).map(restoreFramedSyncNodeMetadata);
}
