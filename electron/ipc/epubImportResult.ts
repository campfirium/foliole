import type { PersistedImportRecord } from '../../lib/core/import/contract.js';
import { openDatabaseConnection } from '../database/connection.js';

export function appendReason(current: string | null, next: string | null) {
  if (!next) return current;
  if (!current) return next;
  return current.includes(next) ? current : `${current}; ${next}`;
}

export function applyAggregateDegrade(record: PersistedImportRecord, degradedReason: string | null) {
  if (!degradedReason || !record.nodeId) return record;
  const connection = openDatabaseConnection();
  connection.driver.execute('UPDATE import_runs SET result_status = ?, degraded_reason = ? WHERE id = ?', [
    'degraded',
    degradedReason,
    record.importId
  ]);
  return { ...record, degradedReason, resultStatus: 'degraded' as const };
}
