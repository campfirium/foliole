import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';

const statements = [
  "DELETE FROM sync_object_state WHERE object_type = 'node_position'",
  'DROP TABLE IF EXISTS node_version_member_positions'
];

/** Retire replication metadata without changing versions, body retention or peer proofs. */
export function retireNodePositions(sqlite: DatabaseMigrationTarget) {
  for (const sql of statements) sqlite.exec(sql);
}

export async function retireCompanionNodePositions(db: DbPort) {
  for (const sql of statements) await db.run(sql);
}
