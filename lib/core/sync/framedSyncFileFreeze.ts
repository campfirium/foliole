import { sameCanonicalManifest } from './framedSyncCanonicalEquality.js';
import type { CanonicalManifest, CanonicalBlob } from './framedSyncCanonicalManifest.js';
import { releaseFramedSyncFileBodies, stageFramedSyncFileBody } from './framedSyncFileBodies.js';
import { encodeFramedSyncFileJson, type FramedSyncFilePort } from './framedSyncFilePort.js';
import { framedSyncPublicationDirectory, loadFramedSyncFilePublication,
  publishFramedSyncFileOutbound } from './framedSyncFilePublication.js';
import { encodePublicationInventory } from './framedSyncPublicationInventory.js';
import type { OutboundPublishInput } from './framedSyncStagingContract.js';

type BodyWriter = (blob: CanonicalBlob, data: Uint8Array) => Promise<void>;

/** The existing source transaction holds the same facts during both bounded passes. */
export async function freezeFramedSyncFilePublication(input: {
  files: FramedSyncFilePort; publication: OutboundPublishInput;
  freeze: (write: BodyWriter) => Promise<CanonicalManifest>;
}) {
  const { files, publication } = input;
  const owner = { purpose: 'outbound' as const, transferId: publication.transferId };
  const key = `${framedSyncPublicationDirectory(publication.transferId)}/preparing.json`;
  return files.exclusive(key, async () => {
    const existing = await loadFramedSyncFilePublication(files, publication.transferId);
    if (existing) return publishFramedSyncFileOutbound(files, publication);
    await files.write(key, encodeFramedSyncFileJson({ ...publication,
      manifest: encodePublicationInventory(publication.manifest, publication.inventoryDifference) }));
    try {
      const frozen = await input.freeze((blob, data) => stageFramedSyncFileBody(files, blob, data, owner));
      if (!sameCanonicalManifest(frozen, publication.manifest)) throw new Error('framed_sync_source_changed');
      const result = await publishFramedSyncFileOutbound(files, publication);
      await files.remove(key);
      return result;
    } catch (error) {
      if (!await loadFramedSyncFilePublication(files, publication.transferId)) {
        await releaseFramedSyncFileBodies(files, publication.manifest.blobs, owner);
        await files.remove(`${framedSyncPublicationDirectory(publication.transferId)}/facts`);
        await files.remove(key);
      }
      throw error;
    }
  });
}
