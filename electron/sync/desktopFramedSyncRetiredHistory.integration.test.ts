// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

it.each([false, true])('synchronizes retired history after restart with receiver body present=%s', async (receivedOriginal) => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  try {
    await fixture.left.seed({ content: 'Original body', nodeId: 'retired-history', title: 'History' });
    if (receivedOriginal) await fixture.left.invoke('round', { input: { kind: 'reconcile',
      peer: { deviceId: fixture.rightSnapshot.deviceId, libraryEpoch: 'desktop-b-epoch' },
      peerOrigin: fixture.rightSnapshot.origin } });
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
    const roundInput = { input: { kind: 'reconcile', peer: { deviceId: fixture.rightSnapshot.deviceId,
      libraryEpoch: 'desktop-b-epoch' }, peerOrigin: fixture.rightSnapshot.origin } };
    await expect(fixture.left.invoke('round', roundInput)).resolves.toMatchObject({ transferred: expect.any(Number) });
    await expect(fixture.left.invoke('round', roundInput)).resolves.toMatchObject({ complete: true });
    const left = new Database(fixture.leftSnapshot.databasePath, { readonly: true });
    const right = new Database(fixture.rightSnapshot.databasePath, { readonly: true });
    try {
      const versions = 'SELECT version_id, object_id, content_hash, body_text, parent_version_id FROM node_sync_versions ORDER BY version_id';
      const expected = left.prepare<[], { body_text: string | null }>(versions).all().map((row) =>
        receivedOriginal && row.body_text === null ? { ...row, body_text: 'Original body' } : row);
      expect(right.prepare(versions).all()).toEqual(expected);
      expect(right.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal').all())
        .toEqual(left.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal').all());
    } finally { left.close(); right.close(); }
    await fixture.restartLeft();
    const restarted = await fixture.restartRight();
    await expect(fixture.left.invoke('round', { input: { kind: 'reconcile',
      peer: { deviceId: restarted.snapshot.deviceId, libraryEpoch: 'desktop-b-epoch' },
      peerOrigin: restarted.snapshot.origin } })).resolves.toMatchObject({ complete: true });
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 60_000);
