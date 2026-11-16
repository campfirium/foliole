// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { readFixtureInventory, reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';


function article(databasePath: string, id: string) {
  const db = new Database(databasePath, { readonly: true });
  try { return db.prepare(`SELECT content FROM nodes WHERE id = ?`).get(id); }
  finally { db.close(); }
}

function versions(databasePath: string) {
  const db = new Database(databasePath, { readonly: true });
  try { return db.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all(); }
  finally { db.close(); }
}

it('retains undelivered image demand through source absence and receiver restart', { meta: { calibratedMs: 60_000 } }, async () => {
  const f = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const id = 'zero-diff-resource-article';
  try {
    expect(f.leftSnapshot.pid).not.toBe(f.rightSnapshot.pid);
    const seeded = await f.left.seedResource({ bytes, nodeId: id, includeImageInBody: true });
    const source = path.join(f.leftSnapshot.stateRoot, 'documents', 'Foliole', 'Assets', seeded.storageKey);
    const target = path.join(f.rightSnapshot.stateRoot, 'documents', 'Foliole', 'Assets', seeded.storageKey);
    await fs.rm(source);
    const result = await reconnectFixturePeer(f.right, f.leftSnapshot);
    expect(article(f.rightSnapshot.databasePath, id)).toMatchObject({ content: `Article with an image\n\n![Cover](asset://${seeded.storageKey})` });
    expect(result).toMatchObject({ complete: false });
    expect(await fs.stat(target).catch(() => null)).toBeNull();
    const before = versions(f.rightSnapshot.databasePath);
    const inventory = (await readFixtureInventory(f.right)).find((entry) => entry.globalId === id)!;
    expect(inventory.resourceHashes.map((hash) => Buffer.from(hash).toString('hex'))).not.toContain(seeded.hash);
    expect(await reconnectFixturePeer(f.right, f.leftSnapshot)).toMatchObject({ complete: false });
    expect(versions(f.rightSnapshot.databasePath)).toEqual(before);
    const restarted = await f.restartRight();
    expect(restarted.snapshot.pid).not.toBe(f.rightSnapshot.pid);
    await fs.writeFile(source, bytes);
    expect(await reconnectFixturePeer(restarted.process, f.leftSnapshot)).toMatchObject({ complete: true });
    expect(await fs.readFile(target)).toEqual(bytes);
    expect(versions(f.rightSnapshot.databasePath)).toEqual(before);
  } finally {
    await Promise.allSettled([f.left.close(), f.right.close()]);
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

it.each(['focus', 'crop'])('synchronizes saved %s on a repeated image while preserving the original attachment',
  { meta: { calibratedMs: 60_000 } }, async effect => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  const bytes = await fs.readFile('assets/brand/foliole-leaf-tight.png');
  const nodeId = `image-${effect}-article`;
  try {
    const { storageKey } = await fixture.left.seedResource({ bytes, nodeId, includeImageInBody: true });
    await reconnectFixturePeer(fixture.right, fixture.leftSnapshot);
    const image = `![Cover](asset://${storageKey})`;
    const sqlite = new Database(fixture.leftSnapshot.databasePath, { readonly: true });
    let current;
    try { current = await loadCurrentSyncNodeRecord(createBetterSqliteDbPort(sqlite), nodeId); }
    finally { sqlite.close(); }
    expect(current?.body_text).toContain(image);
    const baseContent = current!.body_text!;
    const updatedImage = `![Cover;${effect}=1000,2000,5000,5000](asset://${storageKey})`;
    const content = `${baseContent.replace(image, updatedImage)}\n\n${image}`;
    await fixture.left.invoke('local_content_edit', { nodeId, baseVersionId: current!.version_id,
      baseContent, versionId: `${effect}-edit-1`, content, hostName: 'desktop', updatedAt: '2026-11-16T12:00:00.000Z' });
    await reconnectFixturePeer(fixture.right, fixture.leftSnapshot);
    for (const endpoint of [fixture.leftSnapshot, fixture.rightSnapshot]) {
      expect(article(endpoint.databasePath, nodeId)).toMatchObject({
        content: `Article with an image\n\n${updatedImage}\n\n${image}`
      });
      expect(await fs.readFile(path.join(endpoint.stateRoot, 'documents', 'Foliole', 'Assets', storageKey))).toEqual(bytes);
    }
    const reopened = await fixture.restartRight();
    expect(article(reopened.snapshot.databasePath, nodeId)).toMatchObject({ content });
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});
