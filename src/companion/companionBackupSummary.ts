import type { CompanionFolderBackupState } from '../../lib/platform/companionFolderBackupContract';
import type { useTranslation } from '../shared/localization/LocalizationProvider';
import { isCompanionFolderBackupDirectoryFailure } from '../shared/platform/companion/folderBackup/companionFolderBackupDirectoryFailure';

export function companionBackupSummary(state: CompanionFolderBackupState | null, automatic: boolean | null,
  error: string | null, t: ReturnType<typeof useTranslation>) {
  const failure = error || state?.errorMessage;
  if (failure) return t('companion.settings.storage.backupFailedReason', { reason: failure });
  if (state?.phase === 'failed') return t('companion.settings.storage.backupFailed');
  if (!state) return t('companion.settings.storage.backupLoading');
  if (!state.configured) return t('companion.settings.storage.backupNotConfigured');
  if (state.pendingItems == null) return t('companion.settings.storage.backupNotStarted');
  if (automatic === null && state.pendingItems > 0) return t('companion.settings.storage.backupLoading');
  if (state.pendingItems === 0) return t('companion.settings.storage.backupComplete');
  return t(automatic ? 'companion.settings.storage.backupPendingAutomatic' : 'companion.settings.storage.backupPendingManual', { count: state.pendingItems });
}

/** Only a missing or unusable folder needs choosing again; any other failure retries the same folder. */
export function companionBackupNeedsFolder(state: CompanionFolderBackupState | null, error: string | null) {
  const failed = Boolean(error || state?.errorMessage || state?.phase === 'failed');
  return failed && (!state?.configured || isCompanionFolderBackupDirectoryFailure(error || state?.errorMessage));
}
