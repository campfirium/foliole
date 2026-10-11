import { hexToBytes } from '@noble/hashes/utils.js';

import { decodeFramedSyncManifest } from '../database/framedSyncStagingSerialization.js';

import { releaseFramedSyncFileBodies } from './framedSyncFileBodies.js';
import type { FramedSyncFilePort } from './framedSyncFilePort.js';
import { decodeFramedSyncFileTask, framedSyncPublicationDirectory, loadFramedSyncFileTask } from './framedSyncFilePublication.js';

/** Unsealed source selections were never sent; published original input keeps its owner. */
export async function discardFramedSyncFilePreparations(files: FramedSyncFilePort) {
  for (const id of await files.list('outbound')) {
    if (!/^[a-f0-9]{64}$/u.test(id)) throw new Error('framed_sync_publication_directory_invalid');
    const transferId = hexToBytes(id);
    const key = `${framedSyncPublicationDirectory(transferId)}/preparing.json`;
    await files.exclusive(key, async () => {
      const bytes = await files.read(key);
      if (!bytes) return;
      const preparation = await decodeFramedSyncFileTask(bytes, transferId, false);
      if (!(await loadFramedSyncFileTask(files, transferId))?.manifest) {
        const manifest = decodeFramedSyncManifest(preparation.manifest!);
        await releaseFramedSyncFileBodies(files, manifest.blobs, { purpose: 'outbound', transferId });
        await files.remove(`${framedSyncPublicationDirectory(transferId)}/facts`);
      }
      await files.remove(key);
    });
  }
}
