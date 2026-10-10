// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { readFixtureInventory, reconnectFixturePeer, publishFixtureDelivery } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

function history(databasePath: string) {
  const db = new Database(databasePath, { readonly: true });
  try {
    return {
      node: db.prepare('SELECT current_version_id FROM nodes WHERE id = ?').get('history-state'),
      versions: db.prepare(`SELECT version_id, parent_version_id, content_hash, body_text,
        COALESCE(json_extract(snapshot_json, '$.body_deleted'), 0) AS body_deleted
        FROM node_sync_versions WHERE object_id = ? ORDER BY version_id`).all('history-state'),
      parents: db.prepare(`SELECT edge.* FROM node_sync_version_parents edge JOIN node_sync_versions version
        ON version.version_id = edge.version_id WHERE version.object_id = ? ORDER BY edge.version_id, edge.ordinal`).all('history-state')
    };
  } finally { db.close(); }
}

function removeBody(databasePath: string, versionId: string) {
  const db = new Database(databasePath);
  try {
    db.prepare(`UPDATE node_sync_versions SET body_text = NULL,
      snapshot_json = json_set(snapshot_json, '$.content', NULL) WHERE version_id = ?`).run(versionId);
  } finally { db.close(); }
}

it.each([false, true])('repairs history with one available source and refuses completion with both missing=%s', async bothMissing => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  try {
    await fixture.left.seed({ content: 'Original 中文\r\n😀', nodeId: 'history-state', title: 'History' });
    const [first] = await readFixtureInventory(fixture.left);
    const base = first!.currentVersionId!;
    await fixture.left.seed({ content: 'Current full body', nodeId: 'history-state', title: 'History' });
    await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
    removeBody(fixture.rightSnapshot.databasePath, base);
    if (bothMissing) removeBody(fixture.leftSnapshot.databasePath, base);
    const result = await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
    if (bothMissing) {
      expect(result).toMatchObject({ complete: false });
      const inventory = await readFixtureInventory(fixture.right);
      expect(inventory.find(entry => entry.globalId === 'history-state')).toMatchObject({ unready: true });
      await fixture.restartLeft();
      const restarted = await fixture.restartRight();
      expect(await reconnectFixturePeer(fixture.left, restarted.snapshot)).toMatchObject({ complete: false });
      const source = new Database(fixture.leftSnapshot.databasePath);
      try { source.prepare('UPDATE node_sync_versions SET body_text = ? WHERE version_id = ?')
        .run('Original 中文\r\n😀', base); } finally { source.close(); }
      expect(await reconnectFixturePeer(fixture.left, restarted.snapshot)).toMatchObject({ complete: true });
      expect(history(restarted.snapshot.databasePath)).toEqual(history(fixture.leftSnapshot.databasePath));
    } else {
      expect(result).toMatchObject({ complete: true });
      expect(history(fixture.rightSnapshot.databasePath)).toEqual(history(fixture.leftSnapshot.databasePath));
      const db = new Database(fixture.rightSnapshot.databasePath, { readonly: true });
      try { expect(db.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').get(base))
        .toEqual({ body_text: 'Original 中文\r\n😀' }); } finally { db.close(); }
    }
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
}, 60_000);

it('keeps an offline editor branch and frozen third-device delivery after synchronized historical deletion', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  const third = await fixture.startThird();
  try {
    await Promise.all([fixture.left, fixture.right, third.process].map(process =>
      process.invoke('register_order_member', { deviceId: third.snapshot.deviceId })));
    await reconnectFixturePeer(fixture.right, third.snapshot);
    await fixture.left.seed({ content: 'Editor baseline', nodeId: 'history-state', title: 'History' });
    await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
    const base = (await readFixtureInventory(fixture.right)).find(entry => entry.globalId === 'history-state')!.currentVersionId!;
    await fixture.right.invoke('retain_edit', { holdId: 'editor', nodeId: 'history-state', versionId: base });
    await publishFixtureDelivery(fixture.right, third.snapshot, 'publication');
    await fixture.left.seed({ content: 'Remote current body', nodeId: 'history-state', title: 'History' });
    await fixture.left.invoke('collect_content');
    await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
    const db = new Database(fixture.rightSnapshot.databasePath, { readonly: true });
    try { expect(db.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').get(base))
      .toEqual({ body_text: null }); } finally { db.close(); }
    await fixture.right.invoke('local_content_edit', { baseVersionId: base, versionId: 'offline-history-edit',
      content: 'Unsaved full offline input', hostName: 'offline', nodeId: 'history-state', updatedAt: '2026-10-10T08:00:00Z' });
    await reconnectFixturePeer(fixture.right, third.snapshot);
    await reconnectFixturePeer(fixture.right, fixture.leftSnapshot);
    await reconnectFixturePeer(fixture.right, third.snapshot);
    expect(history(fixture.rightSnapshot.databasePath)).toEqual(history(fixture.leftSnapshot.databasePath));
    expect(history(third.snapshot.databasePath)).toEqual(history(fixture.rightSnapshot.databasePath));
    expect(await reconnectFixturePeer(fixture.right, third.snapshot)).toMatchObject({ complete: true, transferred: 0 });
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close(), third.process.close()]);
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
}, 60_000);

it.each(['restore', 'adoption'] as const)('preserves deletion and full current text through %s and restart', async mode => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  try {
    await fixture.left.seed({ content: 'Historical body', nodeId: 'history-state', title: 'History' });
    const base = (await readFixtureInventory(fixture.left)).find(entry => entry.globalId === 'history-state')!.currentVersionId!;
    await fixture.left.seed({ content: 'Restored full current 中文😀', nodeId: 'history-state', title: 'History' });
    const source = new Database(fixture.leftSnapshot.databasePath);
    try { source.prepare(`UPDATE node_sync_versions SET body_text = NULL,
      snapshot_json = json_set(snapshot_json, '$.content', NULL, '$.body_deleted', json('true'))
      WHERE version_id = ?`).run(base); } finally { source.close(); }
    const args = { mode, peerOrigin: fixture.leftSnapshot.origin, peerDeviceId: 'desktop-a', restoreId: 'history-restore' };
    await fixture.right.invoke('begin_identity_restore', args);
    expect(await fixture.right.invoke('identity_restore_round', args)).toMatchObject({ complete: true });
    const restarted = await fixture.restartRight();
    expect(history(restarted.snapshot.databasePath)).toEqual(history(fixture.leftSnapshot.databasePath));
    const db = new Database(restarted.snapshot.databasePath, { readonly: true });
    try { expect(db.prepare(`SELECT body_text, json_extract(snapshot_json, '$.body_deleted') AS deleted
      FROM node_sync_versions WHERE version_id = ?`).get(base)).toEqual({ body_text: null, deleted: 1 }); }
    finally { db.close(); }
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
}, 60_000);
