export type GlobalClipToastStatus = 'copyFailed' | 'empty' | 'importFailed' | 'pending' | 'success';

export interface GlobalClipDesktopToast {
  close: () => void;
  update: (status: GlobalClipToastStatus, targetNodeId?: string | null, previewTitle?: string | null) => void;
}

export function resolveToastDisplayMs(status: GlobalClipToastStatus) {
  if (status === 'importFailed') return 3500;
  if (status === 'success') return 3000;
  return status === 'pending' ? 0 : 2500;
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

export function serializeToastState(status: GlobalClipToastStatus) {
  return JSON.stringify({
    status,
    ...resolveToastText(status)
  });
}
