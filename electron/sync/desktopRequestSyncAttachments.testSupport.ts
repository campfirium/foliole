import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

import Database from 'better-sqlite3';

import { recordFramedSyncResourceAvailability } from '../../lib/core/database/framedSyncResourceAvailability.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { readRequestSyncAttachmentNeeds } from '../../lib/core/sync/requestSyncAttachmentNeeds.js';
import type { RequestSyncAttachmentHost } from '../../lib/core/sync/requestSyncAttachmentResponse.js';
import type { RequestSyncDatabaseHost } from '../../lib/core/sync/requestSyncObjectEndpoint.js';
import { applyConvergentSyncNodesWithDbPort } from '../../lib/core/sync/syncNodeConvergence.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { textBranch } from '../database/topicTextState.testSupport.js';

import { handleProductionCompanionFramedSyncPost } from './companionLanFramedSyncRoute.js';
import { openDesktopAttachmentBlockReceiver } from './desktopAttachmentBlockFiles.js';
import { createDesktopAttachmentBlockSource, isDesktopAttachmentPresent } from './desktopAttachmentBlockSource.js';
import { createDesktopRequestSyncFiles } from './desktopRequestSyncFiles.js';
import { markDesktopSyncGroupMemberStateReady } from './desktopSyncGroupMemberStateReadiness.js';

export const attachmentGroupKey = new Uint8Array(32).fill(7);
export function seedAttachmentMembership(sqlite: Database.Database, device: 'peer' | 'local') {
  sqlite.prepare("INSERT INTO sync_groups VALUES ('group', 'Group', ?, 'now', 'now')")
    .run(Buffer.from(attachmentGroupKey).toString('base64url'));
  sqlite.prepare("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')").run(device);
  sqlite.prepare('UPDATE node_version_local_proof_state SET library_epoch = ?').run(`${device}-epoch`);
  sqlite.exec(`INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor, canonical_library_path,
    device_name, platform, state, joined_at, updated_at)
    VALUES ('group', 'peer', 'peer-anchor', '/peer', 'Peer', 'mac', 'active', 'now', 'now'),
      ('group', 'local', 'local-anchor', '/local', 'Local', 'mac', 'active', 'now', 'now')`);
}

export async function seedAttachmentReferences(sqlite: Database.Database, storageKeys: string[]) {
  const db = createBetterSqliteDbPort(sqlite);
  await applyConvergentSyncNodesWithDbPort(db, [textBranch('v1', 'Attachments')]);
  await db.run('UPDATE nodes SET resource_references = ? WHERE id = ?', [JSON.stringify(storageKeys.map(storage_key =>
    ({ storage_key, role: 'reference', original_name: null }))), 'topic']);
}

export async function attachmentHttpSource(keys: string[], root: string, reopen = false) {
  const directory = path.join(root, 'source');
  await mkdir(directory, { recursive: true });
  const databasePath = path.join(directory, 'source.sqlite');
  const sqlite = new Database(databasePath);
  sqlite.pragma('journal_mode = WAL'); initializeDatabaseSchema(sqlite);
  if (!reopen) {
    seedAttachmentMembership(sqlite, 'peer');
    await seedAttachmentReferences(sqlite, keys);
  }
  const db = createBetterSqliteDbPort(sqlite);
  const database: RequestSyncDatabaseHost = { files: createDesktopRequestSyncFiles(databasePath),
    readSnapshot: read => read(db), write: write => write(db) };
  const assetsDir = path.join(directory, 'Assets');
  const receiver = await openDesktopAttachmentBlockReceiver({ libraryRoot: directory, assetsDir,
    availability: (hash, available) => recordFramedSyncResourceAvailability(db, [hash], available) });
  if (receiver.kind !== 'acquired') throw new Error('test_owner_busy');
  const source = createDesktopAttachmentBlockSource(assetsDir);
  const host: RequestSyncAttachmentHost = { ...receiver, ...source,
    needs: () => readRequestSyncAttachmentNeeds(database, keys => Promise.all(keys.map(key => isDesktopAttachmentPresent(assetsDir, key)))) };
  return { host, database, assetsDir, sqlite, databasePath, async close() { await receiver.close(); sqlite.close(); } };
}

export async function seedAttachmentTarget(keys: string[]) {
  await runWithDatabaseConnectionOwner(async () => {
    const { sqlite } = openDatabaseConnection();
    initializeDatabaseSchema(sqlite); seedAttachmentMembership(sqlite, 'local');
    await seedAttachmentReferences(sqlite, keys);
  });
  markDesktopSyncGroupMemberStateReady('peer', 'normal', { contract_version: 3, group_id: 'group',
    sender_device_identity_key: 'peer', library_epoch: 'peer-epoch', proof_revision: 0,
    source_proof_revisions: {}, devices: [], removals: [], restore: null });
}

export async function attachmentHttpServer(dropResponseAt: number) {
  const production = http.createServer((request, response) => {
    void handleProductionCompanionFramedSyncPost({ deviceId: 'local', request, response }).catch(error => response.destroy(error));
  });
  const origin = await listen(production);
  let count = 0;
  const relay = http.createServer((request, response) => {
    const drop = ++count === dropResponseAt;
    const outgoing = http.request(new URL(request.url ?? '/', origin), { method: request.method, headers: request.headers }, incoming => {
      if (drop) { incoming.resume(); response.destroy(); return; }
      response.writeHead(incoming.statusCode ?? 500, incoming.headers); incoming.pipe(response);
    });
    outgoing.on('error', error => response.destroy(error)); request.pipe(outgoing);
  });
  return { url: await listen(relay), async close() {
    await new Promise<void>(resolve => relay.close(() => resolve()));
    await new Promise<void>(resolve => production.close(() => resolve()));
  } };
}
async function listen(server: http.Server) {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test_address_invalid');
  return `http://127.0.0.1:${address.port}`;
}
export async function attachmentHttpDirectory() {
  await mkdir('.tmp/artifacts', { recursive: true });
  const root = await mkdtemp(path.resolve('.tmp/artifacts/attachment-http-'));
  return { root, remove: () => rm(root, { recursive: true, force: true }) };
}
