import { randomUUID } from 'node:crypto';

import { readDataMigrationState, writeDataMigrationState } from '../../lib/core/database/dataMigrationState.js';
import type { DatabaseDriver } from '../../lib/core/database/driver.js';

import type { DatabaseConnection } from './connection.js';

export const BODY_REPAIR_ID = 'legacy-current-body-v1';
export const BODY_COLLECTION_ID = 'legacy-body-collection-v1';
export interface BodyMigrationProgress {
  migration_id: string;
  phase: string;
  cursor: string;
  changed: number;
  deleted_blobs: number;
  deleted_bytes: number;
  error: string | null;
}

export function protectBodyMigration(driver: DatabaseDriver, migrationId: string, objectId: string, reason: string) {
  driver.execute(`INSERT INTO legacy_body_migration_protections VALUES (?, ?, ?)
    ON CONFLICT(migration_id, object_id) DO UPDATE SET reason = excluded.reason`, [migrationId, objectId, reason]);
}

export function readBodyMigrationProgress(driver: DatabaseDriver, migrationId: string) {
  return driver.queryOne<BodyMigrationProgress & Record<string, unknown>>(
    'SELECT * FROM legacy_body_migration_progress WHERE migration_id = ?', [migrationId]);
}

export function saveBodyMigrationProgress(connection: Pick<DatabaseConnection, 'driver' | 'sqlite'>,
  progress: BodyMigrationProgress, completed: boolean) {
  connection.driver.execute(`INSERT INTO legacy_body_migration_progress VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(migration_id) DO UPDATE SET phase = excluded.phase, cursor = excluded.cursor,
      changed = excluded.changed, deleted_blobs = excluded.deleted_blobs, deleted_bytes = excluded.deleted_bytes, error = excluded.error`,
  [progress.migration_id, progress.phase, progress.cursor, progress.changed, progress.deleted_blobs, progress.deleted_bytes, progress.error]);
  const previous = readDataMigrationState(connection.sqlite, progress.migration_id);
  writeDataMigrationState(connection.sqlite, { migration_id: progress.migration_id,
    run_id: previous?.run_id ?? randomUUID(), status: completed ? 'completed' : 'running',
    updated_at: new Date().toISOString() });
}

export function initialBodyMigrationProgress(migrationId: string, phase: string): BodyMigrationProgress {
  return { migration_id: migrationId, phase, cursor: '', changed: 0, deleted_blobs: 0, deleted_bytes: 0, error: null };
}
