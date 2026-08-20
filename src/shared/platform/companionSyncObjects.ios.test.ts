import { expect, it, vi } from 'vitest';

const capacitorMock = vi.hoisted(() => ({
  loadSyncObjects: vi.fn(),
  loadSyncNodeConflicts: vi.fn()
}));
const iosReads = vi.hoisted(() => ({ conflicts: vi.fn(), hostName: vi.fn(), objects: vi.fn() }));

vi.mock('./companion/runtime/iosCompanionActiveDatabaseReads', () => ({
  loadIosSyncNodeConflicts: iosReads.conflicts,
  loadIosCompanionHostName: iosReads.hostName,
  loadIosSyncObjects: iosReads.objects
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
  iosReads.conflicts.mockResolvedValue([]);
  await expect(loadCompanionSyncNodeConflicts()).resolves.toEqual([]);
  expect(capacitorMock.loadSyncNodeConflicts).not.toHaveBeenCalled();
  expect(iosReads.conflicts).toHaveBeenCalledOnce();
});

it('loads an iOS Host setting through its exact shared sync identity', async () => {
  iosReads.hostName.mockResolvedValue('iPhone');
  iosReads.objects.mockResolvedValue([{
      object_id: 'host:ios:phone:iPhone:handoff_reminder_settings',
      object_type: 'setting',
      payload_json: JSON.stringify({
        key: 'handoff_reminder_settings',
        value_json: '{"fixedTime":"20:30","shortDelay":"15"}'
      })
  }]);

  await expect(loadCompanionSyncSettingValueJson('handoff_reminder_settings'))
    .resolves.toBe('{"fixedTime":"20:30","shortDelay":"15"}');
  expect(iosReads.objects).toHaveBeenCalledWith(
    ['host:ios:phone:iPhone:handoff_reminder_settings'], ['setting']
  );
});
