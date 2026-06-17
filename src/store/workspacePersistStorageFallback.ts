function getLocalFallbackStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage;
}

export function readFallbackWorkspaceState(name: string) {
  const fallbackStorage = getLocalFallbackStorage();
  return fallbackStorage?.getItem(name) ?? null;
}

export function writeFallbackWorkspaceState(name: string, value: string) {
  getLocalFallbackStorage()?.setItem(name, value);
}

export function removeFallbackWorkspaceState(name: string) {
  getLocalFallbackStorage()?.removeItem(name);
}
