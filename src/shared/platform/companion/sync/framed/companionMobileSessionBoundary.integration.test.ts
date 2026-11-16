// @vitest-environment node
import { setTimeout as delay } from 'node:timers/promises';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import type { NativeRequestSyncHttpRequest } from '../../../../../../lib/platform/nativeRequestSyncHttpContract.js';
import { syncSessionReplySchema } from '../../../../../../lib/platform/syncSessionContract.js';
import { approveJoiningMobile, createJoiningMobile, mobile, syncJoinedMobile } from '../../../../../test/companionJoinedMobile.testSupport.js';
import { requestCompanionSyncSession } from '../../network/companionSyncSessionHttp.js';
import { saveIosSetting } from '../../runtime/iosCompanionActiveDatabaseWrites.js';

let host: Awaited<ReturnType<typeof createJoiningMobile>> | undefined;
afterEach(async () => { await host?.close(); host = undefined; });

it('rejects empty, forged, closed and replaced IDs instead of retrying without a session', { meta: { calibratedMs: 60000 } }, async () => {
  host = await createJoiningMobile();
  await approveJoiningMobile(host);
  const endpoint = host.peer.origin;
  const closed = syncSessionReplySchema.parse(await requestCompanionSyncSession(endpoint, { operation: 'open' }));
  await requestCompanionSyncSession(endpoint, { operation: 'close', session: closed.session });
  const replaced = syncSessionReplySchema.parse(await requestCompanionSyncSession(endpoint, { operation: 'open' }));
  const valid = syncSessionReplySchema.parse(await requestCompanionSyncSession(endpoint, { operation: 'open' }));
  const post = mobile.post.getMockImplementation()!;
  await saveIosSetting({ key: 'readwise_source_cutover_v2', scope: 'user_space', value_json: '"pending"' });
  for (const id of ['', 'forged', closed.session, replaced.session]) {
    mobile.post.mockImplementation(async input => post(await bindSession(input, id)));
    await expect(syncJoinedMobile(host)).rejects.toThrow('request_sync_http_409:{"error":"sync_session_expired"}');
    const provider = new Database(host.peer.database, { readonly: true });
    try { expect(provider.prepare('SELECT value_json FROM setting_records WHERE key=?').get('readwise_source_cutover_v2')).toBeUndefined(); }
    finally { provider.close(); }
  }
  mobile.post.mockImplementation(async input => {
    const request = await bindSession(input, replaced.session);
    const headers = new Headers(request.headers);
    headers.set('x-signature', '0'.repeat(64));
    return post({ ...request, headers: Object.fromEntries(headers.entries()) });
  });
  await expect(syncJoinedMobile(host)).rejects.toThrow('request_sync_http_401');
  mobile.post.mockImplementation(async input => post(await bindSession(input, valid.session)));
  await expect(syncJoinedMobile(host)).resolves.toMatchObject({ remainingStructureChangeCount: 0 });
  await requestCompanionSyncSession(endpoint, { operation: 'close', session: valid.session });
});

it('notifies an existing session of production writes from a sessionless round without completing it', { meta: { calibratedMs: 60000 } }, async () => {
  host = await createJoiningMobile();
  await approveJoiningMobile(host);
  const opened = syncSessionReplySchema.parse(await requestCompanionSyncSession(host.peer.origin, { operation: 'open' }));
  await saveIosSetting({ key: 'readwise_source_cutover_v2', scope: 'user_space', value_json: '"saved"' });
  mobile.http.mockClear();
  mobile.post.mockClear();
  await expect(syncJoinedMobile(host)).resolves.toMatchObject({ remainingStructureChangeCount: 0 });
  const changed = syncSessionReplySchema.parse(await requestCompanionSyncSession(host.peer.origin, {
    operation: 'wait', session: opened.session, marker: opened.marker
  }));
  expect(changed.changed).toBe(true);
  expect(changed.marker.sequence).toBeGreaterThan(opened.marker.sequence);
  for (const [request] of mobile.post.mock.calls) expect(new URL(request.url).searchParams.has('sync_session_id')).toBe(false);
  expect(mobile.http.mock.calls.some(([request]) => new URL(request.url).searchParams.get('input')?.includes('complete'))).toBe(false);
  await requestCompanionSyncSession(host.peer.origin, { operation: 'close', session: opened.session });
  host.reopen();
  await host.restartProvider();
  const provider = new Database(host.peer.database, { readonly: true });
  try {
    for (const db of [host.sqlite, provider]) {
      expect(db.prepare('SELECT value_json FROM setting_records WHERE key=?').pluck().get('readwise_source_cutover_v2')).toBe('"saved"');
    }
  } finally { provider.close(); }
});

async function bindSession(input: NativeRequestSyncHttpRequest, id: string) {
  const url = new URL(input.url);
  url.searchParams.set('sync_session_id', id);
  const signature = await mobile.sign({ sync_group_id: host!.groupId, method: 'POST',
    path_with_query: `${url.pathname}${url.search}`, body_hash: input.headers['x-foliole-body-sha256'] });
  return { ...input, url: url.toString(), headers: { ...input.headers, ...signature.headers } };
}

it('distinguishes idle expiry from an active session over signed HTTP', { timeout: 85_000, meta: { calibratedMs: 85_000 } }, async () => {
  host = await createJoiningMobile();
  await approveJoiningMobile(host);
  const endpoint = host.peer.origin;
  const opened = syncSessionReplySchema.parse(await requestCompanionSyncSession(endpoint, { operation: 'open' }));
  const post = mobile.post.getMockImplementation()!;
  mobile.post.mockImplementation(async input => post(await bindSession(input, opened.session)));
  await expect(syncJoinedMobile(host)).resolves.toMatchObject({ remainingStructureChangeCount: 0 });
  await delay(60_100);
  await expect(syncJoinedMobile(host)).rejects.toThrow('request_sync_http_409:{"error":"sync_session_expired"}');
});
