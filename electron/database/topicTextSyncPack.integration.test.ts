// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { bytesToHex } from '@noble/hashes/utils.js';
import { afterEach, expect, it } from 'vitest';


import { hashTextBody } from '../../lib/core/database/textBodyHash.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';
import { readFramedSyncInventoryEntry } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { withRequestSyncFiles, type RequestSyncFiles } from '../../lib/core/sync/requestSyncFiles.js';
import { applyRequestSyncObject } from '../../lib/core/sync/requestSyncObjectApply.js';
import { writeRequestSyncSnapshot } from '../../lib/core/sync/requestSyncSnapshot.js';
import { createDesktopFramedSyncFiles } from '../sync/desktopFramedSyncFiles.js';

import { textBranch, textDevice, wholeBodies } from './topicTextState.testSupport.js';

const devices: ReturnType<typeof textDevice>[] = [];
let directory = '';
afterEach(async () => {
  devices.splice(0).forEach((host) => host.sqlite.close());
  if (directory) await fs.rm(directory, { recursive: true, force: true });
});

it('delivers every alternative body to an empty library through a real current request', async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-whole-body-request-'));
  const source = textDevice(); const target = textDevice(); devices.push(source, target);
  const base = textBranch('base', 'Base');
  await source.receive([base, textBranch('a', 'Main longest body', base)]);
  const whole = await source.receive([textBranch('b', 'B', base), textBranch('c', 'C', base)]);
  const entry = await readFramedSyncInventoryEntry(source.db, { objectType: 'node', globalId: 'topic' });
  expect(entry).not.toBeNull();
  const [difference] = compareFramedSyncInventories({ local: [entry!], remote: [] });
  await withRequestSyncFiles(createDesktopFramedSyncFiles(directory), async request => {
    await writeRequestSyncSnapshot(source.db, difference!, request);
    await receive(target, request);
    const restored = await target.current();
    expect(restored.version_id).toBe(whole.version_id);
    expect(wholeBodies(restored)).toEqual(new Set(['Main longest body', 'B', 'C']));
    const storedBodies = target.sqlite.prepare(
      "SELECT json_extract(snapshot_json, '$.text_alternative_bodies') FROM node_sync_versions WHERE version_id = ?"
    ).pluck().get(whole.version_id) as string;
    expect(JSON.parse(storedBodies).map((body: { text: string }) => body.text).sort()).toEqual(['B', 'C']);
    expect(restored.snapshot).not.toHaveProperty('text_alternative_bodies');
    const rejected = textDevice(); devices.push(rejected);
    await expect(receive(rejected, request, hashTextBody('B'))).rejects.toThrow('text_alternative_body_blob_invalid');
    expect(rejected.sqlite.prepare("SELECT id FROM nodes WHERE id = 'topic'").get()).toBeUndefined();
    expect(rejected.sqlite.prepare('SELECT COUNT(*) FROM content_blob_data').pluck().get()).toBe(0);
    expect(rejected.sqlite.prepare('SELECT COUNT(*) FROM node_sync_versions').pluck().get()).toBe(0);
  });
});

async function receive(target: ReturnType<typeof textDevice>, request: RequestSyncFiles, corruptHash?: string) {
  target.sqlite.exec(`INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now');
    INSERT INTO sync_group_local_state VALUES (1, 'group', 'target', 'active', 'now');
    UPDATE node_version_local_proof_state SET library_epoch = 'target-epoch';
    INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor, canonical_library_path,
      device_name, platform, state, joined_at, updated_at)
    VALUES ('group', 'source', 'source-anchor', '/source', 'Source', 'mac', 'active', 'now', 'now'),
      ('group', 'target', 'target-anchor', '/target', 'Target', 'mac', 'active', 'now', 'now')`);
  return applyRequestSyncObject(target.db, {
    context: { groupId: 'group', senderDeviceId: 'source', senderLibraryEpoch: 'source-epoch',
      receiverDeviceId: 'target', receiverLibraryEpoch: 'target-epoch', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION },
    peerState: { contract_version: 3, group_id: 'group', sender_device_identity_key: 'source',
      library_epoch: 'source-epoch', proof_revision: 0, source_proof_revisions: {}, devices: [], removals: [], restore: null },
    objectType: 'node', globalId: 'topic', requestId: new Uint8Array(16),
    facts: () => request.readFacts(), loadBody: async (_db, blob) => {
      const data = await request.loadBody(blob);
      return bytesToHex(blob.sha256) === corruptHash ? new TextEncoder().encode('corrupted') : data;
    }
  });
}
