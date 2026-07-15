export type GlobalClipToastStatus = 'copyFailed' | 'empty' | 'importFailed' | 'pending' | 'permissionRequired' | 'success';

export interface GlobalClipDesktopToast {
  close: () => void;
  update: (status: GlobalClipToastStatus, targetNodeId?: string | null, previewTitle?: string | null) => void;
}

export type GlobalClipToastLocale = 'en' | 'zh-Hans';

export function resolveToastDisplayMs(
  status: GlobalClipToastStatus,
  platform: NodeJS.Platform = process.platform
) {
  if (status === 'importFailed' || status === 'permissionRequired') return 3500;
  if (status === 'success') return platform === 'darwin' ? 5000 : 3000;
  return status === 'pending' ? 0 : 2500;
}

function resolveZhHansToastText(status: GlobalClipToastStatus) {
  switch (status) {
    case 'copyFailed':
      return { meta: '源应用没有接受复制。', title: '未能开始剪辑' };
    case 'empty':
      return { meta: '请先选择文本或复制图片。', title: '没有剪辑内容' };
    case 'importFailed':
      return { meta: '请稍后再试。', title: '未能完成剪辑' };
    case 'permissionRequired':
      return {
        meta: '请在“系统设置 → 隐私与安全性 → 辅助功能”中允许 Foliole，然后重新选择内容。',
        title: '需要允许 Foliole 使用全局剪辑'
      };
    case 'success':
      return { meta: '已保存到收件箱 · 打开', title: '已剪辑' };
    case 'pending':
    default:
      return { meta: '', title: '' };
  }
}

function resolveEnglishToastText(status: GlobalClipToastStatus) {
  switch (status) {
    case 'copyFailed':
      return {
        meta: 'The source app did not accept copy.',
        title: 'Could not start clipping'
      };
    case 'empty':
      return {
        meta: 'Select text or copy an image first.',
        title: 'Nothing clipped'
      };
    case 'importFailed':
      return {
        meta: 'Try again in a moment.',
        title: 'Could not finish clipping'
      };
    case 'permissionRequired':
      return {
        meta: 'Allow Foliole in System Settings → Privacy & Security → Accessibility, then select again.',
        title: 'Allow Foliole to capture globally'
      };
    case 'success':
      return {
        meta: 'Saved to Inbox · Open',
        title: 'Clipped'
      };
    case 'pending':
    default:
      return {
        meta: '',
        title: ''
      };
  }
}

export function resolveToastText(status: GlobalClipToastStatus, locale: GlobalClipToastLocale = 'en') {
  return locale === 'zh-Hans' ? resolveZhHansToastText(status) : resolveEnglishToastText(status);
}

export function serializeToastState(status: GlobalClipToastStatus, locale: GlobalClipToastLocale = 'en') {
  return JSON.stringify({
    status,
    ...resolveToastText(status, locale)
  });
}
