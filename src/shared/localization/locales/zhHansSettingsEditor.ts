import type { TranslationKey } from '../translations';

export const ZH_HANS_SETTINGS_EDITOR_TRANSLATIONS: Partial<Record<TranslationKey, string>> = {
  'settings.search.editorImmersiveDoubleClick.title': '双击正文进入编辑',
  'settings.search.editorImmersiveDoubleClick.description':
    '在沉浸阅读中，双击正文可进入编辑。关闭后，双击不再进入编辑，仍可用于选择文本；按 Enter 仍可进入编辑。',
  'settings.editor.readingMode.section': '阅读模式',
  'settings.editor.readingMode.aria': '阅读模式设置区'
};
