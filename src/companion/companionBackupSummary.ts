import type { CompanionFolderBackupState } from '../../lib/platform/companionFolderBackupContract';
import type { useTranslation } from '../shared/localization/LocalizationProvider';

export function companionBackupSummary(state: CompanionFolderBackupState | null, automatic: boolean | null,
  error: string | null, t: ReturnType<typeof useTranslation>, preview = false) {
  if (preview) return `${t('companion.settings.storage.backupComplete')} · ${t('companion.settings.storage.previewExample')}`;
  if (error || state?.phase === 'failed') return t('companion.settings.storage.backupFailed');
  if (!state) return t('companion.settings.storage.backupLoading');
  if (!state.configured) return t('companion.settings.storage.backupNotConfigured');
  if (state.pendingItems == null) return t('companion.settings.storage.backupNotStarted');
  if (automatic === null && state.pendingItems > 0) return t('companion.settings.storage.backupLoading');
  if (state.pendingItems === 0) return t('companion.settings.storage.backupComplete');
  return t(automatic ? 'companion.settings.storage.backupPendingAutomatic' : 'companion.settings.storage.backupPendingManual', { count: state.pendingItems });
}
