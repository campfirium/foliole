const OPEN_CUSTOM_COPY_DIALOG_EVENT = 'foliole:open-custom-copy-dialog';

export function requestCustomCopyDialogOpen() {
  window.dispatchEvent(new Event(OPEN_CUSTOM_COPY_DIALOG_EVENT));
}

export function subscribeCustomCopyDialogOpen(listener: () => void) {
  window.addEventListener(OPEN_CUSTOM_COPY_DIALOG_EVENT, listener);
  return () => window.removeEventListener(OPEN_CUSTOM_COPY_DIALOG_EVENT, listener);
}
