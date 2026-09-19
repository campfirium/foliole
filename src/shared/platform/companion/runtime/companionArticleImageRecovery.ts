import { recoverArticleImage } from '../../../../../lib/core/import/articleImageRecovery';
import { replaceArticleImageSource } from '../../../../../lib/core/import/replaceArticleImageSource';
import { parseCanonicalAttachmentStorageKey } from '../../../../../lib/platform/attachmentResource';
import { runCompanionSyncWriterTask } from '../../companionSyncWriterQueue';
import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository';

import { commitCompanionImageArticle, readCompanionImageArticle, saveCompanionImportedImage } from './companionArticleImageStore';
import { importCompanionImageResource } from './companionImageImporter';
import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';

export async function recoverCompanionArticleImage(nodeId: string, storageKey: string, expectedContent: string) {
  return recoverArticleImage({
    storageKey,
    replaceSource: replaceArticleImageSource,
    port: {
      read: async () => {
        const article = await readCompanionImageArticle(nodeId);
        return article?.content === expectedContent ? article : null;
      },
      exists: async (key) => {
        const identity = parseCanonicalAttachmentStorageKey(key);
        if (!identity) return false;
        return (await FolioleCompanionSync.resolveAttachmentResource({
          attachment_id: identity.contentHash, content_hash: identity.contentHash,
          mime_type: identity.mimeType, storage_key: key
        })).status === 'ready';
      },
      importImage: async (url) => {
        const image = await importCompanionImageResource(url);
        await runCompanionSyncWriterTask(() => getIosCompanionDatabaseOwner().runWriter((db) => saveCompanionImportedImage(db, image)));
        return image.storageKey;
      },
      commit: (before, after) => commitCompanionImageArticle(nodeId, before, after)
    }
  });
}

export async function importCompanionArticleImage(nodeId: string, sourceUrl: string) {
  const before = await readCompanionImageArticle(nodeId);
  if (!before) return null;
  const image = await importCompanionImageResource(sourceUrl);
  await runCompanionSyncWriterTask(() => getIosCompanionDatabaseOwner().runWriter((db) => saveCompanionImportedImage(db, image)));
  const saved = await commitCompanionImageArticle(nodeId, before, {
    ...before, imageSources: { ...before.imageSources, [image.storageKey]: sourceUrl }
  });
  if (!saved) return null;
  return {
    status: 'imported' as const, attachment_id: image.contentHash, attachment_record: 'created' as const,
    created_at: new Date().toISOString(), hash: image.contentHash, mime_type: image.mimeType,
    original_name: image.storageKey, size_bytes: image.sizeBytes, storage_key: image.storageKey,
    stored_file: image.storedFile
  };
}
