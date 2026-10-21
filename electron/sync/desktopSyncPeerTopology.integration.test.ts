// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventory } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { createDesktopFramedSyncTwoProcessFixture,
  type DesktopFramedSyncFixtureProcess, type DesktopFramedSyncFixtureSnapshot
} from './desktopFramedSyncTwoProcess.testSupport.js';

type Device = { process: DesktopFramedSyncFixtureProcess; snapshot: DesktopFramedSyncFixtureSnapshot };
const peer = (device: Device, origin = device.snapshot.origin) => ({ kind: 'request_reconcile', peerOrigin: origin,
  peer: { deviceId: device.snapshot.deviceId, libraryEpoch: `${device.snapshot.deviceId}-epoch` } });
const round = (source: Device, target: Device) => source.process.invoke('round', { input: peer(target) });

it('converges simultaneous initiators and relays through one peer without an A/B connection', { meta: { calibratedMs: 60_000 } }, async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  const a = { process: fixture.left, snapshot: fixture.leftSnapshot };
  const b = { process: fixture.right, snapshot: fixture.rightSnapshot };
  let hub: Device | undefined;
  try {
    await a.process.seed({ nodeId: 't326-a', title: 'A', content: 'From A' });
    await b.process.seed({ nodeId: 't326-b', title: 'B', content: 'From B' });
    await Promise.all([round(a, b), round(b, a)]);
    // A bounded collision may leave a round pending. The next foreground request must recover.
    expect(await round(a, b)).toMatchObject({ complete: true });
    assertBodies(a, ['t326-a', 't326-b']);
    assertBodies(b, ['t326-a', 't326-b']);
    hub = await fixture.startThird();
    await a.process.seed({ nodeId: 't326-a-relay', title: 'A relay', content: 'A through hub' });
    await b.process.seed({ nodeId: 't326-b-relay', title: 'B relay', content: 'B through hub' });
    // These new facts can cross only A/hub and B/hub edges.
    expect(await round(hub, a)).toMatchObject({ complete: true });
    expect(await round(b, hub)).toMatchObject({ complete: true });
    expect(await round(a, hub)).toMatchObject({ complete: true });
    for (const device of [a, b, hub]) assertBodies(device,
      ['t326-a', 't326-a-relay', 't326-b', 't326-b-relay']);
    const before = await Promise.all([a, b, hub].map(inventory));
    expect(compareFramedSyncInventories({ local: before[0]!, remote: before[1]! })).toEqual([]);
    expect(compareFramedSyncInventories({ local: before[0]!, remote: before[2]! })).toEqual([]);
    for (const [source, target] of [[a, hub], [hub, b], [b, a]]) {
      expect(await round(source!, target!)).toMatchObject({ complete: true });
    }
    expect(await Promise.all([a, b, hub].map(inventory))).toEqual(before);
    const restarted = await fixture.restartRight();
    assertBodies(restarted, ['t326-a', 't326-a-relay', 't326-b', 't326-b-relay']);
  } finally {
    await Promise.allSettled([a.process.close(), fixture.right.close(), hub?.process.close()]);
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

it('continues an available peer after another peer is offline and persists pending status', { meta: { calibratedMs: 60_000 } }, async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  const a = { process: fixture.left, snapshot: fixture.leftSnapshot };
  const b = { process: fixture.right, snapshot: fixture.rightSnapshot };
  let offline: Device | undefined;
  try {
    offline = await fixture.startThird();
    for (const target of [offline, b]) await a.process.invoke('round', {
      input: { ...peer(target), kind: 'remember_peer' }
    });
    await offline.process.close();
    await a.process.seed({ nodeId: 't326-online', title: 'Available', content: 'Offline peer must not block' });
    expect(await a.process.invoke('round', { input: { kind: 'trigger_sync' } }))
      .toMatchObject({ status: 'pending', error: null });
    assertBodies(b, ['t326-online']);
    const db = new Database(a.snapshot.databasePath, { readonly: true });
    try {
      expect(db.prepare("SELECT value FROM settings WHERE key = 'sync_group_last_trigger_result'").get())
        .toMatchObject({ value: expect.stringContaining('pending') });
    } finally { db.close(); }
  } finally {
    await Promise.allSettled([a.process.close(), b.process.close(), offline?.process.close()]);
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

function assertBodies(device: Device, ids: string[]) {
  const db = new Database(device.snapshot.databasePath, { readonly: true, fileMustExist: true });
  try {
    const rows = db.prepare("SELECT id, content, current_version_id FROM nodes WHERE id LIKE 't326-%' ORDER BY id").all();
    expect(rows).toHaveLength(ids.length);
    expect(rows).toEqual(ids.map(id => expect.objectContaining({ id,
      content: ({ 't326-a': 'From A', 't326-b': 'From B', 't326-a-relay': 'A through hub',
        't326-b-relay': 'B through hub', 't326-online': 'Offline peer must not block' }[id]),
      current_version_id: expect.any(String) })));
    expect(db.prepare('SELECT count(*) FROM node_version_device_revisions').pluck().get()).toBeGreaterThan(0);
  } finally { db.close(); }
}

async function inventory(device: Device) {
  const db = new Database(device.snapshot.databasePath, { readonly: true });
  try {
    expect(db.prepare("SELECT object_id FROM sync_object_state WHERE object_type = 'node_position'").all()).toEqual([]);
    return await readFramedSyncInventory(createBetterSqliteDbPort(db));
  } finally { db.close(); }
}
