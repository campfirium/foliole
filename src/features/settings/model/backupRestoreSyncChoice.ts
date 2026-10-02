import type { BackupRestoreSyncChoice, BackupRestoreSyncSource } from '../../../../lib/platform/backupRestoreSyncContract';
import type { Translate } from '../../../shared/localization/LocalizationProvider';
import { inspectBackupRestoreSyncInRuntime } from '../../../shared/platform/databaseBackupRuntimeRepository';
import { requestAppChoice } from '../../../shared/ui/appChoice';

export async function chooseBackupRestoreSync(sourcePath: string, t: Translate): Promise<BackupRestoreSyncChoice | null> {
  const preview = await inspectBackupRestoreSyncInRuntime(sourcePath);
  let source: BackupRestoreSyncSource = 'current';
  if (!preview.same) {
    const selected = await requestAppChoice({
      title: t('settings.backups.restore.sync.sourceTitle'),
      description: t('settings.backups.restore.sync.sources', {
        backup: preview.backup.group?.name ?? t('settings.backups.restore.sync.noGroup'),
        current: preview.current.group?.name ?? t('settings.backups.restore.sync.noGroup')
      }),
      choices: [
        { value: 'backup', label: t('settings.backups.restore.sync.backup') },
        { value: 'current', label: t('settings.backups.restore.sync.current') }
      ]
    });
    if (!selected) return null;
    source = selected as BackupRestoreSyncSource;
  }
  if (!preview[source].group) return { source, action: 'local', revision: preview.revision };
  const action = await requestAppChoice({
    title: t('settings.backups.restore.sync.actionTitle'),
    description: t('settings.backups.restore.sync.actionDescription'),
    choices: [
      { value: 'overwrite', label: t('settings.backups.restore.sync.overwrite') },
      { value: 'pause', label: t('settings.backups.restore.sync.pause') }
    ]
  });
  return action ? { source, action: action as 'overwrite' | 'pause', revision: preview.revision } : null;
}
