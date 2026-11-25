import type { TranslationKey } from '../translations';

export const ZH_HANS_SETTINGS_EDITOR_TRANSLATIONS: Partial<Record<TranslationKey, string>> = {
  'settings.search.editorImmersiveDoubleClick.title': '双击正文进入编辑',
  'settings.search.editorImmersiveDoubleClick.description':
    '在沉浸阅读中，双击正文可进入编辑。关闭后，双击不再进入编辑，仍可用于选择文本；按 Enter 仍可进入编辑。',
  'settings.search.cleanFormatting.path': '打开可编辑的主题，在编辑器右上角菜单中选择「清理格式…」。也可以在正文中右键选择。',
  'settings.search.cleanFormatting.terms': '格式清理|清除格式|去掉格式|移除格式|去除格式',
  'settings.search.imageCloze.path': '打开主题，在正文已保存到本机的图片上拖出要遮住的区域，再点勾号确认。',
  'settings.search.imageCloze.terms': '图像挖空|图片遮挡|图像遮挡|图片遮盖|图片遮罩',
  'settings.search.formulaCloze.path': '打开主题，在渲染后的公式上拖选要遮住的部分。',
  'settings.search.formulaCloze.terms': '数学挖空|方程挖空|公式遮挡|公式遮盖|数学公式挖空',
  'settings.editor.readingMode.section': '阅读模式',
  'settings.editor.readingMode.aria': '阅读模式设置区'
};
