import type { NativeSyncChangeCursor } from '../../../lib/platform/nativeSyncContract';

export function readWebCursor(key: string): NativeSyncChangeCursor | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? 'null') as NativeSyncChangeCursor | null;
    return parsed?.created_at && parsed.change_id ? parsed : null;
  } catch {
    return null;
  }
}

export function writeWebCursor(key: string, cursor: NativeSyncChangeCursor | null) {
  if (typeof window !== 'undefined') {
    if (cursor) window.localStorage.setItem(key, JSON.stringify(cursor));
    else window.localStorage.removeItem(key);
  }
  return cursor;
}

export function readWebNumberCursor(key: string): number | null {
  if (typeof window === 'undefined') return null;
  const value = Number(window.localStorage.getItem(key) ?? '0');
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
}

export function writeWebNumberCursor(key: string, cursor: number | null) {
  if (typeof window !== 'undefined') {
    if (cursor && cursor > 0) window.localStorage.setItem(key, String(Math.trunc(cursor)));
    else window.localStorage.removeItem(key);
  }
  return cursor;
}
