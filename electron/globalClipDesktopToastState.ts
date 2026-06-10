export type GlobalClipToastStatus = 'copyFailed' | 'empty' | 'importFailed' | 'pending' | 'success';

export interface GlobalClipDesktopToast {
  close: () => void;
  update: (status: GlobalClipToastStatus, targetNodeId?: string | null, previewTitle?: string | null) => void;
}

export type GlobalClipToastLocale = 'en' | 'zh-Hans';

export function resolveToastDisplayMs(status: GlobalClipToastStatus) {
  if (status === 'importFailed') return 3500;
  if (status === 'success') return 3000;
  return status === 'pending' ? 0 : 2500;
}

export function resolveToastText(status: GlobalClipToastStatus, locale: GlobalClipToastLocale = 'en') {
  if (locale === 'zh-Hans') {
    switch (status) {
      case 'copyFailed':
        return {
          meta: '源应用没有接受复制。',
          title: '未能开始剪辑'
        };
      case 'empty':
        return {
          meta: '请先选择文本或复制图片。',
          title: '没有剪辑内容'
        };
      case 'importFailed':
        return {
          meta: '请稍后再试。',
          title: '未能完成剪辑'
        };
      case 'success':
        return {
          meta: '已保存到收件箱',
          title: '已剪辑'
        };
      case 'pending':
      default:
        return {
          meta: '正在捕获选中文本或剪贴板',
          title: '正在剪辑到收件箱'
        };
    }
  }
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
    case 'success':
      return {
        meta: 'Saved to Inbox',
        title: 'Clipped'
      };
    case 'pending':
    default:
      return {
        meta: 'Capturing selection or clipboard',
        title: 'Clipping to Inbox'
      };
  }
}

export function serializeToastState(status: GlobalClipToastStatus, locale: GlobalClipToastLocale = 'en') {
  return JSON.stringify({
    status,
    ...resolveToastText(status, locale)
  });
}
