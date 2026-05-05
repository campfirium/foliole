import type { DbPort } from './dbPort.js';
import { buildSyncPackContentBlobUpsertSql, type SyncPackApplyableRowsOptions } from './syncPackApplyStatements.js';

export async function applySyncPackContentBlobsWithDbPort(
  port: DbPort,
  options: SyncPackApplyableRowsOptions = {}
) {
  const result = await port.run(buildSyncPackContentBlobUpsertSql(options));
  return result.changes;
}
