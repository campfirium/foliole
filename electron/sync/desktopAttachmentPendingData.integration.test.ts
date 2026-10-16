// @vitest-environment node
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

it.each(['pull', 'push'] as const)('drains attachments despite an unavailable data object over production HTTP: %s', async direction => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  try {
    await fixture.left.seed({ nodeId: 'blocked', title: 'Blocked', content: 'Initial' });
    expect(await reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
    const bytes = Buffer.alloc(16 * 1024 * 1024, 73);
    const resource = await fixture.left.seedResource({ bytes, nodeId: 'attachments', includeImageInBody: true });
    await fixture.left.seed({ nodeId: 'blocked', title: 'Blocked', content: 'Unavailable' });
    const sqlite = new Database(fixture.leftSnapshot.databasePath);
    try {
      sqlite.exec(`UPDATE node_sync_versions SET body_text = NULL,
        snapshot_json = json_set(snapshot_json, '$.content', NULL)
        WHERE version_id = (SELECT current_version_id FROM nodes WHERE id = 'blocked')`);
    } finally { sqlite.close(); }
    const destination = path.join(fixture.rightSnapshot.stateRoot, 'documents', 'Foliole', 'Assets', resource.storageKey);
    let finished = false;
    for (let round = 0; round < 8; round++) {
      const result = direction === 'pull'
        ? await reconnectFixturePeer(fixture.right, fixture.leftSnapshot)
        : await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
      expect(result).toMatchObject({ complete: false });
      try {
        const actual = await fs.readFile(destination);
        expect(createHash('sha256').update(actual).digest('hex')).toBe(resource.hash);
        finished = true;
        break;
      } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
      }
    }
    expect(finished).toBe(true);
    const target = new Database(fixture.rightSnapshot.databasePath, { readonly: true });
    try { expect(target.prepare("SELECT content FROM nodes WHERE id = 'blocked'").pluck().get()).toBe('Initial'); }
    finally { target.close(); }
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
}, 60000);
