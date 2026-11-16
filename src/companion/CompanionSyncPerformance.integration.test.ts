// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';

import { App } from '@capacitor/app';
import { afterEach, expect, it, vi } from 'vitest';

import {
  finishRequestSyncPerformance, startRequestSyncPerformance
} from '../../lib/core/sync/requestSyncPerformance.js';
import { loadSyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { approveJoiningMobile, createJoiningMobile, mobile } from '../test/companionJoinedMobile.testSupport.js';

vi.mock('@capacitor/app', async original => ({
  ...await original<typeof import('@capacitor/app')>(),
  App: { getInfo: vi.fn() }
}));

type PerformanceSummary = NonNullable<ReturnType<typeof finishRequestSyncPerformance>>;
function readPerformanceReports(log: string) {
  return log.split('\n').flatMap(line => line.startsWith('[sync-performance] {')
    ? [JSON.parse(line.slice('[sync-performance] '.length)) as PerformanceSummary & { label: string }] : []);
}

let host: Awaited<ReturnType<typeof createJoiningMobile>> | undefined;
afterEach(async () => {
  finishRequestSyncPerformance('cancelled');
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await host?.close();
  host = undefined;
});

it.each([true, false])('first reception produces the same durable facts with measurement %s', {
  meta: { calibratedMs: 20000 }
}, async enabled => {
  const label = enabled ? 'T742-test' : '';
  vi.stubEnv('FOLIOLE_SYNC_PERFORMANCE_LABEL', label);
  vi.stubEnv('FOLIOLE_ALLOW_PARALLEL_INSTANCE', '1');
  vi.stubEnv('VITE_FOLIOLE_ADOPTION_PERFORMANCE_LABEL', label);
  vi.mocked(App.getInfo).mockResolvedValue({ id: 'com.campfirium.foliole.android.acceptance',
    name: 'Foliole Acceptance', version: '1', build: '1' });
  const logs = vi.spyOn(console, 'info').mockImplementation(() => {});
  host = await createJoiningMobile();
  await host.provider.send('seed', { id: 'topic', content: 'Measured article' });
  await host.provider.send('seed', { id: 'another', content: 'Second article' });
  await host.provider.send('seed', { id: 'delete-me', content: 'Permanently removed article' });
  await host.provider.send('delete', { permanently: true });
  await host.provider.send('facts');
  await approveJoiningMobile(host);
  const desktop = readPerformanceReports(host.provider.diagnostics())[0];
  const receiver = readPerformanceReports(logs.mock.calls.map(args => args.join(' ')).join('\n'))[0];
  host.reopen();
  expect(await loadSyncGroupLocalAdoption(host.db)).toBeNull();
  expect(await host.db.query("SELECT id FROM nodes WHERE id IN ('topic','another') ORDER BY id"))
    .toEqual([{ id: 'another' }, { id: 'topic' }]);
  expect(await host.db.query("SELECT reps FROM node_review WHERE node_id = 'topic'")).toEqual([{ reps: 1 }]);
  expect(await host.db.query("SELECT id FROM nodes WHERE id = 'delete-me'")).toEqual([]);
  if (!enabled) {
    expect(desktop).toBeUndefined();
    expect(receiver).toBeUndefined();
    expect(App.getInfo).not.toHaveBeenCalled();
    return;
  }
  // The adoption path does not send a database-confirmed peer-round receipt.
  expect(desktop).toMatchObject({ label, outcome: 'partial',
    phases: { inventory_prepare: { finished: expect.any(Number) }, object_prepare: { finished: expect.any(Number) } },
    counts: { preparedObjects: expect.any(Number), preparedObjectBytes: expect.any(Number) } });
  // The native file stub rejects attachment inspection after the durable database adoption.
  expect(receiver).toMatchObject({ label, outcome: 'failed',
    phases: { receive_apply: { finished: expect.any(Number) }, review_projection: { finished: expect.any(Number) },
      receive_http_inclusive: { finished: expect.any(Number) },
      attachment_stage_inclusive: { finished: 1 } } });
  expect(receiver!.counts.pullAttempts).toBeGreaterThanOrEqual(2);
  expect(receiver!.counts.committedObjects).toBeGreaterThanOrEqual(2);
  expect(receiver!.counts.reviewProjections).toBeGreaterThanOrEqual(1);
  expect(receiver!.counts.receivedWireBytes).toBeGreaterThan(0);
  expect(receiver!.receiveStages.adoption.decodedTombstones).toBe(1);
  expect(receiver!.receiveStages.adoption.pullBatches).toBeGreaterThan(0);
  expect(receiver!.receiveStages.adoption.nodeAttempts).toBeGreaterThanOrEqual(2);
  const { adoption_committed, adoption_followup_finished, attachment_stage_entered, first_attachment_dispatched } =
    receiver!.milestonesMs;
  const milestones = [adoption_committed, adoption_followup_finished, attachment_stage_entered, first_attachment_dispatched];
  expect(milestones).toEqual([expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number)]);
  expect(milestones).toEqual([...milestones].sort((left, right) => left! - right!));
  const report = { runId: randomUUID(), desktop, receiver, unavailable: ['android_bridge', 'application_replay_detail'] };
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
  expect(failed).toMatchObject({ outcome: 'failed', counts: { committedObjects: 0 }, milestonesMs: {} });
  expect(failed!.milestonesMs).toEqual({});
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
