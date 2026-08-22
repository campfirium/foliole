import {
  SYSTEM_ENTRY_DISPLAY_NAMES_PAYLOAD_VERSION,
  parseSystemEntryDisplayNamesPayload,
  type SystemEntryDisplayNamesPayload
} from '../../lib/platform/systemEntryDisplayNameContract.js';

import { loadJsonSetting, saveJsonSetting } from './settingsStore.js';

const SETTING_KEY = 'system_entry_display_names';
const EMPTY_PAYLOAD: SystemEntryDisplayNamesPayload = {
  customDisplayNameById: {},
  version: SYSTEM_ENTRY_DISPLAY_NAMES_PAYLOAD_VERSION
};

export function loadSystemEntryDisplayNames(): SystemEntryDisplayNamesPayload {
  const stored = loadJsonSetting(SETTING_KEY);
  return stored === null ? EMPTY_PAYLOAD : parseSystemEntryDisplayNamesPayload(stored);
}

export function saveSystemEntryDisplayNames(value: unknown): SystemEntryDisplayNamesPayload {
  const payload = parseSystemEntryDisplayNamesPayload(value);
  saveJsonSetting(SETTING_KEY, payload);
  return payload;
}
