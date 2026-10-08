// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { readFixtureInventory, reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

it('commits a new article with a missing source attachment and fills it later without editing',
  async () => {
    const fixture = await createDesktopFramedSyncTwoProcessFixture();
    const bytes = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(128, 1)
    ]);
    const nodeId = 'new-article-missing-source-image';
    try {
      const seeded = await fixture.left.seedResource({ bytes, includeImageInBody: true, nodeId });
      const content = `Article with an image\n\n![Cover](asset://${seeded.storageKey})`;
      const source = path.join(fixture.leftSnapshot.stateRoot, 'documents', 'Foliole', 'Assets', seeded.storageKey);
      const target = path.join(fixture.rightSnapshot.stateRoot, 'documents', 'Foliole', 'Assets', seeded.storageKey);
      await fixture.right.invoke('round', { input: { kind: 'remember_peer',
        peerOrigin: fixture.leftSnapshot.origin, peer: { deviceId: fixture.leftSnapshot.deviceId,
          libraryEpoch: `${fixture.leftSnapshot.deviceId}-epoch` } } });
      await fs.rm(source);
      const result = await reconnectFixturePeer(fixture.left, fixture.rightSnapshot)
        .catch((error: unknown) => ({ error: String(error) }));
      const db = new Database(fixture.rightSnapshot.databasePath, { readonly: true });
      try {
        const node = db.prepare('SELECT id, resource_references FROM nodes WHERE id = ?').get(nodeId);
        expect(node).toMatchObject({ id: nodeId });
        expect(JSON.stringify(node)).toContain(seeded.storageKey);
        expect(db.prepare('SELECT count(*) FROM node_sync_versions WHERE object_id = ?').pluck().get(nodeId))
          .toBeGreaterThan(0);
        expect(await loadCurrentSyncNodeRecord(createBetterSqliteDbPort(db), nodeId))
          .toMatchObject({ body_text: content });
      } finally { db.close(); }
      expect(result).not.toHaveProperty('error');
      expect(await fs.stat(target).catch(() => null)).toBeNull();
      const before = (await readFixtureInventory(fixture.right))
        .find((entry) => entry.objectType === 'node' && entry.globalId === nodeId)!;
      expect(before.resourceHashes.map((hash) => Buffer.from(hash).toString('hex'))).not.toContain(seeded.hash);
      await fs.writeFile(source, bytes);
      await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
      expect(await fs.readFile(target)).toEqual(bytes);
      const after = (await readFixtureInventory(fixture.right))
        .find((entry) => entry.objectType === 'node' && entry.globalId === nodeId)!;
      expect(after.frontierFactIds).toEqual(before.frontierFactIds);
      expect(after.sharedStateHash).toEqual(before.sharedStateHash);
      expect(after.resourceHashes.map((hash) => Buffer.from(hash).toString('hex'))).toContain(seeded.hash);
    } finally {
      await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
      await fs.rm(fixture.root, { force: true, recursive: true });
    }
  }, 60_000
);
