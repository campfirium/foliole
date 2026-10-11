import { framedSyncInboundDirectory, requireFramedSyncFileInbound,
  writeFramedSyncFileInbound } from './framedSyncFileInboundRecord.js';
import type { FramedSyncFilePort } from './framedSyncFilePort.js';
import { streamFramedSyncFileFacts } from './framedSyncFileReadyFacts.js';
import { completeFramedSyncFileResourceDemand } from './framedSyncFileResourceDemands.js';
import { createFramedSyncFileStaging } from './framedSyncFileStaging.js';
import { FRAMED_SYNC_RESOURCE_FACT_KIND } from './framedSyncResourceFact.js';

export async function finishFramedSyncFileCompletion(files: FramedSyncFilePort, transferId: Uint8Array) {
  await files.exclusive(framedSyncInboundDirectory(transferId), async () => {
    const record = await requireFramedSyncFileInbound(files, transferId);
    if (!record.receipt || !record.header || record.state !== 'applied') throw new Error('applied_transfer_required_for_pin_release');
    if (record.resourceDemandsCompleted) return;
    for await (const { fact } of streamFramedSyncFileFacts(files, { transferId, attemptId: record.header.attemptId })) {
      if (fact.kind === FRAMED_SYNC_RESOURCE_FACT_KIND) {
        await completeFramedSyncFileResourceDemand(files, record.proposal.context, fact, record.receipt);
      }
    }
    await writeFramedSyncFileInbound(files, { ...record, resourceDemandsCompleted: true });
  });
  await createFramedSyncFileStaging(files).releasePins(transferId, 'business_reference_committed');
}
