// @vitest-environment node
import { expect, it } from 'vitest';

import { readDesktopFramedSyncLibraryEvidence } from '../../electron/sync/desktopFramedSyncTwoProcess.testSupport.js';
import { describeCompanionSyncPassResult } from '../companion/companionSyncPassResult';

import { createCompanionRequestFixture, native } from './companionRequestSync.testSupport';

it('offers attachments a bounded slice after exhausting the data passes', { meta: { calibratedMs: 60_000 } }, async () => {
  const host = await createCompanionRequestFixture();
  try {
    const nodeId = 't326-pending-data-before-attachments';
    await host.fixture.right.seed({ nodeId, title: 'Pending', content: 'Revision 0' });
    let revision = 0;
    let attachmentRequests = 0;
    native.post.mockImplementation(async input => {
      const request = new URL(input.url).searchParams.get('request');
      if (request === 'attachments') attachmentRequests++;
      const response = await host.post(input);
      if (request === 'pulls' && revision < 4) {
        revision++;
        await host.fixture.right.seed({ nodeId, title: 'Pending', content: `Revision ${revision}` });
      }
      return response;
    });
    const pending = await host.sync();
    expect(revision).toBe(4);
    expect(pending.remainingStructureChangeCount).toBeGreaterThan(0);
    expect(attachmentRequests).toBeGreaterThan(0);
    expect(pending.databaseConfirmedAt).toBeUndefined();
    native.post.mockImplementation(host.post);
    expect((await host.sync()).remainingStructureChangeCount).toBe(0);
    await host.restart();
    for (const snapshot of [host.fixture.leftSnapshot, host.fixture.rightSnapshot]) {
      expect(readDesktopFramedSyncLibraryEvidence(snapshot.databasePath).nodes)
        .toContainEqual(expect.objectContaining({ id: nodeId, content: 'Revision 4' }));
    }
  } finally { await host.close(); }
});

it('keeps committed text successful when attachment HTTP fails and resumes without new document versions', { meta: { calibratedMs: 60_000 } }, async () => {
  const host = await createCompanionRequestFixture();
  try {
    await host.fixture.left.seed({ nodeId: 't326-stage-mobile', title: 'Mobile', content: 'Mobile text' });
    await host.fixture.right.seed({ nodeId: 't326-stage-desktop', title: 'Desktop', content: 'Desktop text' });
    native.post.mockImplementation(input => {
      if (new URL(input.url).searchParams.get('request') === 'attachments') throw new Error('attachment_http_unavailable');
      return host.post(input);
    });
    const result = await host.sync();
    expect(result.databaseConfirmedAt).toEqual(expect.any(String));
    expect(result.attachmentResourceError).toBe('attachment_http_unavailable');
    expect(describeCompanionSyncPassResult(result)).toMatchObject({ outcome: 'skipped', result: 'partial',
      message: 'Text and state synced; attachments need another attempt.' });
    for (const snapshot of [host.fixture.leftSnapshot, host.fixture.rightSnapshot]) {
      expect(readDesktopFramedSyncLibraryEvidence(snapshot.databasePath).nodes).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 't326-stage-mobile', content: 'Mobile text' }),
        expect.objectContaining({ id: 't326-stage-desktop', content: 'Desktop text' })
      ]));
    }
    const versions = host.sqlite.prepare('SELECT COUNT(*) FROM node_sync_versions').pluck().get();
    native.post.mockImplementation(host.post);
    const retried = await host.sync();
    expect(describeCompanionSyncPassResult(retried).outcome).toBe('completed');
    expect(host.sqlite.prepare('SELECT COUNT(*) FROM node_sync_versions').pluck().get()).toBe(versions);
  } finally { await host.close(); }
});
