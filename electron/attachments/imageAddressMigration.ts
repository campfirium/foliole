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

type ImageOwners = Map<string, Array<{ id: string; storageKey: string }>>;

/** One pass over live Nodes replaces a full-table search per image file. */
async function collectImageOwners(databasePath: string, context: DesktopTaskContext) {
  const owners: ImageOwners = new Map();
  let cursor = '';
  while (true) {
    const rows = await withLibrary(databasePath, context, () => openDatabaseConnection().driver.queryAll<{
      id: string; role: string | null; storage_key: string | null }>(
      `SELECT batch.id, json_extract(reference.value, '$.role') AS role,
         json_extract(reference.value, '$.storage_key') AS storage_key
       FROM (SELECT id, resource_references FROM nodes WHERE id > ? AND deleted_at IS NULL
         AND resource_references <> '[]' ORDER BY id LIMIT 256) batch
       LEFT JOIN json_each(batch.resource_references) reference ORDER BY batch.id`, [cursor]));
    if (!rows.length) return owners;
    for (const row of rows) {
      cursor = row.id;
      if (row.role !== 'image' || typeof row.storage_key !== 'string' || row.storage_key[64] !== '.') continue;
      const hash = row.storage_key.slice(0, 64);
      owners.set(hash, [...owners.get(hash) ?? [], { id: row.id, storageKey: row.storage_key }]);
    }
    await context.yieldIfNeeded();
  }
}

async function migrateImageNodes(image: VerifiedMigrationImage, owners: ImageOwners,
  databasePath: string, context: DesktopTaskContext) {
  let changed = 0;
  let deferred = 0;
  const ids = new Set((owners.get(image.contentHash) ?? [])
    .filter((owner) => owner.storageKey !== image.storageKey).map((owner) => owner.id));
  for (const id of [...ids].sort()) {
    await context.yieldIfNeeded();
    await withLibrary(databasePath, context, () => {
      try {
        if (migrateImageAddressInNode(openDatabaseConnection().driver, id, image, loadOrCreateDesktopHostName())) {
          changed++;
          notifyWorkspaceContentChanged();
        }
      } catch (error) {
        deferred++;
        context.logger.error(`image_migration_node_deferred:${id}`, error);
      }
    });
  }
  return { changed, deferred };
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
  const images: VerifiedMigrationImage[] = [];
  for await (const image of verifiedMigrationImages(paths.assetsDir, context)) images.push(image);
  const owners = await collectImageOwners(paths.databasePath, context);
  for (const image of images) {
    const result = await migrateImageNodes(image, owners, paths.databasePath, context);
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
