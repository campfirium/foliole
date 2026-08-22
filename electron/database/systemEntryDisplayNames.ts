import { evaluateSystemEntryDisplayNamesWriteCompatibility } from '../../lib/platform/syncProtocolContract.js';
import {
  SYSTEM_ENTRY_DISPLAY_NAMES_PAYLOAD_VERSION,
  parseSystemEntryDisplayNamesPayload,
  type SystemEntryDisplayNamesPayload
} from '../../lib/platform/systemEntryDisplayNameContract.js';
import { loadPairedCompanionAuthorizations } from '../sync/companionPairingStore.js';

import { loadJsonSetting, saveJsonSetting } from './settingsStore.js';
import { loadDesktopSyncGroup } from './syncGroupStore.js';

const SETTING_KEY = 'system_entry_display_names';
const EMPTY_PAYLOAD: SystemEntryDisplayNamesPayload = {
  customDisplayNameById: {},
  version: SYSTEM_ENTRY_DISPLAY_NAMES_PAYLOAD_VERSION
};

export function loadSystemEntryDisplayNames(): SystemEntryDisplayNamesPayload {
  const stored = loadJsonSetting(SETTING_KEY);
  return stored === null ? EMPTY_PAYLOAD : parseSystemEntryDisplayNamesPayload(stored);
}

function assertActivePeersSupportDisplayNames() {
  const group = loadDesktopSyncGroup();
  if (!group || group.local_member_state !== 'active') return;
  const remoteMembers = group.members.filter(
    (member) => member.host_name !== group.local_host_name
  );
  if (remoteMembers.length === 0) return;
  const authorizations = loadPairedCompanionAuthorizations();
  for (const member of remoteMembers) {
    const authorization = authorizations.find(
      (item) => item.authorization_id === member.authorization_id
    );
    const compatibility = evaluateSystemEntryDisplayNamesWriteCompatibility(
      authorization?.remote_protocol
    );
    if (compatibility.status !== 'compatible') {
      throw new Error('system_entry_display_names_upgrade_required');
    }
  }
}

export function saveSystemEntryDisplayNames(value: unknown): SystemEntryDisplayNamesPayload {
  const payload = parseSystemEntryDisplayNamesPayload(value);
  assertActivePeersSupportDisplayNames();
  saveJsonSetting(SETTING_KEY, payload);
  return payload;
}
