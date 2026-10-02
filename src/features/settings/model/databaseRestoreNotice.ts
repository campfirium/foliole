import type { Translate } from '../../../shared/localization/LocalizationProvider';

function localizeOutcome(message: string, t: Translate) {
  if (message.startsWith('The backup was restored, but')) return t('settings.backups.restore.reloadFailed');
  if (message.includes('Your current library is unchanged.')) return t('settings.backups.restore.failure.unchanged');
  if (message.includes('Your current library has been restored.')) return t('settings.backups.restore.failure.recovered');
  if (message.includes('could not reopen the current library.')) return t('settings.backups.restore.failure.unavailable');
  if (message.includes('Desktop runtime unavailable.')) return t('settings.backups.restore.failure.runtimeUnavailable');
  return t('settings.backups.restore.failure.unknown');
}

function describeReason(reason: string, t: Translate) {
  let explanation = '';
  if (reason.includes('file is not a database')) explanation = t('settings.backups.restore.failure.invalidBackup');
  else if (reason.includes('delivery_authorization_ambiguous:')) explanation = t('settings.backups.restore.failure.ambiguousAuthorization');
  else if (reason.includes('backup_restore_sync_settings_changed')) explanation = t('settings.backups.restore.failure.settingsChanged');
  return explanation ? `${explanation} (${reason})` : reason;
}

export function localizeDatabaseRestoreFailure(message: string, t: Translate) {
  const [outcome = '', ...details] = message.split('\nReason: ');
  const summary = localizeOutcome(outcome, t);
  if (!details.length) return summary;
  const [reason = '', ...rollback] = details.join('\nReason: ').split('\nRollback: ');
  return `${summary}\n${t('settings.backups.restore.failure.reason', { reason: describeReason(reason, t) })}` +
    (rollback.length ? `\n${t('settings.backups.restore.failure.rollbackReason', { reason: rollback.join('\nRollback: ') })}` : '');
}
