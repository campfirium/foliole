import { isDesktopRuntime } from '../../../shared/platform/runtime';

const OPEN_SUPER_MEMO_IMPORT_EVENT = 'foliole:open-supermemo-import';

export function requestSuperMemoImportOpen() {
  if (!isDesktopRuntime()) return false;
  window.dispatchEvent(new Event(OPEN_SUPER_MEMO_IMPORT_EVENT));
}

export function subscribeSuperMemoImportOpen(listener: () => void) {
  window.addEventListener(OPEN_SUPER_MEMO_IMPORT_EVENT, listener);
  return () => window.removeEventListener(OPEN_SUPER_MEMO_IMPORT_EVENT, listener);
}
