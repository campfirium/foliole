import { describe, expect, it } from 'vitest';

import {
  assertSystemEntryDisplayNamesSettingIdentity,
  assertSystemEntryDisplayNamesSettingPayload,
  parseSystemEntryDisplayNamesPayload,
  parseSystemEntryDisplayNamesValueJson,
  SYSTEM_ENTRY_DISPLAY_NAMES_SETTING_IDENTITY,
  SYSTEM_ENTRY_IDS
} from './systemEntryDisplayNameContract.js';

const allNames = Object.fromEntries(SYSTEM_ENTRY_IDS.map((id) => [id, `Custom ${id}`]));

describe('system entry display name contract', () => {
  it('accepts one canonical versioned map for all stable ids', () => {
    expect(parseSystemEntryDisplayNamesPayload({
      customDisplayNameById: allNames,
      version: 1
    })).toEqual({ customDisplayNameById: allNames, version: 1 });
    expect(assertSystemEntryDisplayNamesSettingIdentity(
      SYSTEM_ENTRY_DISPLAY_NAMES_SETTING_IDENTITY.objectId
    )).toBe(true);
  });

  it.each([
    [{ customDisplayNameById: { future: 'Future' }, version: 1 }, 'unknown_system_entry_id:future'],
    [{ customDisplayNameById: { inbox: '' }, version: 1 }, 'invalid_system_entry_display_name:inbox'],
    [{ customDisplayNameById: { inbox: ' Inbox ' }, version: 1 }, 'invalid_system_entry_display_name:inbox'],
    [{ customDisplayNameById: { inbox: 7 }, version: 1 }, 'invalid_system_entry_display_name:inbox'],
    [{ customDisplayNameById: {}, version: 2 }, 'unsupported_system_entry_display_names_version'],
    [{ customDisplayNameById: {}, extra: true, version: 1 }, 'invalid_system_entry_display_names_payload']
  ])('rejects a non-canonical payload with %s', (payload, message) => {
    expect(() => parseSystemEntryDisplayNamesPayload(payload)).toThrow(message);
  });

  it('rejects malformed JSON and non-canonical identities', () => {
    expect(() => parseSystemEntryDisplayNamesValueJson('{')).toThrow('invalid_system_entry_display_names_json');
    expect(() => assertSystemEntryDisplayNamesSettingIdentity(
      'user_space:android:phone:*:system_entry_display_names'
    )).toThrow('invalid_system_entry_display_names_identity');
    expect(() => assertSystemEntryDisplayNamesSettingPayload(
      SYSTEM_ENTRY_DISPLAY_NAMES_SETTING_IDENTITY.objectId,
      { form_factor: 'phone', host_name: '*', key: 'system_entry_display_names',
        platform: 'android', scope: 'user_space', value_json: '{"customDisplayNameById":{},"version":1}' }
    )).toThrow('invalid_system_entry_display_names_identity');
  });
});
