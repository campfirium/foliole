// @vitest-environment node
import { afterEach, expect, it, onTestFailed } from 'vitest';

import { loadSyncGroupLocalAdoption } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { createJoiningMobile, mobile } from '../../../../../test/companionJoinedMobile.testSupport.js';
import { completeCompanionSyncGroupJoin, requestCompanionSyncGroupJoin } from '../../../companionSyncGroupJoinClient.js';
import { companionDesktopSessionId } from '../../network/companionDesktopSession.js';

let host: Awaited<ReturnType<typeof createJoiningMobile>> | undefined;
afterEach(async () => { await host?.close(); host = undefined; });

it.each([1, 3808])('adopts %i approved provider topics without a notification session and persists them', { meta: { calibratedMs: 60000 } }, async (count) => {
  const started = performance.now();
  const stages: Record<string, number> = { creating: 0 };
  let diagnostics = () => '';
  onTestFailed(() => console.error('[mobile-adoption-failure]', {
    count, stages, elapsedMs: performance.now() - started, provider: diagnostics()
  }));
  host = await createJoiningMobile();
  diagnostics = host.provider.diagnostics;
  stages.seeding = performance.now() - started;
  const expected = Array.from({ length: count }, (_, index) => ({
    id: index ? `adoption-body-${index}` : 'first-mobile-body',
    content: index ? `Approved provider content ${index}` : 'Approved provider content'
  })).sort((left, right) => left.id.localeCompare(right.id));
  await host.provider.send('batch', { nodes: expected });
  stages.requesting = performance.now() - started;
  const args = { databasePath: host.local.database, endpointUrl: host.peer.origin,
    groupId: host.groupId, mode: 'use-group' as const };
  const pending = await requestCompanionSyncGroupJoin(args);
  await host.provider.send('joinAccept', { requestId: pending.request_id });
  expect(companionDesktopSessionId(host.peer.identity)).toBeUndefined();
  const complete = { ...args, providerDeviceId: host.peer.identity, providerDeviceName: 'Provider',
    providerPlatform: process.platform, requestId: pending.request_id };
  stages.adopting = performance.now() - started;
  await completeCompanionSyncGroupJoin(complete).catch(error => {
    throw new Error(`${error.message}\n${host!.provider.diagnostics()}`);
  });
  expect(await loadSyncGroupLocalAdoption(host.db)).toBeNull();
  expect(mobile.post.mock.calls.length).toBeGreaterThan(0);
  for (const [request] of mobile.post.mock.calls) {
    expect(new URL(request.url).searchParams.has('sync_session_id')).toBe(false);
  }
  expect(mobile.http.mock.calls.some(([request]) => request.url.includes('/sync-session'))).toBe(false);
  stages.reopening = performance.now() - started;
  host.reopen();
  await completeCompanionSyncGroupJoin(complete);
  expect(host.sqlite.prepare("SELECT id, content FROM nodes WHERE id = 'first-mobile-body' OR id LIKE 'adoption-body-%' ORDER BY id").all())
    .toEqual(expected);
  expect(host.sqlite.prepare('SELECT content FROM nodes WHERE id=?').pluck().get('first-mobile-body'))
    .toBe('Approved provider content');
  expect(host.sqlite.prepare('SELECT COUNT(*) FROM node_sync_versions WHERE body_text=?').pluck().get('Approved provider content')).toBe(1);
  stages.restartingProvider = performance.now() - started;
  await host.restartProvider();
  expect((await host.provider.send('snapshot')).library.nodesById['first-mobile-body']?.content)
    .toBe('Approved provider content');
});
