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
  const released = formatBytes(result.releasedBytes);
  const count = result.deletedCount;
  const hasPolicyCleanup = result.policyDeletedCount > 0;
  const hasCapacityCleanup = result.capacityDeletedCount > 0;
  if (usesSimplifiedChinese) {
    const reason = hasPolicyCleanup && hasCapacityCleanup
      ? '根据保留规则和备份大小上限'
      : hasCapacityCleanup
        ? '因为超过备份大小上限'
        : '根据保留规则';
    return `${reason}删除了 ${count} 份较早的备份，释放 ${released}。`;
  }
  const reason = hasPolicyCleanup && hasCapacityCleanup
    ? 'Retention rules and the backup size limit'
    : hasCapacityCleanup
      ? 'The backup size limit'
      : 'Retention rules';
  return `${reason} removed ${count} older ${count === 1 ? 'backup' : 'backups'} and freed ${released}.`;
}

export function showBackupCleanupNotification(result: BackupPruneResult) {
  if (result.deletedCount === 0) return false;
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
      title: usesSimplifiedChinese ? '旧备份已清理' : 'Older backups cleaned up'
    }).show();
    return true;
  } catch (error) {
    console.error('[backup] cleanup notification failed', error);
    return false;
  }
}
