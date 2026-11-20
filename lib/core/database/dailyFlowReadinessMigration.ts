import { CYCLE_READINESS_SCHEMA } from '../flow/cycleFlowTypes.js';
import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';

// The day's existing rows gain readiness through the next reconcile; nothing is guessed here.
const INVALIDATE_DAILY_FLOW = 'UPDATE daily_flow_state SET invalidated = 1 WHERE id = 1';

export function migrateDailyFlowReadiness(sqlite: DatabaseMigrationTarget) {
  for (const sql of CYCLE_READINESS_SCHEMA) sqlite.exec(sql);
  sqlite.exec(INVALIDATE_DAILY_FLOW);
}

export async function migrateCompanionDailyFlowReadiness(db: DbPort) {
  for (const sql of CYCLE_READINESS_SCHEMA) await db.run(sql);
  await db.run(INVALIDATE_DAILY_FLOW);
}
