import { useSyncExternalStore } from 'react';

export type AppRuntimeNoticeTone = 'success' | 'error';

export interface AppRuntimeNoticeAction {
  label: string;
  onSelect: () => void;
}

interface AppRuntimeNoticeState {
  action?: AppRuntimeNoticeAction;
  id: number;
  message: string;
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
  action?: AppRuntimeNoticeAction
) {
  const trimmedMessage = message.trim();
  if (!trimmedMessage) {
    return null;
  }
  const id = nextNoticeId;
  currentNotice = {
    id,
    ...(action ? { action } : {}),
    message: trimmedMessage,
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
