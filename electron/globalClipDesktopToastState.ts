export type GlobalClipToastStatus = 'copyFailed' | 'empty' | 'importFailed' | 'pending' | 'success';

export interface GlobalClipDesktopToast {
  close: () => void;
  update: (status: GlobalClipToastStatus) => void;
}

export function resolveToastText(status: GlobalClipToastStatus) {
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
        meta: 'Ready to process',
        title: 'Clipped to Inbox'
      };
    case 'pending':
    default:
      return {
        meta: 'Capturing selection or clipboard',
        title: 'Clipping to Inbox'
      };
  }
}

export function serializeToastState(status: GlobalClipToastStatus) {
  return JSON.stringify({
    status,
    ...resolveToastText(status)
  });
}
