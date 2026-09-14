const OPEN_BACKUP_SEARCH_DIALOG_EVENT = 'foliole:open-backup-search-dialog';

export function requestBackupSearchDialogOpen() {
  window.dispatchEvent(new Event(OPEN_BACKUP_SEARCH_DIALOG_EVENT));
}

export function subscribeBackupSearchDialogOpen(listener: () => void) {
  window.addEventListener(OPEN_BACKUP_SEARCH_DIALOG_EVENT, listener);
  return () => window.removeEventListener(OPEN_BACKUP_SEARCH_DIALOG_EVENT, listener);
}
