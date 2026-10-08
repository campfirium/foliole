// @vitest-environment node
import http from 'node:http';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { FRAMED_SYNC_STAGING_SCHEMA } from '../../lib/core/database/framedSyncStagingSchema.js';
import { ensureFramedSyncMissingResourceDemand, obsoleteFramedSyncResourceDemand }
  from '../../lib/core/sync/framedSyncResourceDemands.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { createDesktopFramedSyncSessionNoncePort } from '../database/desktopFramedSyncSessionStaging.js';

import { requestDesktopFramedSyncResourcesHttp } from './desktopFramedSyncDifferenceHttp.js';

it('commits request intent before HTTP and retains it after failure, without sending an invalid batch', async () => {
  const sqlite = new Database(':memory:');
  for (const sql of FRAMED_SYNC_STAGING_SCHEMA) sqlite.exec(sql);
  const db = createBetterSqliteDbPort(sqlite);
  const context = { groupId: 'group', protocolVersion: 22 as const,
    initiatorDeviceId: 'B', initiatorLibraryEpoch: 'b', responderDeviceId: 'A', responderLibraryEpoch: 'a' };
  const resource = { demandId: 'demand', globalId: 'article', versionId: 'version',
    bodyHash: 'a'.repeat(64), storageKey: `${'b'.repeat(64)}.png`, sharedStateHash: new Uint8Array(32).fill(3) };
  const key = { ...resource, groupId: 'group', receiverDeviceId: 'B', receiverLibraryEpoch: 'b' };
  const observed: unknown[] = [];
  const server = http.createServer((request, response) => {
    observed.push(sqlite.prepare('SELECT demand_id, request_started FROM framed_sync_resource_demands').all());
    request.resume();
    response.writeHead(503).end();
  });
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test_address_invalid');
    const groupKey = new Uint8Array(32).fill(5);
    const args = { context, db, resources: [resource], groupKey,
      endpointUrl: `http://127.0.0.1:${address.port}`, groupSecret: Buffer.from(groupKey).toString('base64url'),
      noncePort: createDesktopFramedSyncSessionNoncePort(db), roundId: new Uint8Array(16).fill(4) };
    await ensureFramedSyncMissingResourceDemand(db, key, () => 'demand');
    await expect(requestDesktopFramedSyncResourcesHttp(args)).rejects.toThrow('framed_sync_http_503');
    expect(observed).toEqual([[{ demand_id: 'demand', request_started: 1 }]]);
    await obsoleteFramedSyncResourceDemand(db, 'demand');
    expect(sqlite.prepare('SELECT state FROM framed_sync_resource_demands').pluck().get()).toBe('pending');
    await expect(requestDesktopFramedSyncResourcesHttp(args)).rejects.toThrow('framed_sync_http_503');
    expect(observed).toHaveLength(2);
    await expect(requestDesktopFramedSyncResourcesHttp({ ...args,
      resources: [{ ...resource, sharedStateHash: new Uint8Array(32).fill(4) }] })).rejects.toThrow('not_pending');
    expect(observed).toHaveLength(2);
    const next = { ...resource, demandId: 'unsent', storageKey: `${'c'.repeat(64)}.png` };
    await ensureFramedSyncMissingResourceDemand(db, { ...key, storageKey: next.storageKey }, () => 'unsent');
    await expect(requestDesktopFramedSyncResourcesHttp({ ...args,
      resources: [next, { ...resource, demandId: 'unknown' }] })).rejects.toThrow('not_pending');
    expect(observed).toHaveLength(2);
    expect(sqlite.prepare("SELECT request_started FROM framed_sync_resource_demands WHERE demand_id = 'unsent'")
      .pluck().get()).toBe(0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    sqlite.close();
  }
});
