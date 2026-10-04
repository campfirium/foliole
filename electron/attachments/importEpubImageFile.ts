import { stat, unlink } from 'node:fs/promises';

import type { NativeImportLocalImageAttachmentResult } from '../../lib/platform/nativeStorageContract.js';
import { runWithDatabaseConnectionOwner, openDatabaseConnection } from '../database/connection.js';
import { persistNodeResourceReference } from '../database/nodeResources.js';
import { readImageIntrinsicSize } from '../import/imageIntrinsicSize.js';

import { runWithImageAttachmentHashOwner } from './imageAttachmentHashOwner.js';
import { prepareCanonicalImageAttachmentFile, readAttachmentPrefix, stageManagedAttachmentFileCopy } from './managedAttachmentFileCopy.js';

export async function importEpubImageFile(input: {
  sourcePath: string; nodeId: string; originalName: string; errorSource: string;
}): Promise<NativeImportLocalImageAttachmentResult> {
  const canonical = await prepareCanonicalImageAttachmentFile(input.sourcePath);
  if (!canonical) return {
    status: 'error', error_code: 'unsupported_format', message: 'The EPUB image format is unsupported.', source_path: input.errorSource
  };
  return runWithImageAttachmentHashOwner(canonical.hash, async () => {
    const exists = await runWithDatabaseConnectionOwner(() => openDatabaseConnection().driver.queryOne(
      'SELECT id FROM nodes WHERE id = ?', [input.nodeId]
    ));
    if (!exists) return {
      status: 'error', error_code: 'node_not_found', message: 'The target node does not exist.', source_path: input.errorSource
    };
    const stage = await stageManagedAttachmentFileCopy({
      sourcePath: input.sourcePath, contentHash: canonical.hash, mimeType: canonical.mimeType, originalName: input.originalName
    });
    let attachmentRecord: 'created' | 'reused';
    try {
      attachmentRecord = await runWithDatabaseConnectionOwner(() => persistNodeResourceReference(input.nodeId, {
        storage_key: canonical.storageKey, role: 'image', original_name: input.originalName
      }));
    } catch (error) {
      if (stage.createdFile) await unlink(stage.storagePath).catch(() => undefined);
      throw error;
    }
    return {
      status: 'imported', attachment_id: canonical.hash, hash: canonical.hash, mime_type: canonical.mimeType,
      size_bytes: canonical.sizeBytes, storage_key: canonical.storageKey, original_name: input.originalName,
      created_at: (await stat(stage.storagePath)).birthtime.toISOString(), attachment_record: attachmentRecord,
      stored_file: stage.createdFile ? 'created' : 'reused',
      intrinsic_size: readImageIntrinsicSize(await readAttachmentPrefix(input.sourcePath))
    };
  });
}
