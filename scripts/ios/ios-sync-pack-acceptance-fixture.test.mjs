// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { readPackRowsFromZip } from '../../electron/database/syncPackZipReaderTestSupport.ts';

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
  await fixture.buildSuccessorPack(['special-inbox', 'ios-acceptance-restore']);
  const successor = readPackRowsFromZip(fixture.successorPath, tempRoot);
  const cursorGap = readPackRowsFromZip(fixture.cursorGapPath, tempRoot);
  const legalBytes = await fs.readFile(fixture.legalPath);
  const corruptBytes = await fs.readFile(fixture.corruptEnvelopePath);

  expect(legal).toMatchObject({
    manifest: expect.objectContaining({ from_state_seq: 0, to_peer_id: 'ios-runtime-device' }),
    nodes: expect.arrayContaining([
      expect.objectContaining({ id: 'special-inbox' }),
      expect.objectContaining({ id: 'ios-acceptance-restore' })
    ]),
    nodeVersions: expect.arrayContaining([
      expect.objectContaining({ object_id: 'special-inbox', version_id: 'acceptance-desktop#0' }),
      expect.objectContaining({ object_id: 'ios-acceptance-restore', version_id: 'acceptance-desktop#1' })
    ]),
    stateRows: [
      { object_id: 'special-inbox', object_type: 'node', state_seq: 1 },
      { object_id: 'ios-acceptance-restore', object_type: 'node', state_seq: 2 }
    ]
  });
  expect(wrongTarget.manifest).toMatchObject({ to_peer_id: 'ios-runtime-device-wrong' });
  expect(cursorGap.nodes).toEqual([expect.objectContaining({ id: 'ios-acceptance-gap-node' })]);
  expect(cursorGap.manifest.to_peer_id).toBe('ios-runtime-device');
  expect(cursorGap.manifest.from_state_seq).toBeGreaterThan(successor.manifest.to_state_seq);
  expect(cursorGap.manifest.to_state_seq).toBe(cursorGap.manifest.from_state_seq + 1);
  expect(corruptBytes.subarray(1)).toEqual(legalBytes.subarray(1));
  expect(corruptBytes[0]).not.toBe(legalBytes[0]);
});
