// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

const SHARED = `Shared body\n${'Shared paragraph.\n'.repeat(100)}`;
const INTERMEDIATE = `Intermediate body\n${'Intermediate paragraph.\n'.repeat(100)}`;

function readBodies(databasePath: string) {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    return {
      blobs: db.prepare<[], { hash: string }>('SELECT hash FROM content_blob_data').all().map((row) => row.hash),
      nodes: db.prepare(`SELECT id, current_version_id, content FROM nodes ORDER BY id`).all(),
      versions: db.prepare(`SELECT version_id, parent_version_id, body_text,
        json_extract(snapshot_json, '$.body_blob_hash') AS body_blob_hash
        FROM node_sync_versions ORDER BY version_id`).all(),
      edges: db.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal').all()
    };
  } finally { db.close(); }
}

it('releases replaced bytes across real processes, preserves another node holder and survives restart', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  try {
    await fixture.left.seed({ content: SHARED, nodeId: 'article', title: 'Article' });
    await fixture.left.seed({ content: SHARED, nodeId: 'holder', title: 'Holder' });
    await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
    await fixture.left.seed({ content: INTERMEDIATE, nodeId: 'article', title: 'Article' });
    await fixture.left.seed({ content: 'Current body', nodeId: 'article', title: 'Article' });
    await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
    for (const process of [fixture.left, fixture.right]) await process.invoke('collect_content');
    for (const snapshot of [fixture.leftSnapshot, fixture.rightSnapshot]) {
      const retained = readBodies(snapshot.databasePath);
      expect(retained.blobs).toEqual([]);
      expect(retained.nodes).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'holder', content: SHARED }),
        expect.objectContaining({ id: 'article', content: 'Current body' })
      ]));
      expect(retained.versions).not.toContainEqual(expect.objectContaining({ body_text: INTERMEDIATE }));
      expect(retained.versions).toContainEqual(expect.objectContaining({ body_text: null, body_blob_hash: null }));
    }
    await fixture.left.seed({ content: 'Holder replaced', nodeId: 'holder', title: 'Holder' });
    await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
    for (const process of [fixture.left, fixture.right]) await process.invoke('collect_content');
    const before = [readBodies(fixture.leftSnapshot.databasePath), readBodies(fixture.rightSnapshot.databasePath)];
    for (const evidence of before) {
      expect(evidence.blobs).toEqual([]);
      expect(evidence.nodes).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'article', content: 'Current body' }),
        expect.objectContaining({ id: 'holder', content: 'Holder replaced' })
      ]));
      expect(evidence.versions).not.toContainEqual(expect.objectContaining({ body_text: SHARED }));
    }
    const left = await fixture.restartLeft();
    const right = await fixture.restartRight();
    expect(readBodies(left.snapshot.databasePath)).toEqual(before[0]);
    expect(readBodies(right.snapshot.databasePath)).toEqual(before[1]);
    await expect(reconnectFixturePeer(left.process, right.snapshot)).resolves.toMatchObject({ complete: true });
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
}, 60_000);
