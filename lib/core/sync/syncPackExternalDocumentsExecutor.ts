import type { DbPort } from './dbPort.js';
import {
  buildSyncPackExternalDocumentUpsertSql,
  type SyncPackApplyableRowsOptions
} from './syncPackApplyStatements.js';

export async function applySyncPackExternalDocumentsWithDbPort(
  port: DbPort,
  options: SyncPackApplyableRowsOptions = {}
) {
  const result = await port.run(buildSyncPackExternalDocumentUpsertSql(options));
  return result.changes;
}
