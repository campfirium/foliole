// @vitest-environment node
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

const sandbox = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, app: {
  getPath: (name: string) => `${sandbox.root}/host/${name}`, isPackaged: false
} }));

import { ATTACHMENT_BLOCK_BYTES } from '../../lib/core/sync/attachmentBlockReceiver.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { withRequestSyncPeerRound } from '../../lib/core/sync/requestSyncPeerRound.js';
import { createSyncPeerRoundOwnership } from '../../lib/core/sync/syncPeerRoundOwnership.js';
import { closeDatabaseConnection, runWithDatabaseConnectionMaintenance } from '../database/connection.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';

import { drainAttachmentSlices as exchangeRequestSyncAttachments } from './attachmentSliceDrain.testSupport.js';
import { clearCompanionRequestNonceCache } from './companionRequestAuth.js';
import { attachmentGroupKey, attachmentHttpDirectory, attachmentHttpServer,
  attachmentHttpSource, seedAttachmentTarget } from './desktopRequestSyncAttachments.testSupport.js';
import { createDesktopRequestSyncExchange } from './desktopRequestSyncExchange.js';
import { clearDesktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';

const attachment = (text: string) => {
  const bytes = Buffer.from(text);
  return { bytes, key: `${createHash('sha256').update(bytes).digest('hex')}.pdf` };
};

async function withAttachments(keys: string[], execute: (fixture: {
  local: Awaited<ReturnType<typeof attachmentHttpSource>>;
  remoteDir: string;
  failures: Array<{ key: string; error: unknown }>;
  transfer: () => Promise<{ pending: number | null; transferred: number }>;
}) => Promise<void>) {
  const directory = await attachmentHttpDirectory(); sandbox.root = directory.root;
  vi.stubEnv('FOLIOLE_LIBRARY_HOME', path.join(directory.root, 'target'));
  const local = await attachmentHttpSource(keys, directory.root);
  await seedAttachmentTarget([]);
  const remoteDir = resolveRuntimeDataPaths().assetsDir;
  const server = await attachmentHttpServer(0);
  const failures: Array<{ key: string; error: unknown }> = [];
  const roundId = crypto.randomUUID();
  const lease = createSyncPeerRoundOwnership(60_000).acquireOutbound('local', roundId);
  if (!lease) throw new Error('test_round_busy');
  const peerRound = { id: roundId, lease, admitted: false };
  const exchange = createDesktopRequestSyncExchange({ peerRound, endpointUrl: server.url, groupKey: attachmentGroupKey,
    groupSecret: Buffer.from(attachmentGroupKey).toString('base64url'),
    context: { protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, groupId: 'group', initiatorDeviceId: 'peer',
      initiatorLibraryEpoch: 'peer-epoch', responderDeviceId: 'local', responderLibraryEpoch: 'local-epoch' } });
  try {
    await withRequestSyncPeerRound(exchange, peerRound, () => execute({ local, remoteDir, failures,
      transfer: () => exchangeRequestSyncAttachments(local.host, exchange, (key, error) => failures.push({ key, error })) }));
  } finally {
    lease.release(); vi.restoreAllMocks(); await server.close(); await local.close();
    await runWithDatabaseConnectionMaintenance(() => closeDatabaseConnection());
    clearDesktopSyncGroupMemberStateReadiness(); clearCompanionRequestNonceCache();
    vi.unstubAllEnvs(); await directory.remove(); sandbox.root = '';
  }
}

it.each([0, 1])('preserves the prefix and original disk-full error after %s blocks, then recovers', async (completedBlocks) => {
  const item = attachment(completedBlocks ? 'x'.repeat(3 * ATTACHMENT_BLOCK_BYTES + 17) : 'Disk full attachment');
  await withAttachments([item.key], async ({ local, remoteDir, failures, transfer }) => {
    await fs.writeFile(path.join(remoteDir, item.key), item.bytes);
    const error = Object.assign(new Error('No space left on device'), { code: 'ENOSPC' });
    const open = fs.open.bind(fs);
    const spy = vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
      const handle = await open(...args);
      if (String(args[0]).startsWith(local.assetsDir) && String(args[0]).endsWith('.partial') && args[1] === 'r+') {
        if ((await handle.stat()).size >= completedBlocks * ATTACHMENT_BLOCK_BYTES) {
          vi.spyOn(handle, 'write').mockRejectedValue(error);
        }
      }
      return handle;
    });
    expect(await transfer()).toEqual({ pending: 1, transferred: 0 });
    expect(failures).toEqual([{ key: item.key, error }]);
    expect(failures[0]!.error).toBe(error);
    const partial = path.join(local.assetsDir, `.attachment-${item.key.slice(0, 64)}.partial`);
    expect(await fs.readFile(partial)).toEqual(item.bytes.subarray(0, completedBlocks * ATTACHMENT_BLOCK_BYTES));
    expect(await fs.stat(path.join(local.assetsDir, item.key)).catch(() => null)).toBeNull();
    expect(local.sqlite.prepare('SELECT available FROM framed_sync_resource_availability WHERE hash = ?')
      .get(item.key.slice(0, 64))).toEqual({ available: 0 });
    spy.mockRestore(); failures.length = 0;
    expect(await transfer()).toEqual({ pending: 0, transferred: 1 });
    expect(failures).toEqual([]);
    expect(await fs.readFile(path.join(local.assetsDir, item.key))).toEqual(item.bytes);
  });
});

it('continues after a missing first attachment and fills only that attachment on the next round', async () => {
  const [missing, good] = [attachment('First bytes'), attachment('Second bytes')]
    .sort((a, b) => a.key.localeCompare(b.key));
  await withAttachments([missing!.key, good!.key], async ({ local, remoteDir, failures, transfer }) => {
    await fs.writeFile(path.join(remoteDir, good!.key), good!.bytes);
    expect(await local.host.needs()).toEqual([missing!.key, good!.key]);
    const firstRound = await transfer();
    expect(failures.filter(failure => failure.key === good!.key)).toEqual([]);
    expect(firstRound).toEqual({ pending: 1, transferred: 1 });
    expect(failures).toHaveLength(1);
    expect(failures[0]!.key).toBe(missing!.key);
    expect(await fs.readFile(path.join(local.assetsDir, good!.key))).toEqual(good!.bytes);
    expect(await fs.stat(path.join(local.assetsDir, missing!.key)).catch(() => null)).toBeNull();
    expect(await local.host.needs()).toEqual([missing!.key]);
    await fs.writeFile(path.join(remoteDir, missing!.key), missing!.bytes); failures.length = 0;
    expect(await transfer()).toEqual({ pending: 0, transferred: 1 });
    expect(failures).toEqual([]);
    for (const item of [missing!, good!]) {
      expect(await fs.readFile(path.join(local.assetsDir, item.key))).toEqual(item.bytes);
    }
    expect(await transfer()).toEqual({ pending: 0, transferred: 0 });
  });
});
