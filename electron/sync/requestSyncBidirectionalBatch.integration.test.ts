// @vitest-environment node
import { promises as fs } from 'node:fs';

import { expect, it } from 'vitest';
import { z } from 'zod';

import { compareFramedSyncInventories } from '../../lib/core/sync/framedSyncInventory.js';

import { readFixtureInventory, reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';
import { readDesktopFramedSyncLibraryEvidence } from './desktopFramedSyncTwoProcessEvidence.js';

it.each([32, 80])('batches %i concurrent edits in both directions and preserves persisted version identities', async count => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  let passed = false;
  try {
    await fixture.left.invoke('seed_complete_inventory', { count });
    await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
    const initial = readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath);
    const nodes = z.array(z.object({ id: z.string(), current_version_id: z.string() })).parse(initial.nodes);
    const versions: string[] = [];
    for (const [side, process] of [['left', fixture.left], ['right', fixture.right]] as const) {
      for (const node of nodes) {
        const versionId = `${side}-${node.id}`;
        versions.push(versionId);
        await process.invoke('local_content_edit', { nodeId: node.id, baseVersionId: node.current_version_id,
          versionId, content: `${side} complete body ${node.id}`, hostName: side,
          updatedAt: '2026-10-15T00:00:00.000Z' });
      }
    }
    const before = z.record(z.string(), z.number()).parse(await fixture.right.invoke('request_counts'));
    await expect(reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).resolves.toMatchObject({ complete: true });
    const after = z.record(z.string(), z.number()).parse(await fixture.right.invoke('request_counts'));
    const requests = (after.objects ?? 0) + (after.pulls ?? 0) - (before.objects ?? 0) - (before.pulls ?? 0);
    expect(compareFramedSyncInventories({ local: await readFixtureInventory(fixture.left),
      remote: await readFixtureInventory(fixture.right) })).toEqual([]);
    const left = readDesktopFramedSyncLibraryEvidence(fixture.leftSnapshot.databasePath);
    const right = readDesktopFramedSyncLibraryEvidence(fixture.rightSnapshot.databasePath);
    expect(right.nodes).toEqual(left.nodes);
    expect(right.versions).toEqual(left.versions);
    const retained = z.array(z.object({ version_id: z.string() })).parse(right.versions).map(row => row.version_id);
    expect(retained).toEqual(expect.arrayContaining(versions));
    expect(requests).toBeLessThanOrEqual(24);
    passed = true;
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    if (passed) await fs.rm(fixture.root, { recursive: true, force: true });
  }
}, 120_000);
