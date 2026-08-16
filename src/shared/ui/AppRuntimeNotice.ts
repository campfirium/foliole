import { useSyncExternalStore } from 'react';

export type AppRuntimeNoticeTone = 'success' | 'error' | 'info';

export interface AppRuntimeNoticeAction {
  label: string;
  onSelect: () => void;
}

export interface AppRuntimeNoticeOptions {
  durationMs?: number;
  presentation?: 'overlay' | 'trash-row';
}

interface AppRuntimeNoticeState {
  action?: AppRuntimeNoticeAction;
  durationMs?: number;
  id: number;
  message: string;
  presentation?: 'overlay' | 'trash-row';
  tone: AppRuntimeNoticeTone;
}

let currentNotice: AppRuntimeNoticeState | null = null;
let nextNoticeId = 1;
const subscribers = new Set<() => void>();

function emitChange() {
  subscribers.forEach((subscriber) => subscriber());
}

function subscribeAppRuntimeNotice(subscriber: () => void) {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

function getAppRuntimeNoticeSnapshot() {
  return currentNotice;
}

export function showAppRuntimeNotice(
  message: string,
  tone: AppRuntimeNoticeTone = 'error',
  action?: AppRuntimeNoticeAction,
  options?: AppRuntimeNoticeOptions
) {
  const trimmedMessage = message.trim();
  if (!trimmedMessage) {
    return null;
  }
  const id = nextNoticeId;
  currentNotice = {
    id,
    ...(action ? { action } : {}),
    ...(options?.durationMs ? { durationMs: options.durationMs } : {}),
    message: trimmedMessage,
    ...(options?.presentation ? { presentation: options.presentation } : {}),
    tone
  };
  nextNoticeId += 1;
  emitChange();
  return id;
}

export function clearAppRuntimeNotice(id: number) {
  if (currentNotice?.id !== id) {
    return;
  }
  currentNotice = null;
  emitChange();
}

export function useAppRuntimeNotice() {
  return useSyncExternalStore(
    subscribeAppRuntimeNotice,
    getAppRuntimeNoticeSnapshot,
    getAppRuntimeNoticeSnapshot
  );
}
