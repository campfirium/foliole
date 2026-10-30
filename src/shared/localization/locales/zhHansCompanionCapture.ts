import type { TranslationKey } from '../translations';

export const ZH_HANS_COMPANION_CAPTURE_TRANSLATIONS: Partial<Record<TranslationKey, string>> = {
  'companion.capture.title': '捕获',
  'companion.capture.text': '捕获文本',
  'companion.capture.placeholder': '输入一个新主题',
  'companion.capture.paste': '从剪贴板粘贴',
  'companion.capture.error.clipboardEmpty': '剪贴板中没有文本。',
  'companion.capture.error.clipboardFailed': '无法读取剪贴板。请允许访问剪贴板后重试。',
  'companion.capture.upload': '上传文件',
  'companion.capture.close': '关闭',
  'companion.capture.refresh': '刷新',
  'companion.capture.refreshing': '刷新中...',
  'companion.capture.error.refreshFailed': '主题已保存，列表刷新失败。请重试刷新。',
  'companion.capture.save': '保存',
  'companion.capture.saving': '保存中...',
  'companion.capture.error.inboxUnavailable': '请先同步这台设备，再保存新主题。',
  'companion.capture.error.saveFailed': '无法保存这个主题。请重试。'
};
