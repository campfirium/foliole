import type { TranslationKey } from '../translations';

export const ZH_HANS_SETTINGS_BACKUP_SEARCH_TRANSLATIONS: Partial<Record<TranslationKey, string>> = {
  'settings.backups.search.sectionAria': '搜索备份设置区',
  'settings.backups.search.sectionTitle': '搜索备份',
  'settings.backups.search.rowTitle': '查找早期内容',
  'settings.backups.search.description': '无需恢复或更改资料库，只读查找现有备份中的主题。',
  'settings.backups.search.action': '搜索备份',
  'settings.backups.search.title': '搜索备份',
  'settings.backups.search.close': '关闭搜索备份',
  'settings.backups.search.input': '搜索词',
  'settings.backups.search.placeholder': '标题或正文中的文字',
  'settings.backups.search.submit': '搜索',
  'settings.backups.search.searching': '正在搜索...',
  'settings.backups.search.cancel': '取消',
  'settings.backups.search.previous': '上一个',
  'settings.backups.search.continue': '继续',
  'settings.backups.search.position': '已看 {current}/{total}',
  'settings.backups.search.initial': '这里只搜索现有备份，不会恢复或更改当前资料库及原始备份文件。',
  'settings.backups.search.searchingBackups': '正在从最新到最早查找备份...',
  'settings.backups.search.failed': '备份搜索已停止。{message}',
  'settings.backups.search.cancelled': '已取消备份搜索。',
  'settings.backups.search.complete': '没有更早的匹配内容。',
  'settings.backups.search.completePartial': '没有更早的可读匹配内容；有 {count} 个备份无法读取。',
  'settings.backups.search.trashed': '当时在废纸篓',
  'settings.backups.search.sourceTime': '来源备份：{time}'
};
