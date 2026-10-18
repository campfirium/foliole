// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

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

it('retains undelivered image demand through source absence and receiver restart', async () => {
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
}, 60_000);
