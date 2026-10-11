// @vitest-environment node
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { textBranch, textDevice } from '../../../../../../electron/database/topicTextState.testSupport.js';
import { createDesktopFramedSyncFiles } from '../../../../../../electron/sync/desktopFramedSyncFiles.js';
import { ANDROID_COMPANION_HOST_SCHEMA_STATEMENTS } from '../../../../../../lib/core/database/androidCompanionHostSchemaStatements.js';
import type { DbPort } from '../../../../../../lib/core/sync/dbPort.js';
import { encodeFramedSyncStream, readFramedSyncStream } from '../../../../../../lib/core/sync/framedSyncBinaryStream.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncDatabaseInventories } from '../../../../../../lib/core/sync/framedSyncDatabaseDifference.js';
import type { FramedSyncFilePort } from '../../../../../../lib/core/sync/framedSyncFilePort.js';
import { createFramedSyncFileSessionNoncePort } from '../../../../../../lib/core/sync/framedSyncFileSession.js';
import { readRequestSyncInventorySnapshot } from '../../../../../../lib/core/sync/framedSyncInventoryRead.js';
import { sendRequestSyncObject } from '../../../../../../lib/core/sync/requestSyncObjectEndpoint.js';
import { readRequestSyncWire } from '../../../../../../lib/core/sync/requestSyncWire.js';

const runtime = vi.hoisted(() => ({ db: undefined as DbPort | undefined, files: undefined as FramedSyncFilePort | undefined }));
vi.mock('../../runtime/iosCompanionDatabaseBootstrap.js', () => ({ getIosCompanionDatabaseOwner: () => ({
  databasePath: '/test-library',
  runWriter: <T>(read: (db: DbPort) => Promise<T>) => read(runtime.db!),
  read: <T>(read: (db: DbPort) => Promise<T>) => read(runtime.db!),
  readSnapshot: <T>(read: (db: DbPort) => Promise<T>) => read(runtime.db!)
}) }));
vi.mock('../../runtime/companionFramedPayloadBudget.js', () => ({ companionFramedFileOwner: () => ({
  library_key: '/test-library', generation_id: 'generation'
}) }));
vi.mock('./companionFramedSyncFiles.js', () => ({ currentCompanionFramedSyncFiles: () => runtime.files! }));
vi.mock('../../../appLifecycle.js', () => ({ readNativeAppActiveState: async () => true,
  subscribeNativeAppBackground: async () => () => undefined }));

import { rememberCompanionRequestSyncPeerState } from './companionRequestSyncPeerState.js';
import { respondCompanionRequestSync } from './companionRequestSyncResponse.js';

it.each([false, true])('applies the native handoff and cleans a late rejected reply=%s', async lateReply => {
  await mkdir('.tmp/artifacts', { recursive: true });
  const root = await mkdtemp(path.resolve('.tmp/artifacts/companion-request-'));
  const source = textDevice(); const target = textDevice();
  const groupKey = new Uint8Array(32).fill(7);
  try {
    seed(source, 'peer', groupKey); seed(target, 'local', groupKey);
    runtime.db = target.db;
    runtime.files = createDesktopFramedSyncFiles(path.join(root, 'target'));
    const files = createDesktopFramedSyncFiles(path.join(root, 'source'));
    const body = '🙂'.repeat(180_000);
    await source.receive([textBranch('head', body)]);
    const [difference] = compareFramedSyncDatabaseInventories({ local: await readRequestSyncInventorySnapshot(source.db), remote: [] });
    if (!difference) throw new Error('test_difference_missing');
    const peerState = { contract_version: 3 as const, group_id: 'group', sender_device_identity_key: 'peer',
      library_epoch: 'peer-epoch', proof_revision: 0, source_proof_revisions: {}, devices: [], removals: [], restore: null };
    rememberCompanionRequestSyncPeerState(peerState, true);
    const context = { groupId: 'group', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION, initiatorDeviceId: 'peer',
      initiatorLibraryEpoch: 'peer-epoch', responderDeviceId: 'local', responderLibraryEpoch: 'local-epoch' } as const;
    await sendRequestSyncObject({ files, noncePort: createFramedSyncFileSessionNoncePort(files),
      readSnapshot: read => read(source.db), write: write => write(source.db) }, { context, groupKey, difference }, async stream => {
      const chunks = [];
      for await (const chunk of encodeFramedSyncStream(stream)) chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      const directory = `requests/${crypto.randomUUID()}`;
      const size = 512 * 1024;
      for (let offset = 0; offset < bytes.length; offset += size) {
        await runtime.files!.write(`${directory}/http-in-${offset / size}`, bytes.subarray(offset, offset + size));
      }
      const payload = { directory, library_key: '/test-library', generation_id: 'generation', mode: 'object',
        group_id: 'group', initiator_device_id: 'peer', initiator_library_epoch: 'peer-epoch',
        responder_device_id: 'local', responder_library_epoch: 'local-epoch', object_type: 'node', global_id: 'topic',
        request_chunk_count: Math.ceil(bytes.length / size), request_byte_length: bytes.length };
      await expect(respondCompanionRequestSync({ ...payload, generation_id: 'obsolete' })).rejects.toThrow('request_sync_library_changed');
      expect(await target.db.query('SELECT id FROM nodes')).toEqual([]);
      if (lateReply) {
        await expect(respondCompanionRequestSync(payload, async () => {
          throw new Error('sync_group_data_request_not_found');
        })).rejects.toThrow('sync_group_data_request_not_found');
        expect((await target.current()).body_text).toBe(body);
        expect(await runtime.files!.list(directory)).toEqual([]);
        return;
      }
      const result = await respondCompanionRequestSync(payload);
      const response = await readFramedSyncStream((async function* () {
        for (let index = 0; index < result.response_chunk_count; index++) yield (await runtime.files!.read(`${directory}/http-out-${index}`))!;
      })());
      const messages = [];
      for await (const decoded of readRequestSyncWire({ ...response, context, groupKey })) messages.push(decoded.message);
      expect(messages).toMatchObject([{ payloadCase: 'round_receipt', payload: { result: 1 } }]);
      expect((await target.current()).body_text).toBe(body);
      expect(await target.db.query('SELECT adopted_version_id FROM node_version_member_positions')).toContainEqual({ adopted_version_id: 'head' });
      expect(await target.db.query('SELECT count(*) AS count FROM framed_sync_inbound_transfers')).toEqual([{ count: 0 }]);
      await runtime.files!.remove(directory);
    });
  } finally { source.sqlite.close(); target.sqlite.close(); await rm(root, { force: true, recursive: true }); }
});

function seed(device: ReturnType<typeof textDevice>, id: string, groupKey: Uint8Array) {
  for (const statement of ANDROID_COMPANION_HOST_SCHEMA_STATEMENTS) device.sqlite.exec(statement);
  device.sqlite.prepare("INSERT INTO sync_groups VALUES ('group', 'Group', ?, 'now', 'now')").run(Buffer.from(groupKey).toString('base64url'));
  device.sqlite.prepare("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')").run(id);
  device.sqlite.prepare('UPDATE node_version_local_proof_state SET library_epoch = ?').run(`${id}-epoch`);
  device.sqlite.exec(`INSERT INTO companion_meta(key, value, updated_at) VALUES ('host_name', 'Mobile', 'now');
    INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor, canonical_library_path,
      device_name, platform, state, joined_at, updated_at) VALUES
    ('group', 'peer', 'peer', '/peer', 'Peer', 'mac', 'active', 'now', 'now'),
    ('group', 'local', 'local', '/local', 'Local', 'ios', 'active', 'now', 'now')`);
}
