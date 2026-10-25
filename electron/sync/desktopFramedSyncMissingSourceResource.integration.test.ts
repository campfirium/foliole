// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { loadCurrentSyncNodeRecord } from '../../lib/core/sync/syncNodeGraph.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

import { readFixtureInventory, reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

async function readAttachmentState(databasePath: string, nodeId: string, storageKey: string) {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    return {
      article: {
        node: db.prepare(`SELECT id, current_version_id, content, body_blob_hash, resource_references, updated_at
          FROM nodes WHERE id = ?`).get(nodeId),
        versions: db.prepare('SELECT * FROM node_sync_versions WHERE object_id = ? ORDER BY version_id').all(nodeId),
        parents: db.prepare(`SELECT * FROM node_sync_version_parents WHERE version_id IN
          (SELECT version_id FROM node_sync_versions WHERE object_id = ?) ORDER BY version_id, ordinal`).all(nodeId),
        current: await loadCurrentSyncNodeRecord(createBetterSqliteDbPort(db), nodeId)
      },
      pending: db.prepare('SELECT * FROM attachment_pending WHERE storage_key = ? ORDER BY article_id, source').all(storageKey),
      available: db.prepare('SELECT available FROM framed_sync_resource_availability WHERE hash = ?').pluck().get(storageKey.slice(0, 64))
    };
  } finally { db.close(); }
}

it('commits a new article with a missing source attachment and fills it later without editing',
  { meta: { calibratedMs: 60_000 } }, async () => {
    const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
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
      const beforeState = await readAttachmentState(fixture.rightSnapshot.databasePath, nodeId, seeded.storageKey);
      expect(beforeState.article.node).toMatchObject({ id: nodeId });
      expect(JSON.stringify(beforeState.article.node)).toContain(seeded.storageKey);
      expect(beforeState.article.versions.length).toBeGreaterThan(0);
      expect(beforeState.article.current).toMatchObject({ body_text: content });
      expect(beforeState.pending).toContainEqual(expect.objectContaining({ article_id: nodeId, storage_key: seeded.storageKey }));
      expect(beforeState.available).toBe(0);
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
      expect(after.resourceHashes.map((hash) => Buffer.from(hash).toString('hex'))).not.toContain(seeded.hash);
      expect(after).toEqual(before);
      const afterState = await readAttachmentState(fixture.rightSnapshot.databasePath, nodeId, seeded.storageKey);
      expect(afterState).toEqual({ article: beforeState.article, pending: [], available: 1 });
      await fixture.restartRight();
      expect(await readAttachmentState(fixture.rightSnapshot.databasePath, nodeId, seeded.storageKey)).toEqual(afterState);
      expect((await readFixtureInventory(fixture.right))
        .find(entry => entry.objectType === 'node' && entry.globalId === nodeId)).toEqual(before);
      expect(await fs.readFile(target)).toEqual(bytes);
    } finally {
      await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
      await fs.rm(fixture.root, { force: true, recursive: true });
    }
  }
);
