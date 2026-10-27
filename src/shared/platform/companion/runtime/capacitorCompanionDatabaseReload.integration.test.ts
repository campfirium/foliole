import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import type { DbPort } from '../../../../../lib/core/sync/dbPort';

import { createAndroidSqlitePluginFake } from './androidSqlitePluginFake.testSupport';
import { CapacitorCompanionDatabaseOwner, type CapacitorCompanionDatabaseManager } from './capacitorCompanionDatabaseOwner';
import { CompanionDatabaseManager } from './companionDatabaseManager';
import { createOwnedCompanionConnection } from './companionOwnedConnection';

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });

function library() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'companion-reload-'));
  const native = createAndroidSqlitePluginFake(path.join(root, 'foliole-companionSQLite.db'));
  cleanups.push(() => { native.close(); rmSync(root, { recursive: true, force: true }); });
  return native;
}

/** A fresh document: a new plugin wrapper over the surviving native plugin. */
function openRenderer(native: ReturnType<typeof library>) {
  const manager = new CompanionDatabaseManager(native.plugin as never) as unknown as CapacitorCompanionDatabaseManager;
  const owner = new CapacitorCompanionDatabaseOwner(manager, 'android');
  return { manager, owner, opened: owner.open({ expectedHostName: 'A5', now: '2026-10-23T00:00:00Z' }) };
}

const readProbe = (owner: CapacitorCompanionDatabaseOwner) => owner.read(readProbeFrom);

it('reopens the companion database after the renderer reloads without closing it', async () => {
  const native = library();
  const first = openRenderer(native);
  const before = await first.opened;
  await first.owner.runWriter(db => db.run(
    "INSERT INTO companion_meta (key, value, updated_at) VALUES ('reload_probe', 'kept', '2026-10-23')"));

  // Reload: the old document disappears without close(); native keeps its connection.
  const second = openRenderer(native);
  const after = await second.opened;

  expect(after.deviceId).toBe(before.deviceId);
  expect(await readProbe(second.owner)).toEqual([{ value: 'kept' }]);
  expect(native.nativeConnections()).toEqual(['RW_foliole-companion']);
  await second.owner.close();
  expect(native.nativeConnections()).toEqual([]);
});

it('recovers the request snapshot connection a reloaded document left open', async () => {
  const native = library();
  const first = openRenderer(native);
  await first.opened;
  let entered!: () => void;
  const reading = new Promise<void>(resolve => { entered = resolve; });
  void first.owner.readSnapshot(async () => { entered(); await new Promise(() => undefined); });
  await reading;
  expect(native.nativeConnections()).toEqual(['RO_foliole-companion', 'RW_foliole-companion']);

  const second = openRenderer(native);
  await second.opened;
  const rows = await second.owner.readSnapshot(db => db.query("SELECT value FROM companion_meta WHERE key = 'device_id'"));

  expect(rows).toHaveLength(1);
  expect(native.nativeConnections()).toEqual(['RW_foliole-companion']);
});

it('rolls back an interrupted document transaction before reopening without losing committed facts', async () => {
  const native = library();
  const first = openRenderer(native);
  const before = await first.opened;
  await first.owner.runWriter(db => db.run(
    "INSERT INTO companion_meta (key, value, updated_at) VALUES ('reload_probe', 'kept', '2026-10-23')"));
  let entered!: () => void;
  const writing = new Promise<void>(resolve => { entered = resolve; });
  void first.owner.runWriter(db => db.transaction(async tx => {
    await tx.run("UPDATE companion_meta SET value = 'interrupted' WHERE key = 'reload_probe'");
    entered();
    // The document disappears here; its JavaScript finally block cannot run.
    await new Promise(() => undefined);
  }));
  await writing;

  const second = openRenderer(native);
  expect((await second.opened).deviceId).toBe(before.deviceId);
  expect(await readProbe(second.owner)).toEqual([{ value: 'kept' }]);
  await second.owner.runWriter(db => db.run(
    "UPDATE companion_meta SET value = 'writable' WHERE key = 'reload_probe'"));
  expect(await readProbe(second.owner)).toEqual([{ value: 'writable' }]);
  await second.owner.close();
  expect(native.nativeConnections()).toEqual([]);
});

it('does not recover or roll back a transaction owned by the current document', async () => {
  const native = library();
  const current = openRenderer(native);
  await current.opened;
  await current.owner.runWriter(db => db.transaction(async tx => {
    await tx.run("INSERT INTO companion_meta (key, value, updated_at) VALUES ('reload_probe', 'kept', 'now')");
    await expect(createOwnedCompanionConnection(current.manager, false)).rejects.toThrow('already exists');
    expect(await readProbeFrom(tx)).toEqual([{ value: 'kept' }]);
  }));
  expect(await readProbe(current.owner)).toEqual([{ value: 'kept' }]);
  await current.owner.close();
});

function readProbeFrom(db: DbPort) {
  return db.query<{ value: string }>("SELECT value FROM companion_meta WHERE key = 'reload_probe'");
}
