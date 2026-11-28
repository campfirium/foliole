import { FRAMED_SYNC_RESOURCE_AVAILABILITY_SQL } from '../../lib/core/database/framedSyncResourceAvailability.js';
import { upsertNodeResourceReference } from '../../lib/core/database/nodeResourceReferences.js';
import type { PersistedImportRecord, PreparedImportRecord } from '../../lib/core/import/contract.js';
import { localizeImportDataImages } from '../../lib/core/import/importDataImages.js';
import { resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';

import { openDatabaseConnection } from './connection.js';
import { persistAttachmentFile } from './importPipelineAttachments.js';

/** Writes the files first, so a stored body never points at an image that does not exist yet. */
export function stageImportDataImages(input: PreparedImportRecord) {
  // EPUB bodies are rewritten again from their own staged content.
  if (input.sourceKind === 'epub') return { prepared: input, images: [] };
  const staged = localizeImportDataImages(input);
  for (const image of staged.images) {
    persistAttachmentFile(resolveAttachmentStoragePath(image.hash, undefined, image.mimeType), image.bytes);
  }
  return staged;
}

export function linkImportImages(record: PersistedImportRecord, staged: ReturnType<typeof stageImportDataImages>) {
  if (!record.nodeId || record.duplicateSemantic === 'duplicate') return;
  const driver = openDatabaseConnection().driver;
  for (const image of staged.images) driver.execute(FRAMED_SYNC_RESOURCE_AVAILABILITY_SQL, [image.hash, 1]);
  for (const reference of staged.prepared.localizedImageResources ?? []) {
    const row = driver.queryOne<{ resource_references: string }>('SELECT resource_references FROM nodes WHERE id = ?', [record.nodeId]);
    if (!row) throw new Error('image_import_node_unavailable');
    driver.execute('UPDATE nodes SET resource_references = ?, sync_dirty = 1 WHERE id = ?',
      [upsertNodeResourceReference(row.resource_references, reference), record.nodeId]);
  }
}
