// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

it('exposes the retained-history body requirement after production collection', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  try {
    await fixture.left.seed({ content: 'Original body', nodeId: 'retired-history', title: 'History' });
    await fixture.left.seed({ content: 'Current body', nodeId: 'retired-history', title: 'History' });
    await fixture.left.invoke('collect_content');
    const db = new Database(fixture.leftSnapshot.databasePath, { readonly: true });
    try {
      expect(db.prepare('SELECT COUNT(*) AS count FROM node_sync_versions WHERE body_text IS NULL')
        .get()).toEqual({ count: 1 });
      expect(db.prepare('SELECT COUNT(*) AS count FROM node_sync_version_parents').get())
        .toEqual({ count: 1 });
    } finally {
      db.close();
    }
    await expect(fixture.left.invoke('round', { input: { kind: 'reconcile', peer: { deviceId: fixture.rightSnapshot.deviceId, libraryEpoch: 'desktop-b-epoch' }, peerOrigin: fixture.rightSnapshot.origin } }))
      .rejects.toThrow(/sync_node_version_body_unavailable|node_version_body_unavailable/u);
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 60_000);
