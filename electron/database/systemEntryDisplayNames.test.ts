// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const loadJsonSetting = vi.hoisted(() => vi.fn());
const saveJsonSetting = vi.hoisted(() => vi.fn());

vi.mock('./settingsStore.js', () => ({ loadJsonSetting, saveJsonSetting }));

import {
  loadSystemEntryDisplayNames,
  saveSystemEntryDisplayNames
} from './systemEntryDisplayNames.js';

const payload = { customDisplayNameById: { inbox: 'Reading inbox' }, version: 1 } as const;

beforeEach(() => {
  loadJsonSetting.mockReset();
  saveJsonSetting.mockReset();
});

it('loads an empty map when the library has no saved override', () => {
  loadJsonSetting.mockReturnValue(null);
  expect(loadSystemEntryDisplayNames()).toEqual({ customDisplayNameById: {}, version: 1 });
});

it('validates and saves the whole map without consulting remote members', () => {
  expect(saveSystemEntryDisplayNames(payload)).toEqual(payload);
  expect(saveJsonSetting).toHaveBeenCalledWith('system_entry_display_names', payload);
});

it('loads the committed map after a restart boundary', () => {
  saveSystemEntryDisplayNames(payload);
  loadJsonSetting.mockReturnValue(payload);
  expect(loadSystemEntryDisplayNames()).toEqual(payload);
});
