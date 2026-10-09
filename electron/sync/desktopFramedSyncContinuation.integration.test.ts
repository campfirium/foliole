// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { readFixtureInventory, reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture, readDesktopFramedSyncLibraryEvidence }
  from './desktopFramedSyncTwoProcess.testSupport.js';

it('returns pending for an unchanged unavailable body while committing neighbors, then resumes after restart', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  let restarted: Awaited<ReturnType<typeof fixture.restartRight>> | undefined;
  try {
    await fixture.left.seed({ content: 'Initial body', nodeId: 't326-aaa', title: 'Unavailable' });
    await fixture.left.seed({ content: 'Initial neighbor', nodeId: 't326-ccc', title: 'Independent' });
    expect(await reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
    await fixture.left.seed({ content: 'Temporarily unavailable body', nodeId: 't326-aaa', title: 'Unavailable' });
    await fixture.left.seed({ content: 'Independent body', nodeId: 't326-ccc', title: 'Independent' });
    const source = new Database(fixture.leftSnapshot.databasePath);
    try {
      source.prepare("UPDATE node_sync_versions SET body_text = NULL WHERE version_id = (SELECT current_version_id FROM nodes WHERE id = 't326-aaa')").run();
    } finally { source.close(); }

    expect((await readFixtureInventory(fixture.left)).find(entry => entry.globalId === 't326-aaa'))
      .toMatchObject({ resourceHashes: [] });
    expect(await reconnectFixturePeer(fixture.left, fixture.rightSnapshot))
      .toMatchObject({ complete: false, databaseComplete: false, pending: expect.any(Number) });
    expect(readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath).nodes)
      .toEqual([expect.objectContaining({ id: 't326-aaa', content: 'Initial body' }),
        expect.objectContaining({ id: 't326-ccc', content: 'Independent body' })]);

    restarted = await fixture.restartRight();
    expect(readDesktopFramedSyncLibraryEvidence(restarted.snapshot.databasePath).nodes)
      .toEqual([expect.objectContaining({ id: 't326-aaa', content: 'Initial body' }),
        expect.objectContaining({ id: 't326-ccc', content: 'Independent body' })]);
    const recovered = new Database(fixture.leftSnapshot.databasePath);
    try {
      recovered.prepare("UPDATE node_sync_versions SET body_text = ? WHERE version_id = (SELECT current_version_id FROM nodes WHERE id = 't326-aaa')")
        .run('Temporarily unavailable body');
    } finally { recovered.close(); }

    expect(await reconnectFixturePeer(fixture.left, restarted.snapshot)).toMatchObject({ complete: true, pending: 0 });
    expect(readDesktopFramedSyncLibraryEvidence(restarted.snapshot.databasePath).nodes).toEqual([
      expect.objectContaining({ id: 't326-aaa', content: 'Temporarily unavailable body' }),
      expect.objectContaining({ id: 't326-ccc', content: 'Independent body' })
    ]);
    expect(await readFixtureInventory(fixture.left)).toEqual(await readFixtureInventory(restarted.process));
  } finally {
    await Promise.allSettled([fixture.left.close(), restarted?.process.close() ?? fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 15_000);

it('delivers complete current text and retired oversized ancestry to a new member over HTTP', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  let restarted: Awaited<ReturnType<typeof fixture.restartRight>> | undefined;
  try {
    const nodeId = 'oversize-history';
    await fixture.left.seed({ content: 'Legacy ancestor', nodeId, title: 'History' });
    const source = new Database(fixture.leftSnapshot.databasePath);
    const base = String(source.prepare('SELECT current_version_id FROM nodes WHERE id = ?').pluck().get(nodeId));
    source.close();
    await fixture.left.seed({ content: 'Complete current text 中文😀', nodeId, title: 'History' });
    const legacy = new Database(fixture.leftSnapshot.databasePath);
    legacy.prepare('UPDATE node_sync_versions SET body_text = ? WHERE version_id = ?')
      .run('雪'.repeat(350000), base);
    const identities = legacy.prepare('SELECT version_id, parent_version_id, content_hash FROM node_sync_versions WHERE object_id = ? ORDER BY version_id').all(nodeId);
    legacy.close();

    expect(await reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true, pending: 0 });
    restarted = await fixture.restartRight();
    for (const snapshot of [fixture.leftSnapshot, restarted.snapshot]) {
      const db = new Database(snapshot.databasePath, { readonly: true });
      try {
        expect(db.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get(nodeId)).toBe('Complete current text 中文😀');
        expect(db.prepare('SELECT body_text IS NULL FROM node_sync_versions WHERE version_id = ?').pluck().get(base)).toBe(1);
        expect(db.prepare('SELECT version_id, parent_version_id, content_hash FROM node_sync_versions WHERE object_id = ? ORDER BY version_id').all(nodeId)).toEqual(identities);
      } finally { db.close(); }
    }
    expect(await reconnectFixturePeer(fixture.left, restarted.snapshot)).toMatchObject({ complete: true, pending: 0 });
  } finally {
    await Promise.allSettled([fixture.left.close(), restarted?.process.close() ?? fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 15_000);
