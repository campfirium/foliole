import type { TranslationKey } from '../translations';

export const ZH_HANS_COMPANION_CAPTURE_TRANSLATIONS: Partial<Record<TranslationKey, string>> = {
  'companion.capture.title': '捕获',
  'companion.capture.text': '捕获文本',
  'companion.capture.placeholder': '输入或朗读一个新主题',
  'companion.capture.paste': '从剪贴板粘贴',
  'companion.capture.upload': '上传文件',
  'companion.capture.save': '保存',
  'companion.capture.saving': '保存中...',
  'companion.capture.error.inboxUnavailable': '请先同步这台设备，再保存新主题。',
  'companion.capture.error.saveFailed': '无法保存这个主题。请重试。'
};
