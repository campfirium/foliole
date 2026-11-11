// @vitest-environment node
import { promises as fs } from 'node:fs';

import { expect, it } from 'vitest';

import type { NativeReadingResumeContext } from '../../lib/platform/nativeReadingProgressContract.js';
import { decodePdfReadingPosition } from '../../lib/platform/pdfReadingPosition.js';
import { longTextPdf } from '../database/longTextPdfTestFixture.js';

import { reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture, type DesktopFramedSyncFixtureProcess } from './desktopFramedSyncTwoProcess.testSupport.js';

const nodeId = 'long-original-pdf';

async function load(peer: DesktopFramedSyncFixtureProcess, pdfAttachmentId: string) {
  const context = await peer.invoke('load_reading_resume', { nodeId, pdfAttachmentId }) as NativeReadingResumeContext | null;
  if (!context) throw new Error('PDF reading context unavailable');
  return context;
}

function save(peer: DesktopFramedSyncFixtureProcess, readingResume: NativeReadingResumeContext, page: number, fraction: number) {
  return peer.invoke('save_reading_progress', { activeNodeId: nodeId, readingResume,
    updatedAt: new Date().toISOString(),
    nodeViewStates: [{ nodeId, scrollTop: fraction * 1000, selectionFrom: page, selectionTo: 130 }]
  });
}

it('converges on the farther page and fraction in PDF forks and preserves a subsequent backward jump',
  { meta: { calibratedMs: 60_000 } }, async () => {
    const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
    try {
      const { hash } = await fixture.left.invoke('seed_resource', {
        bytes: new TextEncoder().encode(longTextPdf(40)), nodeId, pdf: true
      }) as { hash: string };
      const read = async (peer: DesktopFramedSyncFixtureProcess) => {
        const { offset } = await load(peer, hash);
        return offset === null ? null : decodePdfReadingPosition(offset);
      };
      const round = async () => {
        expect(await reconnectFixturePeer(fixture.right, fixture.leftSnapshot)).toMatchObject({ complete: true });
      };
      const expectBoth = async (page: number, positionY: number) => {
        expect(await Promise.all([read(fixture.left), read(fixture.right)])).toEqual([
          { page, positionY }, { page, positionY }
        ]);
      };

      await save(fixture.left, await load(fixture.left, hash), 5, 0.1);
      await round();
      await expectBoth(5, 0.1);

      await save(fixture.left, await load(fixture.left, hash), 19, 0.8);
      await save(fixture.right, await load(fixture.right, hash), 19, 0.3);
      await round();
      await expectBoth(19, 0.8);

      await save(fixture.left, await load(fixture.left, hash), 19, 1);
      await save(fixture.right, await load(fixture.right, hash), 20, 0);
      await round();
      await expectBoth(20, 0);

      await save(fixture.right, await load(fixture.right, hash), 8, 0.6);
      await round();
      await round();
      await fixture.restartLeft();
      await expectBoth(8, 0.6);
      expect(await fixture.left.invoke('load_reading_resume', { nodeId })).toMatchObject({ offset: null });
      expect(await fixture.left.invoke('load_reading_resume', { nodeId, pdfAttachmentId: 'f'.repeat(64) })).toBeNull();
    } finally {
      await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
      await fs.rm(fixture.root, { force: true, recursive: true });
    }
  });
