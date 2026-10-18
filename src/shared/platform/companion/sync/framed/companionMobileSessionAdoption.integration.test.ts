// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { loadSyncGroupLocalAdoption } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { createJoiningMobile, mobile } from '../../../../../test/companionJoinedMobile.testSupport.js';
import { completeCompanionSyncGroupJoin, requestCompanionSyncGroupJoin } from '../../../companionSyncGroupJoinClient.js';
import { companionDesktopSessionId } from '../../network/companionDesktopSession.js';

let host: Awaited<ReturnType<typeof createJoiningMobile>> | undefined;
afterEach(async () => { await host?.close(); host = undefined; });

it('adopts a real approved mobile member without a notification session and persists the first round', async () => {
  host = await createJoiningMobile();
  await host.provider.send('seed', { id: 'first-mobile-body', content: 'Approved provider content' });
  const args = { databasePath: host.local.database, endpointUrl: host.peer.origin,
    groupId: host.groupId, mode: 'use-group' as const };
  const pending = await requestCompanionSyncGroupJoin(args);
  await host.provider.send('joinAccept', { requestId: pending.request_id });
  expect(companionDesktopSessionId(host.peer.identity)).toBeUndefined();
  const complete = { ...args, providerDeviceId: host.peer.identity, providerDeviceName: 'Provider',
    providerPlatform: process.platform, requestId: pending.request_id };
  await completeCompanionSyncGroupJoin(complete).catch(error => {
    throw new Error(`${error.message}\n${host!.provider.diagnostics()}`);
  });
  expect(await loadSyncGroupLocalAdoption(host.db)).toBeNull();
  expect(mobile.post.mock.calls.length).toBeGreaterThan(0);
  for (const [request] of mobile.post.mock.calls) {
    expect(new URL(request.url).searchParams.has('sync_session_id')).toBe(false);
  }
  expect(mobile.http.mock.calls.some(([request]) => request.url.includes('/sync-session'))).toBe(false);
  host.reopen();
  await completeCompanionSyncGroupJoin(complete);
  expect(host.sqlite.prepare('SELECT content FROM nodes WHERE id=?').pluck().get('first-mobile-body'))
    .toBe('Approved provider content');
  expect(host.sqlite.prepare('SELECT COUNT(*) FROM node_sync_versions WHERE body_text=?').pluck().get('Approved provider content')).toBe(1);
  await host.restartProvider();
  expect((await host.provider.send('snapshot')).library.nodesById['first-mobile-body']?.content)
    .toBe('Approved provider content');
}, 60000);
