import { expect, it, vi } from 'vitest';

const port = vi.hoisted(() => ({
  query: vi.fn(async () => [{
    joined_at: '2026-08-13T00:00:00.000Z', local_device_id: 'device-b', member_state: 'active'
  }]),
  run: vi.fn(async () => ({ changes: 1, lastId: 0 })),
  transaction: vi.fn(async (task: (value: unknown) => unknown) => task(port))
}));

vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({
    runWriter: (task: (value: unknown) => unknown) => task(port)
  })
}));

import { recordLocalCompanionSyncGroupDeparture } from './syncGroupStore';

it('clears peer progress when local Leave unbinds the Sync Group', async () => {
  await recordLocalCompanionSyncGroupDeparture({
    authorizationId: 'leave-b', deviceId: 'device-b', groupId: 'group-1',
    leftAt: '2026-08-13T01:00:00.000Z'
  });

  const statements = port.run.mock.calls.map((call) => (call as unknown[])[0]);
  expect(statements).toContain('DELETE FROM sync_delivery_receipts');
  expect(statements).toContain('DELETE FROM sync_peer_cursors');
  expect(statements.at(-1)).toContain('DELETE FROM sync_group_local_state');
});
