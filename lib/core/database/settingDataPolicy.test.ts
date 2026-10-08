import { expect, it } from 'vitest';

import { isWorkspaceSettingObject, resolveSettingDataPolicy } from './settingDataPolicy.js';

it.each(['review_scheduler_settings', 'search_aliases_document', 'system_entry_display_names'])(
  'shares and restores the global %s setting', (key) => {
    expect(resolveSettingDataPolicy(key)).toMatchObject({ ownership: 'workspace', recovery: 'saved' });
    expect(isWorkspaceSettingObject(`user_space:windows:desktop:*:${key}`)).toBe(true);
  }
);

it.each(['app_settings', 'backup_settings', 'import_manager_settings', 'library_path_settings'])(
  'keeps %s device-owned while allowing it to be saved for device recovery', (key) => {
    expect(resolveSettingDataPolicy(key)).toMatchObject({ ownership: 'device', recovery: 'saved' });
    expect(isWorkspaceSettingObject(`user_space:windows:desktop:*:${key}`)).toBe(false);
    expect(isWorkspaceSettingObject(`host:windows:desktop:Device:${key}`)).toBe(false);
  }
);

it('distinguishes recoverable device identity from transient sync process state', () => {
  expect(resolveSettingDataPolicy('device_id')).toMatchObject({ ownership: 'device', recovery: 'saved' });
  expect(resolveSettingDataPolicy('sync_group_activity')).toMatchObject({ recovery: 'regenerated' });
});
