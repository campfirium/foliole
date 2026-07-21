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
  const cursorGap = readPackRowsFromZip(fixture.cursorGapPath, tempRoot);
  const legalBytes = await fs.readFile(fixture.legalPath);
  const corruptBytes = await fs.readFile(fixture.corruptEnvelopePath);

  expect(legal).toMatchObject({
    manifest: expect.objectContaining({ from_state_seq: 0, to_peer_id: 'ios-runtime-device' }),
    nodes: [expect.objectContaining({ id: 'ios-acceptance-node' })],
    stateRows: [{ object_id: 'ios-acceptance-node', object_type: 'node', state_seq: 2 }]
  });
  expect(wrongTarget.manifest).toMatchObject({ to_peer_id: 'ios-runtime-device-wrong' });
  expect(cursorGap).toMatchObject({
    manifest: expect.objectContaining({ from_state_seq: 3, to_state_seq: 4, to_peer_id: 'ios-runtime-device' }),
    nodes: [expect.objectContaining({ id: 'ios-acceptance-gap-node' })]
  });
  expect(corruptBytes.subarray(1)).toEqual(legalBytes.subarray(1));
  expect(corruptBytes[0]).not.toBe(legalBytes[0]);
});
