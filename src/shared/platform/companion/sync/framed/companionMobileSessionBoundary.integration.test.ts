// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { syncSessionReplySchema } from '../../../../../../lib/platform/syncSessionContract.js';
import { approveJoiningMobile, createJoiningMobile, mobile, syncJoinedMobile } from '../../../../../test/companionJoinedMobile.testSupport.js';
import { requestCompanionSyncSession } from '../../network/companionSyncSessionHttp.js';
import { saveIosSetting } from '../../runtime/iosCompanionActiveDatabaseWrites.js';

let host: Awaited<ReturnType<typeof createJoiningMobile>> | undefined;
afterEach(async () => { await host?.close(); host = undefined; });

it('rejects empty, forged, closed and replaced IDs instead of retrying without a session', async () => {
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
    const before = host.provider.diagnostics().length;
    mobile.post.mockImplementation(async input => {
      const url = new URL(input.url);
      url.searchParams.set('sync_session_id', id);
      const signature = await mobile.sign({ sync_group_id: host!.groupId, method: 'POST',
        path_with_query: `${url.pathname}${url.search}`, body_hash: input.headers['x-foliole-body-sha256'] });
      return post({ ...input, url: url.toString(), headers: { ...input.headers, ...signature.headers } });
    });
    await expect(syncJoinedMobile(host)).rejects.toThrow('request_sync_http_500');
    expect(host.provider.diagnostics().slice(before)).toContain('sync_session_expired');
    const provider = new Database(host.peer.database, { readonly: true });
    try { expect(provider.prepare('SELECT value_json FROM setting_records WHERE key=?').get('readwise_source_cutover_v2')).toBeUndefined(); }
    finally { provider.close(); }
  }
  mobile.post.mockImplementation(post);
  await expect(syncJoinedMobile(host)).resolves.toMatchObject({ remainingStructureChangeCount: 0 });
  await requestCompanionSyncSession(endpoint, { operation: 'close', session: valid.session });
}, 60000);

it('notifies an existing session of production writes from a sessionless round without completing it', async () => {
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
}, 60000);
