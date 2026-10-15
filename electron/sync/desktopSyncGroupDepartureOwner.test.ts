// @vitest-environment node
import { expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  assertAccess: () => {},
  run: async (task: () => unknown): Promise<unknown> => task()
}));
vi.mock('../database/connection.js', async () => {
  const { SqliteConnectionCoordinator } = await import('../database/sqliteConnectionCoordinator.js');
  const owner = new SqliteConnectionCoordinator();
  state.assertAccess = () => owner.assertAccess();
  state.run = task => owner.runExclusive(task);
  return { runWithDatabaseConnectionOwner: state.run };
});
vi.mock('../database/syncGroupMemberStateStore.js', () => ({
  loadDesktopSyncGroupMemberState: () => { state.assertAccess(); return {}; }
}));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: () => null }));
vi.mock('./desktopSyncGroupMemberState.js', () => ({
  exchangeDesktopSyncGroupMemberState: vi.fn(), publishDesktopSyncGroupMemberState: vi.fn()
}));

import { publishDesktopSyncGroupDeparture } from './desktopSyncGroupMemberStateSession.js';

it('takes the departure snapshot after the current asynchronous database owner releases', async () => {
  let release!: () => void;
  const held = state.run(() => new Promise<void>(resolve => { release = resolve; }));
  const departure = publishDesktopSyncGroupDeparture('group', 'mac');
  release();
  await held;
  expect(await departure).toBe(false);
});
