import type { TranslationKey } from '../translations';

export const ZH_HANS_SETTINGS_DATABASE_MAINTENANCE_TRANSLATIONS: Partial<Record<TranslationKey, string>> = {
  'settings.backups.database.sectionAria': '数据库维护设置区',
  'settings.backups.database.sectionTitle': '数据库',
  'settings.backups.database.title': '数据库存储',
  'settings.backups.database.description': '共 {size} · 可回收 {reclaimable}（{percent}%）',
  'settings.backups.database.unavailable': '暂时无法读取数据库存储信息。',
  'settings.backups.database.action': '整理数据库',
  'settings.backups.database.compacting': '正在整理...',
  'settings.backups.database.success': '数据库已整理。',
  'settings.backups.database.failed': '数据库整理失败：{message}',
  'settings.backups.kind.preCompact': '数据库整理前安全快照'
};
