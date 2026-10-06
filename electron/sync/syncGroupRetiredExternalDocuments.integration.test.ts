// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { z } from 'zod';

import { parseSyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { seedRetiredExternalDocuments } from '../database/retiredExternalDocuments.testSupport.js';

import { buildRestoreFixture, startRestoreFixture } from './backupRestoreSyncGroup.testSupport.js';

it('resumes a blocked use-group adoption after provider migration without another identity or reverse overwrite', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-retired-external-adoption-'));
  const workers: ReturnType<typeof startRestoreFixture>[] = [];
  try {
    await fs.symlink(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
    const script = path.join(root, 'fixture.mjs');
    await buildRestoreFixture(script);
    const groupId = `group-${randomUUID()}`;
    const peers = [];
    for (const name of ['Applicant', 'Provider', 'Existing']) {
      const worker = startRestoreFixture(script, path.join(root, name), await freePort());
      workers.push(worker);
      peers.push(await worker.send('init', { groupId, name }));
    }
    const [applicant, provider, existing] = workers;
    for (const worker of workers) await worker.send('register', {
      members: peers.map((peer, index) => ({ device: peer.device, name: ['Applicant', 'Provider', 'Existing'][index] }))
    });
    await applicant!.send('seed', { id: 'discarded-local', content: 'Unwanted applicant data' });
    await provider!.send('seed', { id: 'group-source', content: 'Authoritative group content' });
    await existing!.send('seed', { id: 'existing-topic', content: 'Existing member content' });
    await provider!.send('joinProviderEnable', { anchor: true });
    await sync(provider!, peers[2]!);
    await applicant!.send('leave');
    withDatabase(peers[1]!.database, (db) => seedRetiredExternalDocuments(db));
    const request = z.object({ join_request: z.object({ request_id: z.string() }) }).parse(
      await applicant!.send('joinRequest', { origin: peers[1]!.origin, mode: 'use-group' })
    );
    await provider!.send('joinAccept', { requestId: request.join_request.request_id });
    await expect(applicant!.send('joinComplete')).rejects.toThrow('framed_sync_source_changed');
    const before = readAdoption(peers[0]!.database);
    expect(before).not.toBeNull();
    const identity = localIdentity(peers[0]!.database);
    await provider!.send('reopen');
    await provider!.send('joinProviderEnable', { anchor: true });
    await applicant!.send('joinComplete');
    expect(localIdentity(peers[0]!.database)).toBe(identity);
    expect(readAdoption(peers[0]!.database)).toBeNull();
    const completed = withDatabase(peers[0]!.database, (db) => parseSyncGroupLocalAdoption(z.string().parse(
      db.prepare("SELECT value FROM sync_group_metadata WHERE key = 'sync_group_completed_adoption'").pluck().get()
    )));
    expect(completed?.libraryEpoch).toBe(before?.libraryEpoch);
    for (const worker of [applicant!, provider!]) {
      const state = await worker.send('reopen');
      expect(state.library.nodesById['group-source']?.content).toBe('Authoritative group content');
      expect(state.library.nodesById['existing-topic']?.content).toBe('Existing member content');
      expect(state.library.nodesById['discarded-local']).toBeUndefined();
    }
    await applicant!.send('seed', { id: 'after-adoption', content: 'Ordinary synchronization remains available' });
    await sync(applicant!, peers[1]!);
    await sync(provider!, peers[2]!);
    const last = await existing!.send('reopen');
    expect(last.library.nodesById['after-adoption']?.content).toBe('Ordinary synchronization remains available');
    expect(last.library.nodesById['existing-topic']?.content).toBe('Existing member content');
  } finally {
    await Promise.allSettled(workers.map((worker) => worker.close()));
    await fs.rm(root, { recursive: true, force: true });
  }
}, 90_000);

async function freePort() {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fixture_port_missing');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

async function sync(worker: ReturnType<typeof startRestoreFixture>, peer: Awaited<ReturnType<ReturnType<typeof startRestoreFixture>['send']>>) {
  await worker.send('sync', { ...peer }).catch((error: Error) => {
    if (!error.message.includes('sync_group_sync_incomplete')) throw error;
  });
  await worker.send('sync', { ...peer });
}

function withDatabase<T>(databasePath: string, run: (db: Database.Database) => T) {
  const db = new Database(databasePath);
  try { return run(db); } finally { db.close(); }
}

function readAdoption(databasePath: string) {
  return withDatabase(databasePath, (db) => {
    const row = db.prepare("SELECT value FROM sync_group_metadata WHERE key = 'sync_group_local_adoption'").pluck().get();
    if (row === undefined) return null;
    return parseSyncGroupLocalAdoption(z.string().parse(row));
  });
}

function localIdentity(databasePath: string) {
  return withDatabase(databasePath, (db) => z.string().parse(db.prepare(
    'SELECT local_device_identity_key FROM sync_group_local_state WHERE singleton_id = 1'
  ).pluck().get()));
}
