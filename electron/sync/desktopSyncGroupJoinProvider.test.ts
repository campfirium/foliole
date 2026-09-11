import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  onAccept: null as null | ((device: Record<string, string>) => Promise<void>),
  register: vi.fn()
}));

vi.mock('../database/syncGroupStore.js', () => ({
  loadDesktopSyncGroupInfo: () => ({
    display_name: 'Group', group_id: 'group-a', workgroup_key: 'key-a'
  }),
  registerSyncGroupDevice: mocks.register
}));
vi.mock('./syncGroupJoinProvider.js', () => ({
  DesktopSyncGroupJoinProvider: class {
    constructor(_group: unknown, onAccept: typeof mocks.onAccept) { mocks.onAccept = onAccept; }
    clear() {}
  }
}));

import {
  clearDesktopSyncGroupJoinProvider,
  loadDesktopSyncGroupJoinProvider
} from './desktopSyncGroupJoinProvider.js';

it('registers an accepted Device without refreshing the stable topology advertisement', async () => {
  clearDesktopSyncGroupJoinProvider();
  loadDesktopSyncGroupJoinProvider();
  await mocks.onAccept?.({
    canonical_library_path: '/data/foliole.db',
    device_anchor: 'a1111111-1111-4111-8111-111111111111',
    device_name: 'A5', path_flavor: 'posix', platform: 'android'
  });
  expect(mocks.register).toHaveBeenCalledOnce();
});
