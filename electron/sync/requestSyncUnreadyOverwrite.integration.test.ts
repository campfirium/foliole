// @vitest-environment node
import { promises as fs } from 'node:fs';
import http from 'node:http';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

it('keeps equal unready overwrite libraries pending without empty requests, then completes after repair', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  const source = new Database(fixture.leftSnapshot.databasePath);
  const target = new Database(fixture.rightSnapshot.databasePath);
  let objectRequests = 0;
  const relay = http.createServer((request, response) => {
    if (['pull', 'pulls', 'object', 'objects'].includes(new URL(request.url ?? '/', 'http://local').searchParams.get('request') ?? '')) objectRequests++;
    const forwarding = http.request(new URL(request.url ?? '/', fixture.leftSnapshot.origin), {
      method: request.method, headers: request.headers
    }, incoming => { response.writeHead(incoming.statusCode ?? 500, incoming.headers); incoming.pipe(response); });
    forwarding.on('error', error => response.destroy(error)); request.pipe(forwarding);
  });
  try {
    await fixture.left.seed({ nodeId: 'unready-overwrite', title: 'Retained', content: 'Recoverable body' });
    await new Promise<void>(resolve => relay.listen(0, '127.0.0.1', resolve));
    const address = relay.address();
    if (!address || typeof address === 'string') throw new Error('test_address_invalid');
    const args = { mode: 'adoption', peerOrigin: `http://127.0.0.1:${address.port}`,
      peerDeviceId: fixture.leftSnapshot.deviceId, restoreId: 'unready-overwrite' };
    await fixture.right.invoke('begin_identity_restore', args);
    target.exec(`CREATE TRIGGER prevent_overwrite_completion BEFORE DELETE ON sync_group_metadata
      WHEN OLD.key = 'sync_group_overwrite_progress' BEGIN SELECT RAISE(ABORT, 'completion_unavailable'); END`);
    await expect(fixture.right.invoke('identity_restore_round', args)).rejects.toThrow('completion_unavailable');
    target.exec('DROP TRIGGER prevent_overwrite_completion');
    for (const db of [source, target]) db.prepare(`UPDATE node_sync_versions SET body_text = NULL,
      snapshot_json = json_set(snapshot_json, '$.content', NULL) WHERE object_id = 'unready-overwrite'`).run();
    objectRequests = 0;
    for (let pass = 0; pass < 3; pass++) {
      expect(await fixture.right.invoke('identity_restore_round', args)).toMatchObject({ complete: false });
      expect(target.prepare("SELECT value FROM sync_group_metadata WHERE key = 'sync_group_overwrite_progress'").get()).toBeDefined();
    }
    expect(objectRequests).toBe(0);
    source.prepare(`UPDATE node_sync_versions SET body_text = 'Recoverable body',
      snapshot_json = json_set(snapshot_json, '$.content', 'Recoverable body') WHERE object_id = 'unready-overwrite'`).run();
    expect(await fixture.right.invoke('identity_restore_round', args)).toMatchObject({ complete: true });
    expect(objectRequests).toBeGreaterThan(0);
    expect(target.prepare("SELECT body_text FROM node_sync_versions WHERE object_id = 'unready-overwrite'").pluck().get()).toBe('Recoverable body');
    expect(target.prepare("SELECT value FROM sync_group_metadata WHERE key = 'sync_group_overwrite_progress'").get()).toBeUndefined();
  } finally {
    await new Promise<void>(resolve => relay.close(() => resolve()));
    source.close(); target.close();
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
}, 60000);
