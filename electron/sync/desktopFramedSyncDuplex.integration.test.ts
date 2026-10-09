// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { compareFramedSyncDatabaseInventories } from '../../lib/core/sync/framedSyncDatabaseDifference.js';

import { readFixtureInventory, reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

function persisted(databasePath: string) {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    return { nodes: db.prepare(`SELECT n.id, n.content, v.body_text FROM nodes n
      JOIN node_sync_versions v ON v.version_id = n.current_version_id
      WHERE n.id LIKE 'duplex-%' ORDER BY n.id`).all(),
    holds: db.prepare('SELECT count(*) FROM framed_sync_outbound_holds').pluck().get(),
    pending: db.prepare("SELECT count(*) FROM framed_sync_outbound_publications WHERE state = 'published'").pluck().get() };
  } finally { db.close(); }
}

it.each([0, 1, 2])('delivers complete maximum-sized articles concurrently in both directions and survives reopening (%i)', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  let succeeded = false;
  const bodies = ['a', 'b', 'c', 'd'].map((letter) => letter.repeat(1024 * 1024));
  try {
    for (const [index, body] of bodies.entries()) {
      const peer = index < 2 ? fixture.left : fixture.right;
      await peer.seed({ nodeId: `duplex-${index}`, title: `Article ${index}`, content: body });
    }
    const attempts = await Promise.allSettled([
      reconnectFixturePeer(fixture.left, fixture.rightSnapshot),
      reconnectFixturePeer(fixture.right, fixture.leftSnapshot)
    ]);
    const results = attempts.map((result) => result.status === 'fulfilled' ? result.value : String(result.reason));
    await fs.writeFile(`${fixture.root}/duplex-results.json`, JSON.stringify(results, null, 2));
    expect(results).toEqual([expect.objectContaining({ complete: true }), expect.objectContaining({ complete: true })]);
    const expected = { nodes: bodies.map((content, index) => ({ id: `duplex-${index}`, content, body_text: content })),
      holds: 0, pending: 0 };
    expect(persisted(fixture.leftSnapshot.databasePath)).toEqual(expected);
    expect(persisted(fixture.rightSnapshot.databasePath)).toEqual(expected);
    expect(compareFramedSyncDatabaseInventories({ local: await readFixtureInventory(fixture.left),
      remote: await readFixtureInventory(fixture.right) })).toEqual([]);
    const left = await fixture.restartLeft();
    const right = await fixture.restartRight();
    expect(persisted(left.snapshot.databasePath)).toEqual(expected);
    expect(persisted(right.snapshot.databasePath)).toEqual(expected);
    succeeded = true;
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    if (succeeded) await fs.rm(fixture.root, { recursive: true, force: true });
    else {
      await fs.writeFile(`${fixture.root}/duplex-processes.log`, [fixture.left.diagnostics(), fixture.right.diagnostics()].join('\n'));
      console.info('Duplex fixture:', fixture.root);
    }
  }
}, 60_000);
