import type http from 'node:http';
import { Readable } from 'node:stream';

import { expect, it, vi } from 'vitest';

const owner = vi.hoisted(() => ({ run: vi.fn() }));
const auth = vi.hoisted(() => ({ authenticate: vi.fn(), revalidate: vi.fn() }));
const stop = vi.hoisted(() => ({ handle: vi.fn() }));

vi.mock('../database/connection.js', () => ({ runWithDatabaseConnectionOwner: owner.run }));
vi.mock('../import/keepImportMonitor.js', () => ({ refreshKeepImportMonitorFromSettings: vi.fn() }));
vi.mock('./companionLanSyncObjects.js', () => ({ isRetiredSyncJsonEndpoint: () => false }));
vi.mock('./companionRequestAuth.js', () => ({
  authenticateCompanionRequestContext: auth.authenticate,
  revalidateCompanionRequestAuthorization: auth.revalidate
}));
vi.mock('./desktopCompanionSyncParticipation.js', () => ({}));
vi.mock('./desktopSyncGroupMemberState.js', () => ({
  acceptDesktopSyncGroupMemberState: vi.fn(),
  SYNC_GROUP_MEMBER_STATE_PATH: '/sync-group/member-state'
}));
vi.mock('./desktopSyncGroupOverviewNotifier.js', () => ({ notifyDesktopSyncGroupOverviewChanged: vi.fn() }));
vi.mock('./readwiseGroupSetup.js', () => ({
  handleReadwiseGroupSetup: vi.fn(), READWISE_GROUP_SETUP_PATH: '/companion/readwise-group-setup'
}));
vi.mock('./readwiseOwnerStop.js', () => ({
  handleReadwiseOwnerStop: stop.handle, READWISE_OWNER_STOP_PATH: '/companion/readwise-owner-stop'
}));
vi.mock('./workgroupHttpCrypto.js', () => ({
  decryptWorkgroupRequestBodyWithCredential: (_request: unknown, body: string) => Buffer.from(body)
}));

import { handleAuthenticatedPost } from './companionLanAuthenticatedPost.js';

it('queues key and nonce authentication instead of misreporting contention as unauthorized', async () => {
  let release!: () => void;
  owner.run.mockImplementationOnce(async (execute: () => unknown) => {
    await new Promise<void>((resolve) => { release = resolve; });
    return execute();
  }).mockImplementation(async (execute: () => unknown) => execute());
  const authenticated = { device_id: 'candidate', device_name: 'Candidate', ok: true } as const;
  auth.authenticate.mockReturnValue({ auth: authenticated, allowUnknownDevice: false,
    groupId: 'group', requireMemberState: true, workgroup: { group_key: 'key', group_tag: 'tag' } });
  auth.revalidate.mockReturnValue(authenticated);
  stop.handle.mockReturnValue({ status: 'stopped', requestId: 'queued' });
  const request = Readable.from(['{"requestId":"queued"}']) as http.IncomingMessage;
  request.headers = {}; request.method = 'POST'; request.url = '/companion/readwise-owner-stop';
  const response = { end: vi.fn(), writeHead: vi.fn() } as unknown as http.ServerResponse;
  const writeJson = vi.fn();

  const handled = handleAuthenticatedPost(
    request, response, new URL(request.url, 'http://127.0.0.1'), writeJson);
  await vi.waitFor(() => expect(owner.run).toHaveBeenCalledTimes(1));
  expect(auth.authenticate).not.toHaveBeenCalled();
  expect(writeJson).not.toHaveBeenCalledWith(request, response, 401, expect.anything(), expect.anything());
  release();
  await handled;

  expect(auth.authenticate).toHaveBeenCalledTimes(1);
  expect(stop.handle).toHaveBeenCalledTimes(1);
});
