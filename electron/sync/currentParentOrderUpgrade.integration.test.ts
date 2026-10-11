// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { freezeLegacyOrderPublication } from './currentParentOrderUpgrade.testSupport.js';
import { readFixtureInventory, reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

function pending(file: string) {
  const db = new Database(file, { readonly: true });
  try { return db.prepare("SELECT manifest_json FROM framed_sync_outbound_publications WHERE state = 'published'").all(); }
  finally { db.close(); }
}

it('delivers original mixed upgrade facts after restart and releases protection only after receipt', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  try {
    await fixture.left.seed({ nodeId: 'original', content: 'Frozen original body', title: 'Original' });
    const differences = compareFramedSyncInventories({ local: await readFixtureInventory(fixture.left), remote: [] })
      .filter(value => value.globalId === 'original' || value.objectType === 'parent_child_order');
    for (const difference of differences) await fixture.left.invoke('round', { input: { kind: 'select', difference,
      peer: { deviceId: 'desktop-b', libraryEpoch: 'desktop-b-epoch' }, peerOrigin: fixture.rightSnapshot.origin } });
    await fixture.left.close();
    const oldId = await freezeLegacyOrderPublication(fixture.leftSnapshot.databasePath);
    await fixture.restartLeft();
    const upgraded = pending(fixture.leftSnapshot.databasePath);
    expect(upgraded.length).toBeGreaterThan(1);
    const db = new Database(fixture.leftSnapshot.databasePath, { readonly: true });
    try {
      expect(db.prepare('SELECT state, retirement_reason FROM framed_sync_outbound_publications WHERE transfer_id = ?')
        .get(oldId)).toEqual({ state: 'terminated', retirement_reason: 'parent-order-format-upgrade' });
      expect(db.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBe(0);
      expect(db.prepare('SELECT count(*) FROM framed_sync_outbound_holds').pluck().get()).toBe(upgraded.length);
    } finally { db.close(); }
    await fixture.left.invoke('collect_content');
    await fixture.restartLeft();
    expect(pending(fixture.leftSnapshot.databasePath)).toEqual(upgraded);
    expect(await reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true, pending: 0 });
    expect(pending(fixture.leftSnapshot.databasePath)).toEqual([]);
    const received = new Database(fixture.rightSnapshot.databasePath);
    try {
      expect((await loadCurrentSyncNodeRecord(createBetterSqliteDbPort(received), 'original'))?.body_text)
        .toBe('Frozen original body');
      expect(received.prepare('SELECT count(*) FROM framed_sync_receipts').pluck().get()).toBeGreaterThan(0);
    } finally { received.close(); }
    await fixture.restartLeft();
    const receiver = (await fixture.restartRight()).snapshot;
    expect(await reconnectFixturePeer(fixture.left, receiver)).toMatchObject({ complete: true, pending: 0 });
    expect(pending(fixture.leftSnapshot.databasePath)).toEqual([]);
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 60_000);
