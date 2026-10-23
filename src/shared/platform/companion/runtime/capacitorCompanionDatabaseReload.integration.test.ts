import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { SQLiteConnection } from '@capacitor-community/sqlite';
import { afterEach, expect, it } from 'vitest';

import { createAndroidSqlitePluginFake } from './androidSqlitePluginFake.testSupport';
import { CapacitorCompanionDatabaseOwner, type CapacitorCompanionDatabaseManager } from './capacitorCompanionDatabaseOwner';

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
  const manager = new SQLiteConnection(native.plugin as never) as unknown as CapacitorCompanionDatabaseManager;
  const owner = new CapacitorCompanionDatabaseOwner(manager, 'android');
  return { owner, opened: owner.open({ expectedHostName: 'A5', now: '2026-10-23T00:00:00Z' }) };
}

const readProbe = (owner: CapacitorCompanionDatabaseOwner) => owner.read(db =>
  db.query<{ value: string }>("SELECT value FROM companion_meta WHERE key = 'reload_probe'"));

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
