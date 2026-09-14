import type { TranslationKey } from '../translations';

export const ZH_HANS_SETTINGS_BACKUP_SEARCH_TRANSLATIONS: Partial<Record<TranslationKey, string>> = {
  'settings.backups.search.sectionAria': '搜索备份设置区',
  'settings.backups.search.sectionTitle': '搜索备份内容',
  'settings.backups.search.description': '逐份解压现有备份，搜索其中的内容。',
  'settings.backups.search.action': '搜索备份内容',
  'settings.backups.search.title': '搜索备份内容',
  'settings.backups.search.input': '搜索词',
  'settings.backups.search.placeholder': '输入关键词',
  'settings.backups.search.submit': '搜索',
  'settings.backups.search.cancel': '取消',
  'settings.backups.search.continue': '继续搜索',
  'settings.backups.search.noMoreResults': '没有更多结果',
  'settings.backups.search.initial': '输入关键词。',
  'settings.backups.search.searchingBackups': '正在搜索备份内容...',
  'settings.backups.search.failed': '备份搜索已停止。{message}',
  'settings.backups.search.cancelled': '已取消备份搜索。',
  'settings.backups.search.complete': '没有更多匹配内容。',
  'settings.backups.search.completePartial': '没有更多可读的匹配内容；有 {count} 个备份无法读取。',
  'settings.backups.search.trashed': '在废纸篓'
};
