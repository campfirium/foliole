// @vitest-environment node
import { promises as fs } from 'node:fs';

import { expect, it } from 'vitest';

import type { NativeReadingResumeContext } from '../../lib/platform/nativeReadingProgressContract.js';

import { reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import {
  createDesktopFramedSyncTwoProcessFixture,
  type DesktopFramedSyncFixtureProcess
} from './desktopFramedSyncTwoProcess.testSupport.js';

const nodeId = 'reading-resume-topic';

async function open(peer: DesktopFramedSyncFixtureProcess) {
  const resume = await peer.invoke('load_reading_resume', { nodeId }) as NativeReadingResumeContext | null;
  if (!resume) throw new Error('reading resume document unavailable');
  return resume;
}

async function save(peer: DesktopFramedSyncFixtureProcess, readingResume: NativeReadingResumeContext, offset: number) {
  await peer.invoke('save_reading_progress', { activeNodeId: nodeId, readingResume, updatedAt: new Date().toISOString(),
    nodeViewStates: [{ nodeId, scrollTop: offset * 2, readingOffset: offset, selectionFrom: null, selectionTo: null }] });
}

it.each(['left', 'right'] as const)('syncs reading positions with %s initiating the fork round',
  { meta: { calibratedMs: 60_000 } }, async (initiator) => {
    const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
    try {
      await fixture.left.seed({ content: 'This article contains readable text.\n'.repeat(200), nodeId, title: 'Long article' });
      await save(fixture.left, await open(fixture.left), 1000);
      expect(await reconnectFixturePeer(fixture.left, fixture.rightSnapshot)).toMatchObject({ complete: true });
      const a = await open(fixture.left);
      const b = await open(fixture.right);
      expect([a.offset, b.offset]).toEqual([1000, 1000]);

      await save(fixture.left, a, 6000);
      await save(fixture.right, b, 4500);
      const peer = initiator === 'left' ? fixture.rightSnapshot : fixture.leftSnapshot;
      for (let replay = 0; replay < 2; replay++) {
        expect(await reconnectFixturePeer(fixture[initiator], peer)).toMatchObject({ complete: true });
        expect([(await open(fixture.left)).offset, (await open(fixture.right)).offset]).toEqual([6000, 6000]);
      }

      await save(fixture.left, await open(fixture.left), 3000);
      expect(await reconnectFixturePeer(fixture.right, fixture.leftSnapshot)).toMatchObject({ complete: true });
      const [left, right] = await Promise.all([fixture.restartLeft(), fixture.restartRight()]);
      expect([(await open(left.process)).offset, (await open(right.process)).offset]).toEqual([3000, 3000]);
    } finally {
      await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
      await fs.rm(fixture.root, { force: true, recursive: true });
    }
  });

it('keeps the other device branch when a third device advances from only the farther branch',
  { meta: { calibratedMs: 60_000 } }, async () => {
    const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
    const third = await fixture.startThird();
    try {
      await fixture.left.seed({ content: 'This article contains readable text.\n'.repeat(200), nodeId, title: 'Long article' });
      await save(fixture.left, await open(fixture.left), 1000);
      await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
      const b = await open(fixture.right);

      await save(fixture.left, await open(fixture.left), 6000);
      await reconnectFixturePeer(fixture.left, third.snapshot);
      const c = await open(third.process);
      expect(c.offset).toBe(6000);

      await save(fixture.right, b, 4500);
      await reconnectFixturePeer(fixture.right, fixture.leftSnapshot);
      expect((await open(fixture.left)).offset).toBe(6000);

      await save(third.process, c, 3000);
      await reconnectFixturePeer(third.process, fixture.leftSnapshot);
      await reconnectFixturePeer(fixture.right, fixture.leftSnapshot);
      expect(await Promise.all([fixture.left, fixture.right, third.process].map(async peer => (await open(peer)).offset)))
        .toEqual([4500, 4500, 4500]);
    } finally {
      await Promise.allSettled([fixture.left.close(), fixture.right.close(), third.process.close()]);
      await fs.rm(fixture.root, { force: true, recursive: true });
    }
  });
