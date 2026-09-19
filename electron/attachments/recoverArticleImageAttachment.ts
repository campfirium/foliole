import fs from 'node:fs/promises';
import path from 'node:path';

import { serializeImageSources } from '../../lib/core/database/imageSources.js';
import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import { recoverArticleImage, type RecoverableImageArticle } from '../../lib/core/import/articleImageRecovery.js';
import { replaceArticleImageSource } from '../../lib/core/import/replaceArticleImageSource.js';
import { parseCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';
import type { NativeImportLocalImageAttachmentResult, NativeImportRemoteImageAttachmentArgs } from '../../lib/platform/nativeStorageContract.js';
import { findAttachmentRecordById } from '../database/attachments.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadOrCreateDesktopHostName } from '../database/hostProfile.js';
import { readNodeImageSources } from '../database/nodeImageSources.js';
import { flushNodeSyncVersion } from '../database/nodeSyncVersions.js';

import { readAttachmentLibraryPathSnapshot } from './attachmentLibraryPathSnapshot.js';
import { importImageAttachmentResource } from './importImageAttachmentResource.js';
import { fetchRemoteImageResource } from './remoteImagePipeline.js';

function readArticle(nodeId: string): RecoverableImageArticle | null {
  const body = loadNodeBodyResolution(openDatabaseConnection().driver, nodeId);
  const imageSources = readNodeImageSources(nodeId);
  return body?.status === 'resolved' && imageSources ? { content: body.content, imageSources } : null;
}

function commitArticle(nodeId: string, before: RecoverableImageArticle, after: RecoverableImageArticle) {
  const driver = openDatabaseConnection().driver;
  return driver.transaction(() => {
    const current = readArticle(nodeId);
    if (!current || current.content !== before.content ||
        serializeImageSources(current.imageSources) !== serializeImageSources(before.imageSources)) return false;
    const node = driver.queryOne<{ title: string }>('SELECT title FROM nodes WHERE id = ?', [nodeId]);
    if (!node) return false;
    const now = new Date().toISOString();
    writeNodeBody({ content: after.content, driver, nodeId, title: node.title, updatedAt: now });
    driver.execute('UPDATE nodes SET image_sources = ?, sync_dirty = 1, last_modified_by_host_name = ? WHERE id = ?',
      [serializeImageSources(after.imageSources), loadOrCreateDesktopHostName(now), nodeId]);
    flushNodeSyncVersion(nodeId, now);
    return true;
  });
}

export async function recoverArticleImageAttachment(args: NativeImportRemoteImageAttachmentArgs): Promise<NativeImportLocalImageAttachmentResult> {
  const storageKey = args.recoverStorageKey ?? '';
  const snapshot = readAttachmentLibraryPathSnapshot();
  const error = { status: 'error' as const, error_code: 'source_not_found' as const,
    message: 'The article image could not be recovered.', source_path: storageKey };
  if (!snapshot || !parseCanonicalAttachmentStorageKey(storageKey)) return error;
  let imported: NativeImportLocalImageAttachmentResult | null = null;
  const result = await recoverArticleImage({
    storageKey,
    replaceSource: replaceArticleImageSource,
    port: {
      read: async () => runWithDatabaseConnectionOwner(() => {
        if (readAttachmentLibraryPathSnapshot()?.libraryScope !== snapshot.libraryScope) return null;
        const article = readArticle(args.nodeId);
        return args.expectedContent !== undefined && article?.content !== args.expectedContent ? null : article;
      }),
      exists: async (key) => {
        const stat = await fs.lstat(path.join(snapshot.assetsDir, key)).catch(() => null);
        return Boolean(stat?.isFile() && !stat.isSymbolicLink());
      },
      importImage: async (sourceUrl) => {
        const fetched = await fetchRemoteImageResource(sourceUrl, { refresh: true, sourceOrigin: args.sourceOrigin ?? null });
        if (fetched.status !== 'ready') return null;
        imported = await runWithDatabaseConnectionOwner(() => {
          if (readAttachmentLibraryPathSnapshot()?.libraryScope !== snapshot.libraryScope) return null;
          return importImageAttachmentResource({ ...fetched.resource, errorSource: sourceUrl });
        });
        return imported?.status === 'imported' ? imported.storage_key : null;
      },
      commit: async (before, after) => runWithDatabaseConnectionOwner(() => {
        if (readAttachmentLibraryPathSnapshot()?.libraryScope !== snapshot.libraryScope) return false;
        return commitArticle(args.nodeId, before, after);
      })
    }
  });
  if (result && !imported) {
    imported = await runWithDatabaseConnectionOwner(() => {
      if (readAttachmentLibraryPathSnapshot()?.libraryScope !== snapshot.libraryScope) return null;
      const identity = parseCanonicalAttachmentStorageKey(result.storageKey);
      const record = identity ? findAttachmentRecordById(identity.contentHash) : null;
      if (!record?.mimeType || record.sizeBytes === null) return null;
      return { status: 'imported', attachment_id: record.id, attachment_record: 'reused',
        created_at: record.createdAt, hash: record.id, mime_type: record.mimeType,
        original_name: record.originalName ?? result.storageKey, size_bytes: record.sizeBytes,
        storage_key: result.storageKey, stored_file: 'reused' };
    });
  }
  const importedResult = imported as NativeImportLocalImageAttachmentResult | null;
  return result && importedResult?.status === 'imported'
    ? { ...importedResult, recovered_content: result.content } : error;
}
