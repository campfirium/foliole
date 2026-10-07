import fs from 'node:fs/promises';
import path from 'node:path';

import { serializeImageSources } from '../../lib/core/database/imageSources.js';
import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import { loadNodeBodyResolution } from '../../lib/core/database/nodeBodyResolution.js';
import type { NodeResourceReference } from '../../lib/core/database/nodeResourceReferences.js';
import { recoverArticleImage, type RecoverableImageArticle } from '../../lib/core/import/articleImageRecovery.js';
import { replaceArticleImageSource } from '../../lib/core/import/replaceArticleImageSource.js';
import { parseCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';
import type { NativeImportLocalImageAttachmentResult, NativeImportRemoteImageAttachmentArgs } from '../../lib/platform/nativeStorageContract.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadOrCreateDesktopHostName } from '../database/hostProfile.js';
import { readNodeImageSources } from '../database/nodeImageSources.js';
import { persistNodeResourceReference } from '../database/nodeResources.js';
import { flushNodeSyncVersion } from '../database/nodeSyncVersions.js';

import { readAttachmentLibraryPathSnapshot } from './attachmentLibraryPathSnapshot.js';
import { importImageAttachmentResource } from './importImageAttachmentResource.js';
import { fetchRemoteImageResource } from './remoteImagePipeline.js';
import { resolveAttachmentFile } from './resourceResolver.js';

function readArticle(nodeId: string, bodyStorage: 'continuous' | 'chunked'): RecoverableImageArticle | null {
  const body = loadNodeBodyResolution(openDatabaseConnection().driver, nodeId, bodyStorage);
  const imageSources = readNodeImageSources(nodeId);
  return body?.status === 'resolved' && imageSources ? { content: body.content, imageSources } : null;
}

function commitArticle(nodeId: string, before: RecoverableImageArticle, after: RecoverableImageArticle, bodyStorage: 'continuous' | 'chunked', resource?: NodeResourceReference) {
  const driver = openDatabaseConnection().driver;
  return driver.transaction(() => {
    const current = readArticle(nodeId, bodyStorage);
    if (!current || current.content !== before.content ||
        serializeImageSources(current.imageSources) !== serializeImageSources(before.imageSources)) return false;
    const node = driver.queryOne<{ title: string }>('SELECT title FROM nodes WHERE id = ?', [nodeId]);
    if (!node) return false;
    const now = new Date().toISOString();
    writeNodeBody({ bodyStorage, content: after.content, driver, nodeId, title: node.title, updatedAt: now });
    driver.execute('UPDATE nodes SET image_sources = ?, sync_dirty = 1, last_modified_by_host_name = ? WHERE id = ?',
      [serializeImageSources(after.imageSources), loadOrCreateDesktopHostName(now), nodeId]);
    if (resource) persistNodeResourceReference(nodeId, resource);
    flushNodeSyncVersion(nodeId, now, bodyStorage);
    return true;
  });
}

export async function recoverArticleImageAttachment(args: NativeImportRemoteImageAttachmentArgs, bodyStorage: 'continuous' | 'chunked' = 'continuous'): Promise<NativeImportLocalImageAttachmentResult> {
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
        const article = readArticle(args.nodeId, bodyStorage);
        return args.expectedContent !== undefined && article?.content !== args.expectedContent ? null : article;
      }),
      exists: async (key) => {
        return resolveAttachmentFile(key, snapshot.assetsDir).status === 'ready';
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
        return commitArticle(args.nodeId, before, after, bodyStorage, imported?.status === 'imported' ? {
          storage_key: imported.storage_key, original_name: imported.original_name, role: 'image'
        } : undefined);
      })
    }
  });
  if (result && !imported) {
    imported = await runWithDatabaseConnectionOwner(async () => {
      if (readAttachmentLibraryPathSnapshot()?.libraryScope !== snapshot.libraryScope) return null;
      const identity = parseCanonicalAttachmentStorageKey(result.storageKey);
      const resource = resolveAttachmentFile(result.storageKey, snapshot.assetsDir);
      if (!identity || resource.status !== 'ready') return null;
      const stat = await fs.stat(resource.filePath).catch(() => null);
      if (!stat) return null;
      return { status: 'imported', attachment_id: identity.contentHash, attachment_record: 'reused',
        created_at: stat.birthtime.toISOString(), hash: identity.contentHash, mime_type: identity.mimeType,
        original_name: path.basename(resource.filePath), size_bytes: resource.bytes.byteLength,
        storage_key: result.storageKey, stored_file: 'reused' };
    });
  }
  const importedResult = imported as NativeImportLocalImageAttachmentResult | null;
  return result && importedResult?.status === 'imported'
    ? { ...importedResult, recovered_content: result.content } : error;
}
