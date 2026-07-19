import type { TranslationKey } from '../translations';

export const ZH_HANS_COMPANION_APP_TRANSLATIONS: Partial<Record<TranslationKey, string>> = {
  'companion.app.retry': '重试',
  'companion.app.starting.eyebrow': '移动端运行环境',
  'companion.app.starting.message': '正在准备稳定的设备身份和本地移动端存储，然后加载主题界面。',
  'companion.app.starting.title': '正在启动移动端运行环境',
  'companion.app.bootstrap.module': '移动端启动',
  'companion.app.bootstrapFailed': '移动端启动失败',
  'companion.app.iosPrepared.eyebrow': 'Foliole iPhone 端',
  'companion.app.iosPrepared.message': '本机存储已经就绪。当前版本暂不提供主题浏览、复习和同步。',
  'companion.app.iosPrepared.title': 'iPhone 端已准备好'
};
