import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { FRAMED_SYNC_RESOURCE_AVAILABILITY_SQL } from '../../lib/core/database/framedSyncResourceAvailability.js';
import { upsertNodeResourceReference } from '../../lib/core/database/nodeResourceReferences.js';
import type { NodeResourceReference } from '../../lib/core/database/nodeResourceReferences.js';
import type { PersistedImportRecord, PreparedImportRecord } from '../../lib/core/import/contract.js';
import { localizeImportDataImages, type ImportDataImage } from '../../lib/core/import/importDataImages.js';
import { resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';

import { openDatabaseConnection } from './connection.js';
import { persistAttachmentFile } from './importPipelineAttachments.js';

export function persistDataImageFiles(images: ImportDataImage[]) {
  for (const image of images) {
    persistAttachmentFile(resolveAttachmentStoragePath(image.hash, undefined, image.mimeType), image.bytes);
  }
}

/** Writes the files first, so a stored body never points at an image that does not exist yet. */
export function stageImportDataImages(input: PreparedImportRecord) {
  // EPUB import converts its root and chapters itself, before it rewrites packaged images.
  if (input.sourceKind === 'epub') return { prepared: input, images: [] };
  const staged = localizeImportDataImages(input);
  persistDataImageFiles(staged.images);
  return staged;
}

/** Records already written files as available and attaches them to the node that shows them. */
export function linkDataImageResources(driver: DatabaseDriver, nodeId: string, resources: NodeResourceReference[]) {
  for (const reference of resources) {
    driver.execute(FRAMED_SYNC_RESOURCE_AVAILABILITY_SQL, [reference.storage_key.slice(0, 64), 1]);
    const row = driver.queryOne<{ resource_references: string }>('SELECT resource_references FROM nodes WHERE id = ?', [nodeId]);
    if (!row) throw new Error('image_import_node_unavailable');
    driver.execute('UPDATE nodes SET resource_references = ?, sync_dirty = 1 WHERE id = ?',
      [upsertNodeResourceReference(row.resource_references, reference), nodeId]);
  }
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
