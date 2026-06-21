export function canUseBrowserReservedAppShortcuts() {
  if (typeof window === 'undefined') {
    return true;
  }
  return Boolean(window.electronAPI);
}
