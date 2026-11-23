import type { TranslationKey } from '../translations';

export const ZH_HANS_SETTINGS_AIDE_PERMISSIONS_TRANSLATIONS: Partial<Record<TranslationKey, string>> = {
  'settings.aideDialog.permissions.nav': 'AI 权限',
  'settings.aideDialog.permissions.description': '选择 Aide 回答时可以自己读取哪些内容。改动从下一条消息起生效。',
  'settings.aideDialog.permissions.reset': '恢复默认',
  'settings.aideDialog.permissions.read.title': '允许 AI 读取',
  'settings.aideDialog.permissions.read.description': 'AI 可以按需读取更多材料，并注明出处。',
  'settings.aideDialog.permissions.readBudget.title': '每次回答最多读取（token）',
  'settings.aideDialog.permissions.readBudget.description': '限制每次回答读取的内容总量',
  'settings.aideDialog.permissions.tool.continueReading.title': '继续读取',
  'settings.aideDialog.permissions.tool.continueReading.description': '按需读取材料的其他部分',
  'settings.aideDialog.permissions.tool.searchCurrent.title': '在当前材料里查找',
  'settings.aideDialog.permissions.tool.searchCurrent.description': '在当前材料中查找相关内容',
  'settings.aideDialog.permissions.tool.searchLibrary.title': '在资料库里查找',
  'settings.aideDialog.permissions.tool.searchLibrary.description': '在资料库中查找相关材料',
  'settings.aideDialog.permissions.tool.traceSource.title': '找回原文',
  'settings.aideDialog.permissions.tool.traceSource.description': '沿摘录的来源逐级找到原文',
  'settings.aideDialog.permissions.tool.readPdfPage.title': '读取 PDF 页面',
  'settings.aideDialog.permissions.tool.readPdfPage.description': '读取 PDF 指定页面的文字',
  'settings.aideDialog.permissions.saveFailed': 'AI 权限设置未能保存。'
};
