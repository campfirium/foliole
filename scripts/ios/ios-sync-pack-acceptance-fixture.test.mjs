// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { readPackRowsFromZip } from '../../electron/database/syncPackZipReaderTestSupport.ts';
import {
  IOS_SYNC_PACK_CAPTURE_OBJECT_ID,
  IOS_SYNC_PACK_CAPTURE_VERSION_ID,
  IOS_SYNC_PACK_RESTORE_VERSION_ID
} from '../../lib/platform/iosSyncPackAcceptanceContract.ts';

import { createIosSyncPackAcceptanceFixture } from './ios-sync-pack-acceptance-fixture.ts';

let tempRoot = '';

afterEach(async () => {
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('generates isolated producer packs for the paired iOS identity and failure cases', async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-ios-sync-pack-acceptance-'));
  const fixture = await createIosSyncPackAcceptanceFixture({
    outputDirectory: tempRoot,
    toPeerId: 'ios-runtime-device'
  });
  const legal = readPackRowsFromZip(fixture.legalPath, tempRoot);
  const wrongTarget = readPackRowsFromZip(fixture.wrongTargetPath, tempRoot);
  await fixture.buildContractSuccessorPack();
  const successor = readPackRowsFromZip(fixture.successorPath, tempRoot);
  const cursorGap = readPackRowsFromZip(fixture.cursorGapPath, tempRoot);
  const illegalDag = readPackRowsFromZip(fixture.illegalDagPath, tempRoot);
  const legalBytes = await fs.readFile(fixture.legalPath);
  const corruptBytes = await fs.readFile(fixture.corruptEnvelopePath);

  expect(legal).toMatchObject({
    manifest: expect.objectContaining({ from_state_seq: 0, to_peer_id: 'ios-runtime-device' }),
    nodes: [expect.objectContaining({ id: 'ios-acceptance-restore' })],
    nodeVersions: [expect.objectContaining({
      object_id: 'ios-acceptance-restore', version_id: expect.any(String)
    })],
    stateRows: [
      { object_id: 'ios-acceptance-restore', object_type: 'node', state_seq: 1 }
    ]
  });
  expect(legal.nodes).not.toContainEqual(expect.objectContaining({ id: 'special-inbox' }));
  expect(legal.nodeVersions).not.toContainEqual(expect.objectContaining({ object_id: 'special-inbox' }));
  expect(JSON.parse(legal.nodeVersions[0].snapshot_json).parent_id).toBe('special-inbox');
  expect(wrongTarget.manifest).toMatchObject({ to_peer_id: 'ios-runtime-device-wrong' });
  expect(successor.manifest.from_state_seq).toBe(legal.manifest.to_state_seq);
  expect(successor.nodes.map(({ id }) => id)).toEqual([
    IOS_SYNC_PACK_CAPTURE_OBJECT_ID, 'ios-acceptance-restore'
  ]);
  expect(successor.nodeVersions).toEqual(expect.arrayContaining([
    expect.objectContaining({
      object_id: IOS_SYNC_PACK_CAPTURE_OBJECT_ID,
      parent_version_id: IOS_SYNC_PACK_CAPTURE_VERSION_ID
    }),
    expect.objectContaining({ object_id: 'ios-acceptance-restore', version_id: IOS_SYNC_PACK_RESTORE_VERSION_ID })
  ]));
  expect(cursorGap.nodes).toEqual([expect.objectContaining({ id: 'ios-acceptance-gap-node' })]);
  expect(cursorGap.manifest.to_peer_id).toBe('ios-runtime-device');
  expect(cursorGap.manifest.from_state_seq).toBeGreaterThan(successor.manifest.to_state_seq);
  expect(cursorGap.manifest.to_state_seq).toBe(cursorGap.manifest.from_state_seq + 1);
  expect(illegalDag.nodeVersionParents).toContainEqual(expect.objectContaining({
    parent_version_id: 'missing#ancestor'
  }));
  expect(illegalDag.manifest.tables).toContainEqual({
    name: 'node_sync_version_parents',
    row_count: illegalDag.nodeVersionParents.length
  });
  expect(corruptBytes.subarray(1)).toEqual(legalBytes.subarray(1));
  expect(corruptBytes[0]).not.toBe(legalBytes[0]);
});
