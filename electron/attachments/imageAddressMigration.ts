import { randomUUID } from 'node:crypto';

import { readDataMigrationState, writeDataMigrationState } from '../../lib/core/database/dataMigrationState.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadOrCreateDesktopHostName } from '../database/hostProfile.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';
import type { DesktopTaskContext } from '../desktopTaskTypes.js';
import { notifyWorkspaceContentChanged } from '../ipc/workspaceContentChangedEvents.js';

import { verifiedMigrationImages, type VerifiedMigrationImage } from './imageAddressMigrationFiles.js';
import { migrateImageAddressInNode } from './imageAddressMigrationNode.js';

export const IMAGE_ADDRESS_MIGRATION_ID = 'image-address-bytes-v1';

function withLibrary<T>(databasePath: string, context: DesktopTaskContext, action: () => T) {
  return runWithDatabaseConnectionOwner(() => {
    context.signal.throwIfAborted();
    if (openDatabaseConnection().dbPath !== databasePath) throw new Error('image_migration_library_changed');
    return action();
  });
}

async function migrateImageNodes(image: VerifiedMigrationImage, databasePath: string, context: DesktopTaskContext) {
  let cursor = '';
  let changed = 0;
  let deferred = 0;
  while (true) {
    const rows = await withLibrary(databasePath, context, () => openDatabaseConnection().driver.queryAll<{ id: string }>(
      `SELECT id FROM nodes WHERE id > ? AND deleted_at IS NULL
       AND resource_references LIKE ? AND EXISTS (
         SELECT 1 FROM json_each(nodes.resource_references) reference
         WHERE json_extract(reference.value, '$.role') = 'image'
           AND json_extract(reference.value, '$.storage_key') LIKE ?
           AND json_extract(reference.value, '$.storage_key') <> ?
       ) ORDER BY id LIMIT 32`, [cursor, `%${image.contentHash}.%`, `${image.contentHash}.%`, image.storageKey]));
    if (!rows.length) return { changed, deferred };
    for (const row of rows) {
      await context.yieldIfNeeded();
      await withLibrary(databasePath, context, () => {
        try {
          if (migrateImageAddressInNode(openDatabaseConnection().driver, row.id, image, loadOrCreateDesktopHostName())) {
            changed++;
            notifyWorkspaceContentChanged();
          }
        } catch (error) {
          deferred++;
          context.logger.error(`image_migration_node_deferred:${row.id}`, error);
        }
      });
      cursor = row.id;
    }
  }
}

export async function runImageAddressMigration(context: DesktopTaskContext) {
  const paths = await runWithDatabaseConnectionOwner(() => {
    context.signal.throwIfAborted();
    const connection = openDatabaseConnection();
    const previous = readDataMigrationState(connection.sqlite, IMAGE_ADDRESS_MIGRATION_ID);
    if (previous?.status === 'completed') return null;
    const paths = resolveRuntimeDataPaths();
    if (paths.databasePath !== connection.dbPath) throw new Error('image_migration_library_changed');
    const runId = previous?.run_id ?? randomUUID();
    writeDataMigrationState(connection.sqlite, { migration_id: IMAGE_ADDRESS_MIGRATION_ID,
      run_id: runId, status: 'running', updated_at: new Date().toISOString() });
    return { ...paths, runId };
  });
  if (!paths) return { changed: 0, completed: true };
  let changed = 0;
  let deferred = 0;
  for await (const image of verifiedMigrationImages(paths.assetsDir, context)) {
    const result = await migrateImageNodes(image, paths.databasePath, context);
    changed += result.changed;
    deferred += result.deferred;
  }
  await withLibrary(paths.databasePath, context, () => {
    if (deferred) return;
    writeDataMigrationState(openDatabaseConnection().sqlite, { migration_id: IMAGE_ADDRESS_MIGRATION_ID,
      run_id: paths.runId, status: 'completed', updated_at: new Date().toISOString() });
  });
  context.logger.info('image_address_migration_finished', { changed, deferred });
  return { changed, completed: deferred === 0 };
}
