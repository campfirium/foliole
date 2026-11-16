// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';

import { afterEach, expect, it, vi } from 'vitest';

import {
  finishRequestSyncPerformance, startRequestSyncPerformance
} from '../../lib/core/sync/requestSyncPerformance.js';
import { loadSyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { approveJoiningMobile, createJoiningMobile, mobile } from '../test/companionJoinedMobile.testSupport.js';

let host: Awaited<ReturnType<typeof createJoiningMobile>> | undefined;
afterEach(async () => {
  finishRequestSyncPerformance('cancelled');
  await host?.close();
  host = undefined;
});

it.each([true, false])('first reception produces the same durable facts with measurement %s', {
  meta: { calibratedMs: 20000 }
}, async enabled => {
  host = await createJoiningMobile();
  await host.provider.send('seed', { id: 'topic', content: 'Measured article' });
  await host.provider.send('seed', { id: 'another', content: 'Second article' });
  await host.provider.send('facts');
  const clock = vi.fn(() => performance.now());
  if (enabled) {
    await host.provider.send('syncPerformanceStart');
    startRequestSyncPerformance(clock);
  }
  await approveJoiningMobile(host);
  const desktop = await host.provider.send('syncPerformanceFinish', { complete: true });
  const receiver = finishRequestSyncPerformance('complete');
  host.reopen();
  expect(await loadSyncGroupLocalAdoption(host.db)).toBeNull();
  expect(await host.db.query("SELECT id FROM nodes WHERE id IN ('topic','another') ORDER BY id"))
    .toEqual([{ id: 'another' }, { id: 'topic' }]);
  expect(await host.db.query("SELECT reps FROM node_review WHERE node_id = 'topic'")).toEqual([{ reps: 1 }]);
  if (!enabled) {
    expect(desktop).toBeNull();
    expect(receiver).toBeUndefined();
    expect(clock).not.toHaveBeenCalled();
    return;
  }
  expect(desktop).toMatchObject({ outcome: 'complete',
    phases: { inventory_prepare: { finished: expect.any(Number) }, object_prepare: { finished: expect.any(Number) } },
    counts: { preparedObjects: expect.any(Number), preparedObjectBytes: expect.any(Number) } });
  expect(receiver).toMatchObject({ outcome: 'complete',
    phases: { receive_apply: { finished: expect.any(Number) }, review_projection: { finished: expect.any(Number) },
      receive_http_inclusive: { finished: expect.any(Number) } } });
  expect(receiver!.counts.pullAttempts).toBeGreaterThanOrEqual(2);
  expect(receiver!.counts.committedObjects).toBeGreaterThanOrEqual(2);
  expect(receiver!.counts.reviewProjections).toBeGreaterThanOrEqual(1);
  expect(receiver!.counts.receivedWireBytes).toBeGreaterThan(0);
  const report = { runId: randomUUID(), desktop, receiver, unavailable: ['android_bridge', 'application_replay_detail', 'attachment_processing'] };
  expect(JSON.stringify(report)).not.toMatch(/Measured article|Second article|https?:\/\//u);
  if (process.env.FOLIOLE_SYNC_PERFORMANCE_REPORT === '1') {
    const root = '.tmp/artifacts/T742-12';
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(`${root}/local-${report.runId}.json`, JSON.stringify(report, null, 2) + '\n');
  }
});

it('closes a failed window and keeps its work out of the retry report', {
  meta: { calibratedMs: 20000 }
}, async () => {
  host = await createJoiningMobile();
  await host.provider.send('seed', { id: 'topic', content: 'Retry article' });
  const send = mobile.post.getMockImplementation()!;
  mobile.post.mockImplementation(async request => {
    const response = await send(request);
    if (new URL(request.url).searchParams.get('request') === 'pulls') throw new Error('fixture_reply_lost');
    return response;
  });
  startRequestSyncPerformance();
  await expect(approveJoiningMobile(host)).rejects.toThrow('fixture_reply_lost');
  const failed = finishRequestSyncPerformance('failed');
  expect(failed).toMatchObject({ outcome: 'failed', counts: { committedObjects: 0 } });
  expect(failed!.counts.pullAttempts).toBeGreaterThan(0);
  expect(await loadSyncGroupLocalAdoption(host.db)).not.toBeNull();
  mobile.post.mockImplementation(send);
  startRequestSyncPerformance();
  const { runPendingCompanionSyncGroupAdoption } = await import('../shared/platform/companion/sync/companionSyncGroupAdoptionRun');
  await expect(runPendingCompanionSyncGroupAdoption()).resolves.toBe(true);
  const retried = finishRequestSyncPerformance('complete');
  expect(retried!.counts.committedObjects).toBeGreaterThan(0);
  expect(retried!.counts.repeatedPulls).toBe(0);
  expect(await loadSyncGroupLocalAdoption(host.db)).toBeNull();
});
