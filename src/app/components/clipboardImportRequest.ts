export const CLIPBOARD_IMPORT_REQUEST_EVENT = 'foliole:clipboard-import-request';

export function requestClipboardImport() {
  window.dispatchEvent(new Event(CLIPBOARD_IMPORT_REQUEST_EVENT));
}
