import { app, Notification } from 'electron';

import {
  isExplicitSimplifiedChineseLanguageTag,
  readPrimaryLanguage
} from '../../lib/core/localization/systemLanguage.js';

import type { BackupPruneResult } from './backupCatalog.js';

function formatBytes(bytes: number) {
  const megabytes = bytes / (1024 * 1024);
  return megabytes >= 1024
    ? `${(megabytes / 1024).toFixed(1)} GB`
    : `${Math.max(1, Math.round(megabytes))} MB`;
}

function buildBody(result: BackupPruneResult, usesSimplifiedChinese: boolean) {
  if (result.deletedCount === 0) {
    const failure = result.failedCount > 0
      ? (usesSimplifiedChinese
          ? `${result.failedCount} 份较早的备份未能移到系统废纸篓。`
          : `${result.failedCount} older ${result.failedCount === 1 ? 'backup could' : 'backups could'} not be moved to the system trash.`)
      : '';
    if (!result.remainingBytesOverLimit) return failure;
    const excess = formatBytes(result.remainingBytesOverLimit);
    const overLimit = usesSimplifiedChinese
      ? `为保留最新安全备份，备份占用仍比上限多 ${excess}。`
      : `Backup storage remains ${excess} over the limit to keep the latest safety backup.`;
    return failure ? `${failure} ${overLimit}` : overLimit;
  }
  const count = result.deletedCount;
  const hasPolicyCleanup = result.policyDeletedCount > 0;
  const hasCapacityCleanup = result.capacityDeletedCount > 0;
  if (usesSimplifiedChinese) {
    const reason = hasPolicyCleanup && hasCapacityCleanup
      ? '根据保留规则和备份大小上限'
      : hasCapacityCleanup
        ? '因为超过备份大小上限'
        : '根据保留规则';
    const failure = result.failedCount > 0 ? ` ${result.failedCount} 份未能移动。` : '';
    const cleanup = `${reason}将 ${count} 份较早的备份移到了系统废纸篓。${failure}`;
    return result.remainingBytesOverLimit
      ? `${cleanup} 为保留最新安全备份，备份占用仍比上限多 ${formatBytes(result.remainingBytesOverLimit)}。`
      : cleanup;
  }
  const reason = hasPolicyCleanup && hasCapacityCleanup
    ? 'Retention rules and the backup size limit'
    : hasCapacityCleanup
      ? 'The backup size limit'
      : 'Retention rules';
  const failure = result.failedCount > 0
    ? ` ${result.failedCount} ${result.failedCount === 1 ? 'backup could' : 'backups could'} not be moved.`
    : '';
  const cleanup = `${reason} moved ${count} older ${count === 1 ? 'backup' : 'backups'} to the system trash.${failure}`;
  return result.remainingBytesOverLimit
    ? `${cleanup} Backup storage remains ${formatBytes(result.remainingBytesOverLimit)} over the limit to keep the latest safety backup.`
    : cleanup;
}

export function showBackupCleanupNotification(result: BackupPruneResult) {
  if (result.deletedCount === 0 && result.failedCount === 0 && !result.remainingBytesOverLimit) return false;
  try {
    if (!Notification?.isSupported?.()) {
      console.warn('[backup] cleanup notification is not supported', result);
      return false;
    }
    const usesSimplifiedChinese = isExplicitSimplifiedChineseLanguageTag(
      readPrimaryLanguage(app.getPreferredSystemLanguages())
    );
    new Notification({
      body: buildBody(result, usesSimplifiedChinese),
      silent: true,
      title: result.deletedCount > 0
        ? (usesSimplifiedChinese ? '旧备份已移到废纸篓' : 'Older backups moved to trash')
        : result.remainingBytesOverLimit
          ? (usesSimplifiedChinese ? '备份仍超出上限' : 'Backup limit not reached')
          : (usesSimplifiedChinese ? '旧备份未能清理' : 'Older backups could not be moved')
    }).show();
    return true;
  } catch (error) {
    console.error('[backup] cleanup notification failed', error);
    return false;
  }
}
