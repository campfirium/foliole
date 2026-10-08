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

it('repairs current images on ordinary zero-database-difference rounds and resumes after source absence and receiver restart', async () => {
  const f = await createDesktopFramedSyncTwoProcessFixture();
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const id = 'zero-diff-resource-article';
  try {
    expect(f.leftSnapshot.pid).not.toBe(f.rightSnapshot.pid);
    const seeded = await f.left.seedResource({ bytes, nodeId: id, includeImageInBody: true });
    const source = path.join(f.leftSnapshot.stateRoot, 'documents', 'Foliole', 'Assets', seeded.storageKey);
    const target = path.join(f.rightSnapshot.stateRoot, 'documents', 'Foliole', 'Assets', seeded.storageKey);
    const result = await reconnectFixturePeer(f.right, f.leftSnapshot);
    expect(article(f.rightSnapshot.databasePath, id)).toMatchObject({ content: `Article with an image\n\n![Cover](asset://${seeded.storageKey})` });
    expect(result).toMatchObject({ resources: { scanned: 1, transferred: 1 } });
    expect(await fs.readFile(target)).toEqual(bytes);
    const before = versions(f.rightSnapshot.databasePath);
    const inventory = (await readFixtureInventory(f.right)).find((entry) => entry.globalId === id)!;
    expect(inventory.resourceHashes.map((hash) => Buffer.from(hash).toString('hex'))).toContain(seeded.hash);
    await fs.rm(target);
    expect(await reconnectFixturePeer(f.right, f.leftSnapshot)).toMatchObject({ complete: true, databaseComplete: true,
      resources: { transferred: 1, pending: 0 } });
    expect(await fs.readFile(target)).toEqual(bytes);
    expect(versions(f.rightSnapshot.databasePath)).toEqual(before);
    await Promise.all([fs.rm(target), fs.rm(source)]);
    expect(await reconnectFixturePeer(f.right, f.leftSnapshot)).toMatchObject({ complete: false, databaseComplete: true,
      resources: { transferred: 0, pending: 1 } });
    const restarted = await f.restartRight();
    expect(restarted.snapshot.pid).not.toBe(f.rightSnapshot.pid);
    await fs.writeFile(source, bytes);
    expect(await reconnectFixturePeer(restarted.process, f.leftSnapshot)).toMatchObject({ complete: true,
      resources: { transferred: 1, pending: 0 } });
    expect(await fs.readFile(target)).toEqual(bytes);
    expect(versions(f.rightSnapshot.databasePath)).toEqual(before);
    const db = new Database(f.rightSnapshot.databasePath, { readonly: true });
    try {
      expect(db.prepare("SELECT count(*) FROM framed_sync_resource_demands WHERE state = 'verified_present'").pluck().get()).toBe(1);
      expect(db.prepare("SELECT count(*) FROM framed_sync_resource_demands WHERE state = 'pending'").pluck().get()).toBe(0);
    } finally { db.close(); }
  } finally {
    await Promise.allSettled([f.left.close(), f.right.close()]);
    await fs.rm(f.root, { recursive: true, force: true });
  }
}, 60_000);
