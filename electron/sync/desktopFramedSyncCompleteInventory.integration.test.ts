// @vitest-environment node
import { promises as fs } from 'node:fs';

import { expect, it } from 'vitest';

import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';

import { readFixtureInventory, reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture, readDesktopFramedSyncLibraryEvidence }
  from './desktopFramedSyncTwoProcess.testSupport.js';

it.each([1000, 10000])('persists %i complete 8 KiB bodies through peer reconciliation and restart', async (count) => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  let passed = false;
  try {
    for (let index = 0; index < count; index += 1) {
      const id = (value: number) => `t326-complete-${String(value).padStart(5, '0')}`;
      const prefix = `Body ${index}\n`;
      const content = prefix + 'x'.repeat(8192 - Buffer.byteLength(prefix));
      await fixture.left.invoke('seed', { content, nodeId: id(index), includeWorkspace: false,
        ...(index % 100 === 0 ? {} : { parentNodeId: id(Math.floor(index / 100) * 100) }),
        title: `Complete inventory ${index}` });
    }
    const before = await readFixtureInventory(fixture.left);
    expect(before.filter((entry) => entry.objectType === 'node')).toHaveLength(count);
    await expect(reconnectFixturePeer(fixture.left, fixture.rightSnapshot))
      .resolves.toMatchObject({ complete: true, pending: 0 });
    expect(compareFramedSyncInventories({ local: await readFixtureInventory(fixture.left),
      remote: await readFixtureInventory(fixture.right) })).toEqual([]);
    const source = readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath);
    const received = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
    expect(received.nodes).toEqual(source.nodes);
    expect(received.versions).toEqual(source.versions);
    expect(received.nodes).toHaveLength(count);
    expect(received.nodes.every(node => {
      if (!node || typeof node !== 'object' || !('content' in node)) return false;
      return typeof node.content === 'string' && Buffer.byteLength(node.content) === 8192;
    })).toBe(true);
    expect(source.framedSync.outboundHolds).toBe(0);
    const restarted = await fixture.restartRight();
    expect(restarted.snapshot.pid).not.toBe(fixture.rightSnapshot.pid);
    const reopened = readDesktopFramedSyncLibraryEvidence(restarted.snapshot.databasePath);
    expect(reopened.nodes).toEqual(source.nodes);
    expect(reopened.versions).toEqual(source.versions);
    passed = true;
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    if (passed) await fs.rm(fixture.root, { recursive: true, force: true });
  }
}, 2_700_000);
