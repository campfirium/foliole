export type GlobalClipToastStatus = 'pending' | 'success';

export interface GlobalClipDesktopToast {
  close: () => void;
  update: (status: GlobalClipToastStatus, targetNodeId?: string | null, previewTitle?: string | null) => void;
}

export type GlobalClipToastLocale = 'en' | 'zh-Hans';

export function resolveToastDisplayMs(
  status: GlobalClipToastStatus,
  platform: NodeJS.Platform = process.platform
) {
  if (status === 'success') return platform === 'darwin' ? 5000 : 3000;
  return 0;
}

function resolveZhHansToastText(status: GlobalClipToastStatus) {
  switch (status) {
    case 'success':
      return { meta: '已保存到收件箱 · 打开', title: '已剪辑' };
    case 'pending':
    default:
      return { meta: '', title: '' };
  }
}

function resolveEnglishToastText(status: GlobalClipToastStatus) {
  switch (status) {
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
