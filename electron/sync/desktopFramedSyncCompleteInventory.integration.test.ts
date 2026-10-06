// @vitest-environment node
import { promises as fs } from 'node:fs';

import { expect, it } from 'vitest';

import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';

import { readFixtureInventory, reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture, readDesktopFramedSyncLibraryEvidence }
  from './desktopFramedSyncTwoProcess.testSupport.js';

it('discovers and persists 10000 objects through a complete normal peer reconciliation', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  let passed = false;
  try {
    for (let index = 0; index < 10000; index += 1) {
      const id = (value: number) => `t326-complete-${String(value).padStart(5, '0')}`;
      await fixture.left.seed({ content: `Body ${index}`, nodeId: id(index),
        ...(index % 100 === 0 ? {} : { parentNodeId: id(Math.floor(index / 100) * 100) }),
        title: `Complete inventory ${index}` });
    }
    const before = await readFixtureInventory(fixture.left);
    expect(before.filter((entry) => entry.objectType === 'node')).toHaveLength(10000);
    await expect(reconnectFixturePeer(fixture.left, fixture.rightSnapshot))
      .resolves.toMatchObject({ complete: true, pending: 0 });
    expect(compareFramedSyncInventories({ local: await readFixtureInventory(fixture.left),
      remote: await readFixtureInventory(fixture.right) })).toEqual([]);
    const source = readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath);
    const received = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
    expect(received.nodes).toEqual(source.nodes);
    expect(received.versions).toEqual(source.versions);
    expect(received.nodes).toHaveLength(10000);
    expect(source.framedSync.outboundHolds).toBe(0);
    passed = true;
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    if (passed) await fs.rm(fixture.root, { recursive: true, force: true });
  }
}, 2_700_000);
