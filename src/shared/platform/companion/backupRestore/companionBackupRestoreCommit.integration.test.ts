import { afterEach, describe, expect, it, vi } from 'vitest';

import { commitCompanionBackupRestore, revertCompanionBackupRestore, stageCompanionBackupRestore } from './companionBackupRestore';
import { createSpareDevice } from './companionBackupRestoreDevice.testSupport';

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });

async function stagedSpareDevice() {
  const device = await createSpareDevice(cleanups);
  await stageCompanionBackupRestore({ ...device, now: () => '2026-11-21T00:00:00Z' }, 'zip');
  const order: string[] = [];
  const context = {
    owner: device.owner,
    port: device.port,
    exclusive<T>(task: () => Promise<T>) { order.push('exclusive'); return task(); },
    closeDatabase: vi.fn(async () => { order.push('close'); await device.owner.close(); }),
    forgetBackupFolder: vi.fn(async () => { order.push('forget'); }),
    reload: vi.fn(() => { order.push('reload'); })
  };
  device.port.commit.mockImplementationOnce(async () => {
    order.push(`commit:${device.native.nativeConnections().join(',') || 'closed'}`);
    await device.port.commit.getMockImplementation()!();
  });
  return { device, context, order };
}

const read = <T,>(owner: Awaited<ReturnType<Awaited<ReturnType<typeof createSpareDevice>>['reopen']>>, sql: string) =>
  owner.read(db => db.query<T & Record<string, unknown>>(sql));

describe('replacing the spare phone library with a staged backup', () => {
  it('opens the restored library after the app reloads, as this offline device', async () => {
    const { device, context, order } = await stagedSpareDevice();
    const spareId = await read<{ value: string }>(device.owner, "SELECT value FROM companion_meta WHERE key = 'device_id'");

    await commitCompanionBackupRestore(context);
    expect(order).toEqual(['exclusive', 'close', 'commit:closed', 'forget', 'reload']);

    const restored = await device.reopen();
    expect(await read(restored, "SELECT id, title FROM nodes WHERE kind = 'topic'")).toEqual([{ id: 'topic-1', title: 'Images' }]);
    expect(await read(restored, 'SELECT host_name, reading_position FROM node_reading_host_state'))
      .toEqual([{ host_name: 'Spare Phone', reading_position: 42 }]);
    expect(await read(restored, "SELECT value FROM companion_meta WHERE key = 'device_id'")).toEqual(spareId);
    expect(await read(restored, 'SELECT COUNT(*) AS count FROM sync_group_local_state')).toEqual([{ count: 0 }]);
    await restored.close();
  });

  it('keeps the current library open and untouched while this phone is in a sync group', async () => {
    const { device, context } = await stagedSpareDevice();
    await device.owner.runWriter(async db => {
      await db.run("INSERT INTO sync_groups (group_id, display_name, workgroup_key, created_at, updated_at) VALUES ('g', 'Home', 'k', 'now', 'now')");
      await db.run("INSERT INTO sync_group_local_state (singleton_id, group_id, local_device_identity_key, state, updated_at) VALUES (1, 'g', 'spare', 'active', 'now')");
    });
    await expect(commitCompanionBackupRestore(context)).rejects.toThrow('restore_sync_group_active');
    expect(context.closeDatabase).not.toHaveBeenCalled();
    expect(device.port.commit).not.toHaveBeenCalled();
    expect(await read(device.owner, "SELECT id FROM nodes WHERE kind = 'topic'")).toEqual([{ id: 'spare-topic' }]);
  });

  it('reports a failed swap without reloading, and the original library still opens', async () => {
    const { device, context } = await stagedSpareDevice();
    device.port.commit.mockReset();
    device.port.commit.mockRejectedValueOnce(new Error('restore_swap_unavailable'));
    await expect(commitCompanionBackupRestore(context)).rejects.toThrow('restore_swap_unavailable');
    expect(context.reload).not.toHaveBeenCalled();
    expect(context.forgetBackupFolder).not.toHaveBeenCalled();
    const reopened = await device.reopen();
    expect(await read(reopened, "SELECT id FROM nodes WHERE kind = 'topic'")).toEqual([{ id: 'spare-topic' }]);
    await reopened.close();
  });
});

describe('putting the previous spare phone library back', () => {
  it('reopens the original library and keeps the restored one as the previous library', async () => {
    const { device, context } = await stagedSpareDevice();
    await commitCompanionBackupRestore(context);
    const restored = await device.reopen();
    const reverting = { ...context, owner: restored, closeDatabase: vi.fn(() => restored.close()), reload: vi.fn() };

    await revertCompanionBackupRestore(reverting);
    expect(device.port.revert).toHaveBeenCalledOnce();
    expect(reverting.reload).toHaveBeenCalledOnce();
    const original = await device.reopen();
    expect(await read(original, "SELECT id FROM nodes WHERE kind = 'topic'")).toEqual([{ id: 'spare-topic' }]);
    await original.close();

    const current = await device.reopen();
    await revertCompanionBackupRestore({ ...reverting, owner: current, closeDatabase: () => current.close() });
    const again = await device.reopen();
    expect(await read(again, "SELECT id FROM nodes WHERE kind = 'topic'")).toEqual([{ id: 'topic-1' }]);
    await again.close();
  });

  it('does not put the previous library back while the current one is in a sync group', async () => {
    const { device, context } = await stagedSpareDevice();
    await device.owner.runWriter(async db => {
      await db.run("INSERT INTO sync_groups (group_id, display_name, workgroup_key, created_at, updated_at) VALUES ('g', 'Home', 'k', 'now', 'now')");
      await db.run("INSERT INTO sync_group_local_state (singleton_id, group_id, local_device_identity_key, state, updated_at) VALUES (1, 'g', 'spare', 'active', 'now')");
    });
    await expect(revertCompanionBackupRestore(context)).rejects.toThrow('restore_sync_group_active');
    expect(device.port.revert).not.toHaveBeenCalled();
    expect(context.closeDatabase).not.toHaveBeenCalled();
  });
});
