// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { readPackRowsFromZip } from '../../electron/database/syncPackZipReaderTestSupport.ts';
import {
  IOS_SYNC_PACK_CAPTURE_OBJECT_ID,
  IOS_SYNC_PACK_CAPTURE_VERSION_ID,
  IOS_SYNC_PACK_MUTATION_AUTHOR,
  IOS_SYNC_PACK_RESTORE_VERSION_ID
} from '../../lib/platform/iosSyncPackAcceptanceContract.ts';
import { IOS_HOSTED_PROVIDER_DEVICE_ID } from '../../lib/platform/iosHostedSyncGroupContract.ts';
import { IOS_ACCEPTANCE_DESKTOP_PEER_ID } from './ios-acceptance-contract-corpus.ts';

const ROOT = 'scripts/ios/fixtures/acceptance-contract-corpus';
const PEER_ID = 'ios-acceptance-contract-peer';
const TABLES = [
  'content_blobs', 'external_documents', 'node_attachments', 'node_order',
  'node_sync_version_parents', 'node_sync_versions', 'nodes', 'pack_manifest', 'review_log',
  'sync_group_devices', 'sync_groups', 'sync_object_state', 'sync_objects'
];

function read(relativePath) {
  return readPackRowsFromZip(path.join(ROOT, relativePath), '.tmp/ios-contract-corpus-read');
}

it('binds fixed iOS formal inputs to independently readable product pack semantics', () => {
  expect(IOS_ACCEPTANCE_DESKTOP_PEER_ID).toBe(IOS_HOSTED_PROVIDER_DEVICE_ID);
  expect(IOS_SYNC_PACK_MUTATION_AUTHOR).toBe(PEER_ID);
  fs.mkdirSync('.tmp/ios-contract-corpus-read', { recursive: true });
  const content = read('content-resource-read/content-resource.syncpack');
  const stateInitial = read('state-writeback-runtime/confirmation-0.syncpack');
  const stateSteady = read('state-writeback-runtime/confirmation-1.syncpack');
  const legal = read('sync-pack-runtime/legal.syncpack');
  const successor = read('sync-pack-runtime/successor.syncpack');
  const wrongTarget = read('sync-pack-runtime/wrong-target.syncpack');
  const cursorGap = read('sync-pack-runtime/cursor-gap.syncpack');
  const illegalDag = read('sync-pack-runtime/illegal-dag.syncpack');
  const legacyFormat = read('sync-pack-runtime/legacy-format.syncpack');

  for (const pack of [
    content, stateInitial, stateSteady, legal, successor, wrongTarget, cursorGap, illegalDag, legacyFormat
  ]) {
    expect(pack.manifest.schema_version).toBe(78);
    expect(pack.manifest.tables.map(({ name }) => name).sort()).toEqual(TABLES.filter((name) =>
      name !== 'pack_manifest'));
    expect(pack.innerManifest.tables).toEqual(pack.manifest.tables);
    expect(pack.tableNames).toEqual(TABLES);
    expect(pack.groups).toEqual([]);
    expect(pack.groupDevices).toEqual([]);
  }

  expect(content.manifest).toMatchObject({
    from_peer_id: IOS_HOSTED_PROVIDER_DEVICE_ID, to_peer_id: PEER_ID, to_state_seq: 10
  });
  expect(content.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'ios-content-topic' })]));
  expect(stateInitial.manifest).toMatchObject({
    from_peer_id: IOS_HOSTED_PROVIDER_DEVICE_ID,
    from_state_seq: 0,
    to_peer_id: PEER_ID,
    to_state_seq: 1
  });
  expect(stateInitial.nodes).toEqual([expect.objectContaining({ id: 'ios-state-node' })]);
  expect(stateSteady.manifest).toMatchObject({ from_state_seq: 1, to_peer_id: PEER_ID, to_state_seq: 6 });
  expect(stateSteady.stateRows.map(({ object_id, object_type, state_seq }) => ({
    object_id, object_type, state_seq
  }))).toEqual([
    { object_id: 'ios-state-node', object_type: 'node', state_seq: 1 },
    { object_id: 'ios-state-node', object_type: 'node_reading', state_seq: 4 },
    { object_id: 'ios-state-node', object_type: 'node_review', state_seq: 5 },
    {
      object_id: 'host:ios:phone:ios-acceptance-contract-peer:handoff_reminder_settings',
      object_type: 'setting', state_seq: 6
    }
  ]);
  expect(legal.manifest).toMatchObject({
    from_peer_id: IOS_HOSTED_PROVIDER_DEVICE_ID, from_state_seq: 0, to_peer_id: PEER_ID
  });
  expect(legal.nodes).toEqual([expect.objectContaining({ id: 'ios-acceptance-restore' })]);
  expect(successor.manifest.from_state_seq).toBe(legal.manifest.to_state_seq);
  expect(illegalDag.manifest.from_state_seq).toBe(successor.manifest.to_state_seq);
  expect(successor.nodes.map(({ id }) => id)).toEqual([
    IOS_SYNC_PACK_CAPTURE_OBJECT_ID, 'ios-acceptance-restore'
  ]);
  expect(successor.nodeVersions).toEqual(expect.arrayContaining([
    expect.objectContaining({
      object_id: IOS_SYNC_PACK_CAPTURE_OBJECT_ID,
      parent_version_id: IOS_SYNC_PACK_CAPTURE_VERSION_ID
    }),
    expect.objectContaining({
      host_name: IOS_SYNC_PACK_MUTATION_AUTHOR,
      object_id: 'ios-acceptance-restore',
      version_id: IOS_SYNC_PACK_RESTORE_VERSION_ID
    })
  ]));
  const restoredVersion = successor.nodeVersions.find(({ version_id }) =>
    version_id === IOS_SYNC_PACK_RESTORE_VERSION_ID);
  expect(restoredVersion).toMatchObject({
    body_text: '',
    content_hash: '04322032779449b2b2d9fd505b6119df20e5c3fb79f50223b3cac82eb3a73889',
  });
  expect(JSON.parse(restoredVersion.snapshot_json)).toMatchObject({ content: '' });
  expect(JSON.parse(restoredVersion.snapshot_json)).not.toHaveProperty('body_blob_hash');
  expect(wrongTarget.manifest.to_peer_id).toBe(`${PEER_ID}-wrong`);
  expect(cursorGap.manifest.from_state_seq).toBeGreaterThan(successor.manifest.to_state_seq);
  expect(legacyFormat.manifest.format_version).toBe(1);
  expect(illegalDag.manifest.to_state_seq).toBeGreaterThan(illegalDag.manifest.from_state_seq);
  expect(illegalDag.nodeVersionParents).toContainEqual(expect.objectContaining({
    parent_version_id: 'missing#ancestor'
  }));
});
