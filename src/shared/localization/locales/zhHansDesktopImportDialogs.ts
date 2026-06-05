import type { TranslationKey } from '../translations';

export const ZH_HANS_DESKTOP_IMPORT_DIALOG_TRANSLATIONS: Partial<Record<TranslationKey, string>> = {
  'desktop.epubImport.mode.title': '选择阅读模式',
  'desktop.epubImport.mode.description': '之后可以从主题右键菜单更改。',
  'desktop.epubImport.mode.aria': 'EPUB 阅读模式',
  'desktop.epubImport.mode.sequential.label': '顺序阅读',
  'desktop.epubImport.mode.sequential.suitability': '适合新内容',
  'desktop.epubImport.mode.sequential.description': '按章节顺序阅读。当前章节移出后，下一章才会进入复习队列。',
  'desktop.epubImport.mode.free.label': '自由阅读',
  'desktop.epubImport.mode.free.suitability': '适合已有内容',
  'desktop.epubImport.mode.free.description': '所有章节保持可用，可以不受章节顺序限制进入复习队列。',
  'desktop.readwise.importDialog.blockedTitle': '请先预览导入',
  'desktop.readwise.importDialog.ok': '确认',
  'desktop.readwise.importDialog.title': 'Readwise 导入',
  'desktop.readwise.importDialog.previewTitle': 'Readwise 导入预览',
  'desktop.readwise.importDialog.preparing': '正在准备预览...',
  'desktop.readwise.importDialog.cancel': '取消',
  'desktop.readwise.importDialog.cancelling': '正在取消',
  'desktop.readwise.importDialog.import': '导入',
  'desktop.readwise.importDialog.importing': '导入中',
  'desktop.readwise.previewSample.highlightMissing': '这条高亮没有在来源主题正文中找到。'
};
