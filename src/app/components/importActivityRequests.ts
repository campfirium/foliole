export const CLIPBOARD_IMPORT_REQUEST_EVENT = 'foliole:clipboard-import-request';
export const FILE_IMPORT_REQUEST_EVENT = 'foliole:file-import-request';

function dispatchImportRequest(eventName: string) {
  window.dispatchEvent(new Event(eventName));
}

export function requestClipboardImport() {
  dispatchImportRequest(CLIPBOARD_IMPORT_REQUEST_EVENT);
}

export function requestFileImport() {
  dispatchImportRequest(FILE_IMPORT_REQUEST_EVENT);
}
