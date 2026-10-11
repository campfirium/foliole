import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import { applyFramedFactSources } from '../../../../../../lib/core/sync/framedSyncFactApply.js';
import { finishFramedSyncFileCompletion } from '../../../../../../lib/core/sync/framedSyncFileCompletion.js';
import { framedSyncFileInboundBodyLoader } from '../../../../../../lib/core/sync/framedSyncFileInboundBodies.js';
import { requireFramedSyncFileInbound } from '../../../../../../lib/core/sync/framedSyncFileInboundRecord.js';
import type { FramedSyncFilePort } from '../../../../../../lib/core/sync/framedSyncFilePort.js';
import { loadFramedSyncFileReadySource, streamFramedSyncFileReadySourceFacts } from '../../../../../../lib/core/sync/framedSyncFileReadySource.js';
import { applyFramedSyncFileResourceSource, recordFramedSyncFileResources } from '../../../../../../lib/core/sync/framedSyncFileResourceApply.js';
import { createFramedSyncFileStaging } from '../../../../../../lib/core/sync/framedSyncFileStaging.js';
import { readFramedSyncInventoryEntry } from '../../../../../../lib/core/sync/framedSyncInventoryRead.js';
import { FRAMED_SYNC_RESOURCE_FACT_KIND } from '../../../../../../lib/core/sync/framedSyncResourceFact.js';
import { assertSyncGroupLocalPublicationAllowed } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { assertSyncGroupOverwriteInbound } from '../../../../../../lib/core/sync/syncGroupOverwriteProgress.js';
import { iosCompanionHostName } from '../../runtime/iosCompanionMutationState.js';

import type { CompanionFramedSyncApplyInput } from './companionFramedSyncApply.js';

type Input = Pick<CompanionFramedSyncApplyInput, 'transferId' | 'senderDeviceId' | 'senderLibraryEpoch' |
  'receiverDeviceId' | 'receiverLibraryEpoch'>;

async function loadTransfer(files: FramedSyncFilePort, input: Input) {
  const record = await requireFramedSyncFileInbound(files, input.transferId);
  const context = record.proposal.context;
  for (const key of ['senderDeviceId', 'senderLibraryEpoch', 'receiverDeviceId', 'receiverLibraryEpoch'] as const) {
    if (context[key] !== input[key]) throw new Error('framed_sync_transfer_context_mismatch');
  }
  if (record.receipt) return { record, source: null };
  const source = await loadFramedSyncFileReadySource(files, { context, contentId: record.proposal.contentId,
    transferId: input.transferId, manifestHash: record.proposal.contentId });
  if (!source) throw new Error('framed_sync_transfer_not_ready');
  return { record, source };
}

/** Invoked inside the existing companion writer queue, with the root business DbPort. */
export async function applyCompanionFramedSyncFileTransfers(db: DbPort, files: FramedSyncFilePort,
  inputs: readonly Input[]) {
  const transfers: Awaited<ReturnType<typeof loadTransfer>>[] = [];
  for (const input of inputs) transfers.push(await loadTransfer(files, input));
  const receipts = await db.transaction(async tx => {
    for (const { record } of transfers) {
      if (!await assertSyncGroupOverwriteInbound(tx, record.proposal.context)) await assertSyncGroupLocalPublicationAllowed(tx);
    }
    const sources = transfers.flatMap(({ source }) => source ? [source] : []);
    const business = sources.filter(source => source.entries[0]?.descriptor.kind !== FRAMED_SYNC_RESOURCE_FACT_KIND);
    await recordFramedSyncFileResources(tx, files, business.map(source => source.transferId));
    const hostName = business.some(source => source.objectType === 'setting') ? await iosCompanionHostName(tx) : undefined;
    const loadBody = framedSyncFileInboundBodyLoader(files, business);
    await applyFramedFactSources(tx, business.map(source => async function* () {
      for await (const { fact } of streamFramedSyncFileReadySourceFacts(files, source)) yield fact;
    }), { loadBody: (_db, blob) => loadBody(blob), objectOptions: hostName ? { hostName } : {} });
    const result = [];
    for (const { record, source } of transfers) {
      if (record.receipt) { result.push(record.receipt); continue; }
      if (!source) throw new Error('framed_sync_transfer_not_ready');
      const resource = source.entries[0]?.descriptor.kind === FRAMED_SYNC_RESOURCE_FACT_KIND;
      if (resource) await applyFramedSyncFileResourceSource(tx, files, source);
      const current = resource ? null : await readFramedSyncInventoryEntry(tx, source);
      if (!resource && !current) throw new Error('framed_sync_applied_state_missing');
      result.push({ contentId: source.contentId, transferId: source.transferId,
        receiverDeviceId: source.context.receiverDeviceId, receiverLibraryEpoch: source.context.receiverLibraryEpoch,
        appliedStateHash: resource ? source.contentId : current!.sharedStateHash });
    }
    return result;
  });
  for (const receipt of receipts) {
    await createFramedSyncFileStaging(files).commitApplyAndReceipt(receipt);
    await finishFramedSyncFileCompletion(files, receipt.transferId);
  }
  return receipts;
}
