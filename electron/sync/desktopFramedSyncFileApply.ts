import type { DbPort } from '../../lib/core/sync/dbPort.js';
import type { CanonicalFact } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import { finishFramedSyncFileCompletion } from '../../lib/core/sync/framedSyncFileCompletion.js';
import { framedSyncFileInboundBodyLoader } from '../../lib/core/sync/framedSyncFileInboundBodies.js';
import type { FramedSyncFilePort } from '../../lib/core/sync/framedSyncFilePort.js';
import { createFramedSyncFileStaging } from '../../lib/core/sync/framedSyncFileStaging.js';
import { FRAMED_SYNC_RESOURCE_FACT_KIND } from '../../lib/core/sync/framedSyncResourceFact.js';
import { assertSyncGroupLocalPublicationAllowed } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { assertSyncGroupOverwriteInbound } from '../../lib/core/sync/syncGroupOverwriteProgress.js';

import { readDesktopFramedReceipt } from './desktopFramedSyncApplyLifecycle.js';
import { streamDesktopFramedSyncFileReadySourceFacts } from './desktopFramedSyncFileReadySource.js';
import { applyDesktopFramedSyncFileResourceSource, recordDesktopFramedSyncFileResources } from './desktopFramedSyncFileResourceApply.js';
import type { DesktopFramedSyncReadySource } from './desktopFramedSyncReadySource.js';
import { applyDesktopFramedSyncBusinessSources } from './desktopFramedSyncVerifiedApply.js';

/** Receives the root business port; callers must not wrap file completion inside a business transaction. */
export async function applyDesktopFramedSyncFileInbound(input: {
  db: DbPort; files: FramedSyncFilePort; transfers: readonly DesktopFramedSyncReadySource[];
}) {
  const staging = createFramedSyncFileStaging(input.files);
  const committed = await input.db.transaction(async (tx) => {
    if (!input.transfers.length) await assertSyncGroupLocalPublicationAllowed(tx);
    for (const transfer of input.transfers) {
      if (!await assertSyncGroupOverwriteInbound(tx, transfer.context)) await assertSyncGroupLocalPublicationAllowed(tx);
    }
    const sources = input.transfers.filter((source) => source.entries[0]?.descriptor.kind !== FRAMED_SYNC_RESOURCE_FACT_KIND);
    await recordDesktopFramedSyncFileResources(tx, input.files, sources.map((source) => source.transferId));
    const loadBody = framedSyncFileInboundBodyLoader(input.files, sources);
    const result = await applyDesktopFramedSyncBusinessSources(tx, sources, sources.map((source) => async function* () {
      for await (const { fact } of streamDesktopFramedSyncFileReadySourceFacts(input.files, source)) yield fact;
    }), (_db, blob) => loadBody(blob));
    const completions = [];
    for (const source of input.transfers) {
      const resourceFacts: CanonicalFact[] = sources.includes(source) ? [] :
        await applyDesktopFramedSyncFileResourceSource(tx, input.files, source);
      const receipt = resourceFacts.length ? { transferId: source.transferId, contentId: source.contentId,
        receiverDeviceId: source.context.receiverDeviceId, receiverLibraryEpoch: source.context.receiverLibraryEpoch,
        appliedStateHash: source.manifestHash } : await readDesktopFramedReceipt(tx, source);
      completions.push({ source, receipt, resourceFacts });
    }
    return { ...result, completions };
  });
  for (const { source, receipt } of committed.completions) {
    await staging.commitApplyAndReceipt(receipt);
    await finishFramedSyncFileCompletion(input.files, source.transferId);
  }
  return { generatedChanges: committed.generatedChanges, receipts: committed.completions.map(({ receipt }) => receipt) };
}
