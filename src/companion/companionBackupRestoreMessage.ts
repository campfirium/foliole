import { CompanionDatabaseBlockedError } from '../../lib/core/database/companionDatabaseLifecycle';
import type { Translate } from '../shared/localization/LocalizationProvider';

const NATIVE_REASONS: Record<string, Parameters<Translate>[0]> = {
  restore_sync_group_active: 'companion.settings.storage.restoreErrorSyncGroup',
  restore_not_backup: 'companion.settings.storage.restoreErrorNotBackup',
  restore_not_archive: 'companion.settings.storage.restoreErrorNotBackup',
  restore_not_database: 'companion.settings.storage.restoreErrorNotBackup',
  restore_unsafe_archive: 'companion.settings.storage.restoreErrorNotBackup',
  restore_multiple_backups: 'companion.settings.storage.restoreErrorMultiple',
  restore_backup_incomplete: 'companion.settings.storage.restoreErrorIncomplete',
  restore_nothing_staged: 'companion.settings.storage.restoreErrorNotStaged'
};

function megabytes(bytes: string) {
  return `${Math.max(1, Math.ceil(Number(bytes) / (1024 * 1024)))} MB`;
}

/** Plain-language reason a backup cannot be restored on this phone. */
export function companionBackupRestoreMessage(error: unknown, t: Translate) {
  if (error instanceof CompanionDatabaseBlockedError || (error as { reason?: unknown })?.reason) {
    const reason = String((error as { reason: string }).reason);
    if (reason === 'newer-version') return t('companion.settings.storage.restoreErrorNewer');
    if (reason === 'missing' || reason === 'identity-missing') return t('companion.settings.storage.restoreErrorNotBackup');
    return t('companion.settings.storage.restoreErrorDamaged');
  }
  const message = error instanceof Error ? error.message : String(error);
  const space = /^restore_insufficient_space:(\d+)/.exec(message);
  if (space) return t('companion.settings.storage.restoreErrorSpace', { size: megabytes(space[1]!) });
  const key = NATIVE_REASONS[message];
  return key ? t(key) : t('companion.settings.storage.restoreErrorGeneric', { reason: message });
}
