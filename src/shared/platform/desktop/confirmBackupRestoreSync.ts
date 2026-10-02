import { beginWorkspaceRestoreSession, cancelWorkspaceRestoreSession } from '../../../store/workspaceRestoreSession';
import type { Translate } from '../../localization/LocalizationProvider';
import { requestAppConfirmation } from '../../ui/appConfirmation';
import { loadDesktopSyncGroupOverview } from '../desktopSyncGroupRuntimeRepository';

import { resumeDesktopCompanionSync } from './companionSyncParticipationRuntime';

export async function resumeSyncWithBackupRestoreConfirmation(t: Translate) {
  const overview = await loadDesktopSyncGroupOverview();
  const restoreId = overview.pending_backup_restore;
  if (!restoreId) return resumeDesktopCompanionSync();
  if (!await requestAppConfirmation({
    title: t('settings.backups.restore.sync.resumeTitle'),
    description: t('settings.backups.restore.sync.resumeDescription'),
    confirmLabel: t('settings.companionSync.group.resume')
  })) return overview;
  if (!await beginWorkspaceRestoreSession()) throw new Error('backup_restore_sync_pending_changes');
  try { return await resumeDesktopCompanionSync(restoreId); }
  finally { cancelWorkspaceRestoreSession(); }
}
