// @vitest-environment node
import { promises as fs } from 'node:fs';
import { createServer, request } from 'node:http';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

it('retries two expired discovery requests and commits the next round through production HTTP', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  let probes = 0;
  const roundIds = new Set<string>();
  const proxy = createServer((incoming, outgoing) => {
    const url = new URL(incoming.url ?? '/', fixture.leftSnapshot.origin);
    if (url.pathname === '/companion/discovery' && ++probes <= 2) {
      const timer = setTimeout(() => outgoing.end(), 3000);
      outgoing.once('close', () => clearTimeout(timer));
      return;
    }
    if (url.searchParams.get('peer_round_mode') === 'start') roundIds.add(url.searchParams.get('peer_round_id') ?? '');
    const forwarded = request(url, { method: incoming.method, headers: incoming.headers }, response => {
      outgoing.writeHead(response.statusCode ?? 500, response.headers);
      response.pipe(outgoing);
    });
    forwarded.once('error', () => outgoing.destroy());
    outgoing.once('close', () => forwarded.destroy());
    incoming.pipe(forwarded);
  });
  try {
    await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve));
    const address = proxy.address();
    if (!address || typeof address === 'string') throw new Error('test_proxy_address_missing');
    await fixture.left.seed({ nodeId: 'after-timeouts', title: 'Recovery', content: 'Durable after retry' });
    const command = { input: { kind: 'request_reconcile', peerOrigin: `http://127.0.0.1:${address.port}`,
      peer: { deviceId: fixture.leftSnapshot.deviceId, libraryEpoch: `${fixture.leftSnapshot.deviceId}-epoch` } } };
    expect(await fixture.right.invoke('round', command)).toEqual({ complete: true });
    expect(probes).toBe(3);
    expect(roundIds.size).toBe(1);
    const restarted = await fixture.restartRight();
    const db = new Database(restarted.snapshot.databasePath, { readonly: true, fileMustExist: true });
    try {
      expect(db.prepare('SELECT content FROM nodes WHERE id = ?').get('after-timeouts'))
        .toEqual({ content: 'Durable after retry' });
      expect(db.prepare('SELECT count(*) FROM node_sync_versions WHERE object_id = ?')
        .pluck().get('after-timeouts')).toBeGreaterThan(0);
    } finally { db.close(); }
  } finally {
    proxy.closeAllConnections();
    await new Promise<void>(resolve => proxy.close(() => resolve()));
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
}, 30_000);
