import { sameFramedSyncBytes } from '../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { canonicalContentId, type CanonicalFact } from '../../lib/core/sync/framedSyncCanonicalManifest.js';
import type { PublishedTransfer, TransferReceiptStage } from '../../lib/core/sync/framedSyncContract.js';
import { restoreFramedSyncObjectStateFact } from '../../lib/core/sync/framedSyncObjectStateFact.js';
import { replayRetiredParentOrderBodies } from '../../lib/core/sync/parentOrderBodyReplay.js';
import { assertSyncGroupLocalPublicationAllowed } from '../../lib/core/sync/syncGroupLocalAdoption.js';

export async function replayDesktopFramedSyncOrderBody(input: {
  db: DbPort;
  facts: readonly CanonicalFact[];
  published: PublishedTransfer;
  receipt: TransferReceiptStage;
  trailer: Record<string, unknown>;
}) {
  const { facts, published, receipt, trailer } = input;
  if (!facts.length) return;
  const contentId = await canonicalContentId({ facts, blobs: [] });
  if (facts.length !== 1 || published.factCount !== 1n || published.blobCount !== 0n ||
      BigInt(String(trailer.factCount)) !== 1n || BigInt(String(trailer.blobCount)) !== 0n ||
      !sameFramedSyncBytes(contentId, published.contentId) ||
      !sameFramedSyncBytes(contentId, receipt.contentId) ||
      !sameFramedSyncBytes(contentId, new Uint8Array(trailer.manifestHash as Uint8Array))) {
    throw new Error('framed_sync_replayed_body_identity_mismatch');
  }
  const record = restoreFramedSyncObjectStateFact(facts[0]!);
  await input.db.transaction(async (tx) => {
    await assertSyncGroupLocalPublicationAllowed(tx);
    await replayRetiredParentOrderBodies(tx, [record]);
  });
}

export function collectReplayedParentOrderFact(facts: CanonicalFact[], published: PublishedTransfer,
  fact: CanonicalFact) {
  if (published.factCount !== 1n || published.blobCount !== 0n || fact.objectType !== 'order_version') return;
  if (facts.length) throw new Error('framed_sync_replayed_body_identity_mismatch');
  facts.push(fact);
}
