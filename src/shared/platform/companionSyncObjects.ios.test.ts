import { expect, it, vi } from 'vitest';

const capacitorMock = vi.hoisted(() => ({
  loadSyncObjects: vi.fn(),
  loadSyncNodeConflicts: vi.fn()
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => 'ios',
    isNativePlatform: () => true
  },
  registerPlugin: vi.fn(() => ({
    loadSyncObjects: capacitorMock.loadSyncObjects,
    loadSyncNodeConflicts: capacitorMock.loadSyncNodeConflicts
  }))
}));

import {
  loadCompanionSyncNodeConflicts,
  loadCompanionSyncSettingValueJson
} from './companionSyncObjects';

it('treats Android-only conflict copies as absent on iOS', async () => {
  await expect(loadCompanionSyncNodeConflicts()).resolves.toEqual([]);
  expect(capacitorMock.loadSyncNodeConflicts).not.toHaveBeenCalled();
});

it('loads an iOS device setting through its exact shared sync identity', async () => {
  capacitorMock.loadSyncObjects.mockResolvedValue({
    objects: [{
      object_id: 'device:ios:phone:*:handoff_reminder_settings',
      object_type: 'setting',
      payload_json: JSON.stringify({
        key: 'handoff_reminder_settings',
        value_json: '{"fixedTime":"20:30","shortDelay":"15"}'
      })
    }]
  });

  await expect(loadCompanionSyncSettingValueJson('handoff_reminder_settings'))
    .resolves.toBe('{"fixedTime":"20:30","shortDelay":"15"}');
  expect(capacitorMock.loadSyncObjects).toHaveBeenCalledWith({
    object_ids: ['device:ios:phone:*:handoff_reminder_settings'],
    object_types: ['setting']
  });
});
