import { bytesToHex } from '@noble/hashes/utils.js';

import { canonicalContentId, canonicalTransferId } from './framedSyncCanonicalManifest.js';
import { encodeFramedSyncFileJson, type FramedSyncFilePort } from './framedSyncFilePort.js';
import { framedSyncPublicationDirectory, framedSyncPublicationKey, loadFramedSyncFilePublication,
  loadFramedSyncFileTask, publishFramedSyncFileOutbound } from './framedSyncFilePublication.js';
import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';
import { recoverLegacyPublicationInventory } from './framedSyncLegacyPublicationInventory.js';
import { recheckPublicationInventory } from './framedSyncPublicationInventory.js';
import { selectFramedSyncRecoveryManifest } from './framedSyncPublicationRecoverySelection.js';

/** Uses the existing comparison and frozen selection; only their durable owner changes. */
export async function reconcileFramedSyncFilePublication(files: FramedSyncFilePort, transferId: Uint8Array,
  remote: readonly FramedSyncInventoryEntry[]) {
  return files.exclusive(framedSyncPublicationDirectory(transferId), async () => {
    const task = await loadFramedSyncFileTask(files, transferId);
    if (!task) throw new Error('framed_sync_outbound_publication_missing');
    if (task.state !== 'published') return 'satisfied' as const;
    const publication = await loadFramedSyncFilePublication(files, transferId);
    if (!publication) throw new Error('framed_sync_outbound_publication_missing');
    const original = publication.inventoryDifference ?? recoverLegacyPublicationInventory(publication.manifest);
    if (recheckPublicationInventory(original, remote)) return 'missing' as const;
    await files.write(framedSyncPublicationKey(transferId), encodeFramedSyncFileJson({
      ...task, state: 'confirmed', completedAt: Date.now()
    }));
    return 'satisfied' as const;
  });
}

export async function selectFramedSyncFileRecoveryPublication(files: FramedSyncFilePort, transferId: Uint8Array,
  remote: readonly FramedSyncInventoryEntry[]) {
  const publication = await loadFramedSyncFilePublication(files, transferId);
  if (!publication) throw new Error('framed_sync_outbound_publication_missing');
  const original = publication.inventoryDifference ?? recoverLegacyPublicationInventory(publication.manifest);
  const inventoryDifference = recheckPublicationInventory(original, remote);
  if (!inventoryDifference) throw new Error('framed_sync_recovery_already_satisfied');
  const manifest = selectFramedSyncRecoveryManifest(publication, inventoryDifference);
  const contentId = await canonicalContentId(manifest);
  const recovery = { ...publication, manifest, inventoryDifference, contentId, manifestHash: contentId,
    transferId: await canonicalTransferId(publication.context, contentId) };
  await publishFramedSyncFileOutbound(files, recovery);
  await files.remove(`attempts/${bytesToHex(recovery.transferId)}/transfer`);
  return recovery;
}

export async function completeFramedSyncFileRecovery(files: FramedSyncFilePort, originalId: Uint8Array,
  deliveredId: Uint8Array) {
  await files.exclusive(framedSyncPublicationDirectory(originalId), async () => {
    const delivered = await loadFramedSyncFileTask(files, deliveredId);
    if (!delivered || delivered.state === 'published') throw new Error('framed_sync_recovery_delivery_unconfirmed');
    const task = await loadFramedSyncFileTask(files, originalId);
    if (!task) throw new Error('framed_sync_outbound_publication_missing');
    if (task.state !== 'published') return;
    await files.write(framedSyncPublicationKey(originalId), encodeFramedSyncFileJson({
      ...task, state: 'confirmed', completedAt: Date.now()
    }));
  });
}
