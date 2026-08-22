// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../lib/platform/syncProtocolContract.js';

const loadJsonSetting = vi.hoisted(() => vi.fn());
const saveJsonSetting = vi.hoisted(() => vi.fn());
const loadDesktopSyncGroup = vi.hoisted(() => vi.fn());
const loadPairedCompanionAuthorizations = vi.hoisted(() => vi.fn());

vi.mock('./settingsStore.js', () => ({ loadJsonSetting, saveJsonSetting }));
vi.mock('./syncGroupStore.js', () => ({ loadDesktopSyncGroup }));
vi.mock('../sync/companionPairingStore.js', () => ({ loadPairedCompanionAuthorizations }));

import {
  loadSystemEntryDisplayNames,
  saveSystemEntryDisplayNames
} from './systemEntryDisplayNames.js';

const payload = { customDisplayNameById: { inbox: 'Reading inbox' }, version: 1 } as const;

beforeEach(() => {
  loadJsonSetting.mockReset();
  saveJsonSetting.mockReset();
  loadDesktopSyncGroup.mockReset();
  loadPairedCompanionAuthorizations.mockReset();
});

it('loads an empty map when the library has no saved override', () => {
  loadJsonSetting.mockReturnValue(null);
  expect(loadSystemEntryDisplayNames()).toEqual({ customDisplayNameById: {}, version: 1 });
});

it('validates and saves the whole map when every active peer supports it', () => {
  loadDesktopSyncGroup.mockReturnValue(group());
  loadPairedCompanionAuthorizations.mockReturnValue([
    {
      authorization_id: 'a5-auth',
      remote_protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR
    }
  ]);

  expect(saveSystemEntryDisplayNames(payload)).toEqual(payload);
  expect(saveJsonSetting).toHaveBeenCalledWith('system_entry_display_names', payload);
});

it('stops before any local write when an active peer lacks the capability', () => {
  loadDesktopSyncGroup.mockReturnValue(group());
  loadPairedCompanionAuthorizations.mockReturnValue([
    {
      authorization_id: 'a5-auth',
      remote_protocol: {
        ...CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
        capabilities: CURRENT_SYNC_PROTOCOL_DESCRIPTOR.capabilities.filter(
          (capability) => capability !== 'system-entry-display-names-v1'
        )
      }
    }
  ]);

  expect(() => saveSystemEntryDisplayNames(payload)).toThrow(
    'system_entry_display_names_upgrade_required'
  );
  expect(saveJsonSetting).not.toHaveBeenCalled();
});

function group() {
  return {
    local_host_name: 'Mac',
    local_member_state: 'active',
    members: [
      { authorization_id: 'local-auth', host_name: 'Mac' },
      { authorization_id: 'a5-auth', host_name: 'A5' }
    ]
  };
}
