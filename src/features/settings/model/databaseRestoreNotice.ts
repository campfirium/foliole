import type { Translate } from '../../../shared/localization/LocalizationProvider';

export function localizeDatabaseRestoreFailure(message: string, t: Translate) {
  if (message.startsWith('The backup was restored, but')) return t('settings.backups.restore.reloadFailed');
  if (message.includes('Your current library is unchanged.')) return t('settings.backups.restore.failure.unchanged');
  if (message.includes('Your current library has been restored.')) return t('settings.backups.restore.failure.recovered');
  if (message.includes('could not reopen the current library.')) return t('settings.backups.restore.failure.unavailable');
  if (message.includes('Desktop runtime unavailable.')) return t('settings.backups.restore.failure.runtimeUnavailable');
  return t('settings.backups.restore.failure.unknown');
}
