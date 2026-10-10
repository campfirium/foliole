// @vitest-environment node
import { promises as fs } from 'node:fs';

import { expect, it } from 'vitest';

import { reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture, readDesktopFramedSyncLibraryEvidence }
  from './desktopFramedSyncTwoProcess.testSupport.js';

it('delivers a parent beyond the active batch before its child and preserves both directions after reopen', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  let passed = false;
  try {
    await fixture.left.invoke('seed', { nodeId: 't326-zz-parent', title: 'Parent', content: 'Parent正文', includeWorkspace: false });
    await fixture.left.invoke('seed', { nodeId: 't326-aa-child', parentNodeId: 't326-zz-parent', title: 'Child',
      content: 'Child😀正文', includeWorkspace: false });
    for (let index = 0; index < 130; index += 1) await fixture.left.invoke('seed', {
      nodeId: `t326-middle-${String(index).padStart(3, '0')}`, title: 'Independent', content: `Body ${index}`, includeWorkspace: false
    });
    await fixture.right.invoke('seed', { nodeId: 't326-remote', title: 'Remote', content: 'Reverse正文', includeWorkspace: false });
    await expect(reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).resolves.toMatchObject({ complete: true, pending: 0 });
    const left = readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath);
    const right = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
    expect(left.nodes).toHaveLength(133);
    expect(right.nodes).toEqual(left.nodes);
    expect(right.versions).toEqual(left.versions);
    expect(left.framedSync.outboundHolds).toBe(0);
    const reopened = await fixture.restartRight();
    expect(readDesktopFramedSyncLibraryEvidence(reopened.snapshot.databasePath).nodes).toEqual(left.nodes);
    passed = true;
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    if (passed) await fs.rm(fixture.root, { recursive: true, force: true });
  }
}, 120_000);
