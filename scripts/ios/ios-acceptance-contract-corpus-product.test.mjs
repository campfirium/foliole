// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { readPackRowsFromZip } from '../../electron/database/syncPackZipReaderTestSupport.ts';

const ROOT = 'scripts/ios/fixtures/acceptance-contract-corpus';
const PEER_ID = 'ios-acceptance-contract-peer';

function read(relativePath) {
  return readPackRowsFromZip(path.join(ROOT, relativePath), '.tmp/ios-contract-corpus-read');
}

it('binds fixed iOS formal inputs to independently readable product pack semantics', () => {
  fs.mkdirSync('.tmp/ios-contract-corpus-read', { recursive: true });
  const content = read('content-resource-read/content-resource.syncpack');
  const stateInitial = read('state-writeback-runtime/confirmation-0.syncpack');
  const stateSteady = read('state-writeback-runtime/confirmation-1.syncpack');
  const legal = read('sync-pack-runtime/legal.syncpack');
  const successor = read('sync-pack-runtime/successor.syncpack');
  const wrongTarget = read('sync-pack-runtime/wrong-target.syncpack');
  const cursorGap = read('sync-pack-runtime/cursor-gap.syncpack');
  const illegalDag = read('sync-pack-runtime/illegal-dag.syncpack');

  expect(content.manifest).toMatchObject({
    from_peer_id: 'acceptance-desktop', to_peer_id: PEER_ID, to_state_seq: 10
  });
  expect(content.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'ios-content-topic' })]));
  expect(stateInitial.manifest).toMatchObject({
    from_peer_id: 'acceptance-desktop', from_state_seq: 0, to_peer_id: PEER_ID, to_state_seq: 1
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
    from_peer_id: 'acceptance-desktop', from_state_seq: 0, to_peer_id: PEER_ID
  });
  expect(legal.nodes).toEqual([expect.objectContaining({ id: 'ios-acceptance-restore' })]);
  expect(successor.manifest.from_state_seq).toBe(legal.manifest.to_state_seq);
  expect(wrongTarget.manifest.to_peer_id).toBe(`${PEER_ID}-wrong`);
  expect(cursorGap.manifest.from_state_seq).toBeGreaterThan(successor.manifest.to_state_seq);
  expect(illegalDag.manifest.from_state_seq).toBe(legal.manifest.to_state_seq);
  expect(illegalDag.nodeVersionParents).toContainEqual(expect.objectContaining({
    parent_version_id: 'missing#ancestor'
  }));
});
