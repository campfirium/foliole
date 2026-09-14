import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { addColumnIfMissing } from './numberedMigrationHelpers.js';

export function repairSyncObjectStateBaseContentHash(sqlite: DatabaseMigrationTarget) {
  addColumnIfMissing(sqlite, 'sync_object_state', 'base_content_hash', 'TEXT');
}
