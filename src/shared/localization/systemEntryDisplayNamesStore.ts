import { useSyncExternalStore } from 'react';

import {
  SYSTEM_ENTRY_DISPLAY_NAMES_PAYLOAD_VERSION,
  parseSystemEntryDisplayNamesPayload,
  type SystemEntryDisplayNamesPayload,
  type SystemEntryId
} from '../../../lib/platform/systemEntryDisplayNameContract';

const EMPTY_PAYLOAD: SystemEntryDisplayNamesPayload = {
  customDisplayNameById: {},
  version: SYSTEM_ENTRY_DISPLAY_NAMES_PAYLOAD_VERSION
};

const listeners = new Set<() => void>();
let snapshot = { payload: EMPTY_PAYLOAD, revision: 0 };

export function getSystemEntryDisplayNamesSnapshot() {
  return snapshot;
}

export function setSystemEntryDisplayNames(value: unknown) {
  const payload = parseSystemEntryDisplayNamesPayload(value);
  if (JSON.stringify(payload) === JSON.stringify(snapshot.payload)) return payload;
  snapshot = { payload, revision: snapshot.revision + 1 };
  listeners.forEach((listener) => listener());
  return payload;
}

export function systemEntryDisplayNameOverride(id: SystemEntryId) {
  return snapshot.payload.customDisplayNameById[id] ?? null;
}

export function subscribeSystemEntryDisplayNames(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSystemEntryDisplayNamesSnapshot() {
  return useSyncExternalStore(
    subscribeSystemEntryDisplayNames,
    getSystemEntryDisplayNamesSnapshot,
    getSystemEntryDisplayNamesSnapshot
  );
}
