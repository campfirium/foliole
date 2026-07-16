import { useSyncExternalStore } from 'react';

import { APP_COMMAND_IDS } from './ids';

export type ContentRegionScaleCommandId =
  | typeof APP_COMMAND_IDS.increaseContentRegionScale
  | typeof APP_COMMAND_IDS.decreaseContentRegionScale
  | typeof APP_COMMAND_IDS.resetContentRegionScale;

interface ContentRegionScaleCommandHandler {
  isEnabled: (id: ContentRegionScaleCommandId) => boolean;
  run: (id: ContentRegionScaleCommandId) => boolean;
}

let handler: ContentRegionScaleCommandHandler | null = null;
let revision = 0;
const listeners = new Set<() => void>();

function notify() {
  revision += 1;
  listeners.forEach((listener) => listener());
}

export function isContentRegionScaleCommandId(id: string): id is ContentRegionScaleCommandId {
  return id === APP_COMMAND_IDS.increaseContentRegionScale ||
    id === APP_COMMAND_IDS.decreaseContentRegionScale ||
    id === APP_COMMAND_IDS.resetContentRegionScale;
}

export function registerContentRegionScaleCommandHandler(next: ContentRegionScaleCommandHandler) {
  handler = next;
  notify();
  return () => {
    if (handler === next) handler = null;
    notify();
  };
}

export function runContentRegionScaleCommand(id: ContentRegionScaleCommandId) {
  return handler?.run(id) ?? false;
}

export function isContentRegionScaleCommandEnabled(id: ContentRegionScaleCommandId) {
  return handler?.isEnabled(id) ?? false;
}

export function useContentRegionScaleCommandRevision() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => revision,
    () => revision
  );
}

export function notifyContentRegionScaleCommandStateChanged() {
  notify();
}
