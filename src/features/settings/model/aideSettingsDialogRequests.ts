const OPEN_AIDE_SETTINGS_DIALOG_EVENT = 'foliole:open-aide-settings-dialog';

export function requestAideSettingsDialogOpen() {
  window.dispatchEvent(new Event(OPEN_AIDE_SETTINGS_DIALOG_EVENT));
}

export function subscribeAideSettingsDialogOpen(listener: () => void) {
  window.addEventListener(OPEN_AIDE_SETTINGS_DIALOG_EVENT, listener);
  return () => window.removeEventListener(OPEN_AIDE_SETTINGS_DIALOG_EVENT, listener);
}
