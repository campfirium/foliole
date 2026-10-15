// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { DATABASE_SCHEMA_VERSION } from '../../lib/core/database/databaseSchemaVersion.js';
import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { freezeLegacyOrderPublication } from './currentParentOrderUpgrade.testSupport.js';
import { reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

function business(file: string, serialized = true) {
  const db = new Database(file, { readonly: true });
  try { return { versions: db.prepare(`SELECT ${serialized ? '*' : 'version_id, object_id, parent_version_id, content_hash, body_text, host_name, created_at'} FROM node_sync_versions WHERE object_id = 'original'`).all(),
    order: db.prepare('SELECT parent_id, child_ids_json FROM parent_child_order ORDER BY parent_id').all() }; }
  finally { db.close(); }
}

it('retires a mixed legacy publication and delivers its original business facts after upgrade and restart', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  try {
    await fixture.left.seed({ nodeId: 'original', content: 'Frozen original body', title: 'Original' });
    const original = business(fixture.leftSnapshot.databasePath);
    await fixture.left.close();
    await freezeLegacyOrderPublication(fixture.leftSnapshot.databasePath);
    await fixture.restartLeft();
    expect(business(fixture.leftSnapshot.databasePath)).toEqual(original);
    const db = new Database(fixture.leftSnapshot.databasePath, { readonly: true });
    try {
      expect(db.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
      expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'framed_sync_outbound_publications'").get()).toBeUndefined();
    } finally { db.close(); }
    await fixture.left.invoke('collect_content');
    await fixture.restartLeft();
    expect(business(fixture.leftSnapshot.databasePath)).toEqual(original);
    expect(await reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
    expect(business(fixture.rightSnapshot.databasePath, false)).toEqual(business(fixture.leftSnapshot.databasePath, false));
    const received = new Database(fixture.rightSnapshot.databasePath);
    try {
      expect((await loadCurrentSyncNodeRecord(createBetterSqliteDbPort(received), 'original'))?.body_text)
        .toBe('Frozen original body');
    } finally { received.close(); }
    await fixture.restartLeft();
    const receiver = (await fixture.restartRight()).snapshot;
    expect(await reconnectFixturePeer(fixture.left, receiver)).toMatchObject({ complete: true });
    expect(business(fixture.rightSnapshot.databasePath, false)).toEqual(business(fixture.leftSnapshot.databasePath, false));
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 60_000);
