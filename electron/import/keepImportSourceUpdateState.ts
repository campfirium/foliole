import type { PersistedImportRecord } from '../../lib/core/import/contract.js';
import type { KeepImportItemRow } from '../database/keepImportItems.js';

type KeepImportResultStatus = 'degraded' | 'duplicate' | 'imported';

export function resolvePersistedSourceUpdateFlag(existingItem: KeepImportItemRow | null, primaryChanged: boolean) {
  if (!existingItem) {
    return false;
  }
  if (primaryChanged) {
    return true;
  }
  return Boolean(existingItem.has_source_update);
}

export function resolveKeepImportResultStatus(record: PersistedImportRecord): KeepImportResultStatus {
  if (record.resultStatus === 'degraded') {
    return 'degraded';
  }
  return record.duplicateSemantic === 'duplicate' ? 'duplicate' : 'imported';
}

export function resolveKeepImportResultDetail(record: PersistedImportRecord, status: KeepImportResultStatus) {
  if (status === 'duplicate') {
    return 'File content was already imported and no new node was created.';
  }
  if (status === 'degraded') {
    return record.degradedReason ?? 'Imported with degraded content.';
  }
  return 'Imported successfully.';
}
