function key(scope: string) {
  return `foliole-companion-capture-back-draft:${encodeURIComponent(scope)}`;
}

export function readCaptureBackDraft(scope: string): string {
  try { return window.localStorage.getItem(key(scope)) ?? ''; } catch { return ''; }
}

export function persistCaptureBackDraft(scope: string, draft: string): boolean {
  try {
    if (draft) window.localStorage.setItem(key(scope), draft);
    else window.localStorage.removeItem(key(scope));
    return true;
  } catch { return false; }
}

export function clearCaptureBackDraft(scope: string): void {
  try { window.localStorage.removeItem(key(scope)); } catch { /* Keep the in-memory draft available. */ }
}
