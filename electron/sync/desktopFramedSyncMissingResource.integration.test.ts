// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';


import { readFixtureInventory, reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';

it('discovers and fills a missing file when the Node identity, hash and resource reference are already equal', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  const bytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(128, 1)]);
  const nodeId = 'same-reference-missing-image';
  try {
    const seeded = await fixture.left.seedResource({ bytes, includeImageInBody: true, nodeId });
    await reconnectFixturePeer(fixture.right, fixture.leftSnapshot);
    const target = path.join(fixture.rightSnapshot.stateRoot, 'documents', 'Foliole', 'Assets', seeded.storageKey);
    expect(await fs.readFile(target)).toEqual(bytes);
    await fs.rm(target);
    const source = (await readFixtureInventory(fixture.left)).find((entry) => entry.objectType === 'node' && entry.globalId === nodeId)!;
    const missing = (await readFixtureInventory(fixture.right)).find((entry) => entry.objectType === 'node' && entry.globalId === nodeId)!;
    expect(source.sharedStateHash).toEqual(missing.sharedStateHash);
    expect(source.resourceHashes.map((hash) => Buffer.from(hash).toString('hex'))).toContain(seeded.hash);
    expect(missing.resourceHashes).toEqual(source.resourceHashes);
    expect(await fs.stat(target).catch(() => null)).toBeNull();
    await fixture.right.invoke('round', { input: { kind: 'remember_peer',
      peerOrigin: fixture.leftSnapshot.origin, peer: { deviceId: fixture.leftSnapshot.deviceId,
        libraryEpoch: `${fixture.leftSnapshot.deviceId}-epoch` } } });
    expect(await reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
    expect(await fs.readFile(target)).toEqual(bytes);
    const received = (await readFixtureInventory(fixture.right))
      .find((entry) => entry.objectType === 'node' && entry.globalId === nodeId)!;
    expect(received.resourceHashes).toEqual(source.resourceHashes);
    expect(received.frontierFactIds).toEqual(missing.frontierFactIds);
    expect(received.sharedStateHash).toEqual(missing.sharedStateHash);
    expect(await reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { force: true, recursive: true });
  }
}, 60_000);
