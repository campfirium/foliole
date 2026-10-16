// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

const sandbox = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, app: {
  getPath: (name: string) => `${sandbox.root}/host/${name}`, isPackaged: false
} }));

import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { pullRequestSyncAttachment } from '../../lib/core/sync/requestSyncAttachmentExchange.js';
import { readRequestSyncAttachmentNeeds } from '../../lib/core/sync/requestSyncAttachmentNeeds.js';
import { withRequestSyncPeerRound } from '../../lib/core/sync/requestSyncPeerRound.js';
import { createSyncPeerRoundOwnership } from '../../lib/core/sync/syncPeerRoundOwnership.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, runWithDatabaseConnectionMaintenance } from '../database/connection.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';

import { clearCompanionRequestNonceCache } from './companionRequestAuth.js';
import { isDesktopAttachmentPresent } from './desktopAttachmentBlockSource.js';
import { attachmentGroupKey, attachmentHttpDirectory, attachmentHttpServer,
  attachmentHttpSource, seedAttachmentTarget } from './desktopRequestSyncAttachments.testSupport.js';
import { createDesktopRequestSyncExchange } from './desktopRequestSyncExchange.js';
import { clearDesktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';

function attachment(text: string) {
  const bytes = Buffer.from(text);
  return { bytes, key: `${createHash('sha256').update(bytes).digest('hex')}.pdf` };
}

it.each([false, true])('pulls only the opened attachment without changing business facts when references change mid-transfer: %s', async changeReferences => {
  const directory = await attachmentHttpDirectory(); sandbox.root = directory.root;
  vi.stubEnv('FOLIOLE_LIBRARY_HOME', path.join(directory.root, 'target'));
  const selected = attachment('Opened attachment'.repeat(40000)); const other = attachment('Unopened attachment');
  const localOnly = attachment('Peer needs this local attachment');
  const keys = [selected.key, other.key, localOnly.key];
  const local = await attachmentHttpSource(keys, directory.root);
  await seedAttachmentTarget(keys);
  const remoteDir = resolveRuntimeDataPaths().assetsDir;
  await writeFile(path.join(remoteDir, selected.key), selected.bytes);
  await writeFile(path.join(remoteDir, other.key), other.bytes);
  await writeFile(path.join(local.assetsDir, localOnly.key), localOnly.bytes);
  const before = local.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all();
  const server = await attachmentHttpServer(0);
  const id = crypto.randomUUID();
  const lease = createSyncPeerRoundOwnership(60_000).acquireOutbound('local', id);
  if (!lease) throw new Error('test_round_busy');
  const peerRound = { id, lease, admitted: false };
  const exchange = createDesktopRequestSyncExchange({ peerRound, endpointUrl: server.url, groupKey: attachmentGroupKey,
    groupSecret: Buffer.from(attachmentGroupKey).toString('base64url'),
    context: { protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, groupId: 'group', initiatorDeviceId: 'peer',
      initiatorLibraryEpoch: 'peer-epoch', responderDeviceId: 'local', responderLibraryEpoch: 'local-epoch' } });
  let changed = false;
  const selectedHost = { ...local.host, async receive(...input: Parameters<typeof local.host.receive>) {
    if (changeReferences && !changed) {
      changed = true;
      local.sqlite.prepare('UPDATE nodes SET resource_references = ? WHERE id = ?')
        .run(JSON.stringify([{ storage_key: other.key, role: 'reference', original_name: null }]), 'topic');
    }
    return local.host.receive(...input);
  } };
  try {
    await withRequestSyncPeerRound(exchange, peerRound, async () => {
      await pullRequestSyncAttachment(selectedHost, exchange, selected.key);
      await pullRequestSyncAttachment(selectedHost, exchange, selected.key);
    });
    expect(await readFile(path.join(local.assetsDir, selected.key))).toEqual(selected.bytes);
    await expect(stat(path.join(local.assetsDir, other.key))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(stat(path.join(remoteDir, localOnly.key))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(changed).toBe(changeReferences);
    expect(await local.host.needs()).toEqual([other.key]);
    if (changeReferences) expect(local.sqlite.prepare(
      "SELECT resource_references FROM nodes WHERE id = 'topic'").pluck().get())
      .toBe(JSON.stringify([{ storage_key: other.key, role: 'reference', original_name: null }]));
    expect(local.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all()).toEqual(before);
  } finally {
    lease.release(); await server.close(); await local.close();
    await runWithDatabaseConnectionMaintenance(() => closeDatabaseConnection());
    clearDesktopSyncGroupMemberStateReadiness(); clearCompanionRequestNonceCache();
    vi.unstubAllEnvs(); await directory.remove(); sandbox.root = '';
  }
});


it('recomputes needs after actual file loss and ignores deleted nodes without changing their version facts', async () => {
  const directory = await attachmentHttpDirectory();
  const item = attachment('Original attachment');
  const local = await attachmentHttpSource([item.key], directory.root);
  const before = local.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all();
  try {
    await writeFile(path.join(local.assetsDir, item.key), item.bytes);
    expect(await local.host.needs()).toEqual([]);
    await unlink(path.join(local.assetsDir, item.key));
    expect(await local.host.needs()).toEqual([item.key]);
    expect(local.sqlite.prepare('SELECT hash, available FROM framed_sync_resource_availability').all())
      .toEqual([{ hash: item.key.slice(0, 64), available: 0 }]);
    local.sqlite.prepare("UPDATE nodes SET deleted_at = '2026-10-14T00:00:00.000Z' WHERE id = 'topic'").run();
    expect(await local.host.needs()).toEqual([]);
    expect(local.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all()).toEqual(before);
  } finally { await local.close(); await directory.remove(); }
});

it('keeps availability and original facts unchanged when a file check fails and succeeds on retry', async () => {
  const directory = await attachmentHttpDirectory();
  const items = [attachment('First original'), attachment('Second original')];
  const local = await attachmentHttpSource(items.map(item => item.key), directory.root);
  const db = createBetterSqliteDbPort(local.sqlite);
  const host = { readSnapshot: async <T>(read: (port: typeof db) => Promise<T>) => read(db),
    write: async <T>(write: (port: typeof db) => Promise<T>) => db.transaction(write) };
  const before = local.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all();
  const availability = () => local.sqlite.prepare('SELECT * FROM framed_sync_resource_availability ORDER BY hash').all();
  try {
    for (const item of items) await writeFile(path.join(local.assetsDir, item.key), item.bytes);
    const initial = availability();
    let checks = 0;
    await expect(readRequestSyncAttachmentNeeds(host, async keys => Promise.all(keys.map(async key => {
      if (++checks === 2) throw new Error('fixture_file_check_failed');
      return isDesktopAttachmentPresent(local.assetsDir, key);
    })))).rejects.toThrow('fixture_file_check_failed');
    expect(checks).toBe(2);
    expect(availability()).toEqual(initial);
    expect(local.sqlite.prepare('SELECT * FROM node_sync_versions ORDER BY version_id').all()).toEqual(before);
    expect(await local.host.needs()).toEqual([]);
    expect(availability()).toEqual(items.map(item => ({ hash: item.key.slice(0, 64), available: 1 }))
      .sort((a, b) => a.hash.localeCompare(b.hash)));
  } finally { await local.close(); await directory.remove(); }
});
