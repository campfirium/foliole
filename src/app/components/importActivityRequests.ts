export const CLIPBOARD_IMPORT_REQUEST_EVENT = 'foliole:clipboard-import-request';
export const FILE_IMPORT_REQUEST_EVENT = 'foliole:file-import-request';

export interface ClipboardImportRequestDetail {
  targetParentNodeId?: string;
}

function dispatchImportRequest(eventName: string, detail?: ClipboardImportRequestDetail) {
  window.dispatchEvent(detail ? new CustomEvent(eventName, { detail }) : new Event(eventName));
}

export function requestClipboardImport(detail?: ClipboardImportRequestDetail) {
  dispatchImportRequest(CLIPBOARD_IMPORT_REQUEST_EVENT, detail);
}

export function requestFileImport() {
  dispatchImportRequest(FILE_IMPORT_REQUEST_EVENT);
}
