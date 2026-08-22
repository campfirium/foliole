import { beforeEach, expect, it, vi } from 'vitest';

import { SYSTEM_ENTRY_DISPLAY_NAMES_SETTING_IDENTITY } from '../../lib/platform/systemEntryDisplayNameContract';
import {
  getSystemEntryDisplayNamesSnapshot,
  setSystemEntryDisplayNames
} from '../shared/localization/systemEntryDisplayNamesStore';

const loadCompanionSyncSettingValueJson = vi.hoisted(() => vi.fn());
vi.mock('../shared/platform/companionSyncObjects', () => ({ loadCompanionSyncSettingValueJson }));

import { hydrateCompanionSystemEntryDisplayNames } from './companionSystemEntryDisplayNamesHydration';

beforeEach(() => {
  loadCompanionSyncSettingValueJson.mockReset();
  setSystemEntryDisplayNames({ customDisplayNameById: {}, version: 1 });
});

it('hydrates the canonical desktop-authored map on Android and iOS companion runtimes', async () => {
  loadCompanionSyncSettingValueJson.mockResolvedValue(
    JSON.stringify({
      customDisplayNameById: { trash: 'Archive bin' },
      version: 1
    })
  );

  await hydrateCompanionSystemEntryDisplayNames();

  expect(loadCompanionSyncSettingValueJson).toHaveBeenCalledWith(
    'system_entry_display_names',
    SYSTEM_ENTRY_DISPLAY_NAMES_SETTING_IDENTITY.objectId
  );
  expect(getSystemEntryDisplayNamesSnapshot().payload.customDisplayNameById.trash).toBe(
    'Archive bin'
  );
});

it('restores locale defaults when the synced map is absent', async () => {
  setSystemEntryDisplayNames({ customDisplayNameById: { trash: 'Archive bin' }, version: 1 });
  loadCompanionSyncSettingValueJson.mockResolvedValue(null);

  await hydrateCompanionSystemEntryDisplayNames();

  expect(getSystemEntryDisplayNamesSnapshot().payload.customDisplayNameById).toEqual({});
});
