// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchDesktopJson: vi.fn(), join: vi.fn(), leaveGroup: vi.fn(), loadBootstrap: vi.fn(),
  loadGroup: vi.fn(), loadWorkspace: vi.fn(), postMessage: vi.fn(), saveEndpoint: vi.fn(), sign: vi.fn()
}));

vi.mock('../shared/platform/companion/network/signedRequest', () => ({ createSignedRequestHeaders: mocks.sign }));
vi.mock('../shared/platform/companion/sync/syncGroupStore', () => ({
  leaveCompanionSyncGroupDevice: mocks.leaveGroup, loadCompanionSyncGroup: mocks.loadGroup
}));
vi.mock('../shared/platform/companionBootstrap', () => ({ loadCompanionBootstrapState: mocks.loadBootstrap }));
vi.mock('../shared/platform/companionDesktopSyncHttp', () => ({
  DesktopSyncHttpError: class extends Error {
    status: number;
    constructor(_message: string, args: { status: number }) { super(_message); this.status = args.status; }
  },
  fetchDesktopJson: mocks.fetchDesktopJson
}));
vi.mock('../shared/platform/companionWorkspaceSync', () => ({
  loadCompanionWorkspaceSyncState: mocks.loadWorkspace,
  saveCompanionWorkspaceSyncEndpoint: mocks.saveEndpoint
}));
vi.mock('./iosAcceptanceSyncGroup', () => ({ joinIosAcceptanceSyncGroup: mocks.join }));

import { DesktopSyncHttpError } from '../shared/platform/companionDesktopSyncHttp';

import { runIosBridgeAcceptance } from './iosBridgeAcceptance';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_ENDPOINT', 'http://127.0.0.1:43123');
  window.webkit = { messageHandlers: { folioleBridgeAcceptance: { postMessage: mocks.postMessage } } };
  mocks.loadBootstrap.mockResolvedValue({ database_path: '/app/Library/CapacitorDatabase/foliole-companionSQLite.db' });
  mocks.loadGroup.mockResolvedValue(null);
  mocks.leaveGroup.mockResolvedValue(undefined);
  mocks.join.mockResolvedValue({ group_id: 'group-ios-1' });
  mocks.saveEndpoint.mockResolvedValue({ endpoint_url: 'http://127.0.0.1:43123' });
});

it('joins through the active Sync Group APIs, persists the endpoint, and performs a signed request', async () => {
  mocks.sign.mockRejectedValue(new Error('sync_group_not_joined'));
  mocks.fetchDesktopJson.mockResolvedValue({ ok: true });
  await runIosBridgeAcceptance();
  expect(mocks.join).toHaveBeenCalledWith(
    'http://127.0.0.1:43123', '/app/Library/CapacitorDatabase/foliole-companionSQLite.db'
  );
  expect(mocks.postMessage).toHaveBeenCalledWith(expect.objectContaining({
    group_id: 'group-ios-1', phase: 'join-observed', status: 'passed'
  }));
});

it('restores the Sync Group, propagates HTTP status, and leaves cleanly', async () => {
  mocks.loadGroup.mockResolvedValueOnce({ group_id: 'group-ios-1' }).mockResolvedValueOnce(null);
  mocks.loadWorkspace.mockResolvedValueOnce({ endpoint_url: 'http://127.0.0.1:43123' })
    .mockResolvedValueOnce({ endpoint_url: null });
  mocks.fetchDesktopJson.mockImplementation(async (_endpoint: string, path: string) => {
    if (path === '/acceptance/signed') return { ok: true };
    throw new DesktopSyncHttpError('expected', {
      body: 'expected', path, status: path.endsWith('redirect') ? 302 : 503
    });
  });
  mocks.sign.mockRejectedValue(new Error('sync_group_not_joined'));
  await runIosBridgeAcceptance();
  expect(mocks.leaveGroup).toHaveBeenCalledOnce();
  expect(mocks.postMessage).toHaveBeenCalledWith(expect.objectContaining({
    endpoint_cleared: true, phase: 'disconnected', redirect_rejected: true,
    signing_rejected_after_disconnect: true, sync_group_left: true
  }));
});

it('posts a structured bridge rejection and reports cleanup', async () => {
  mocks.loadBootstrap.mockRejectedValue(new Error('native bootstrap rejected'));
  await runIosBridgeAcceptance();
  expect(mocks.postMessage).toHaveBeenCalledWith(expect.objectContaining({
    error: 'native bootstrap rejected', phase: 'failed', sync_group_cleanup_succeeded: true
  }));
});

it('cleans the group and endpoint after an initial join failure', async () => {
  mocks.sign.mockRejectedValue(new Error('sync_group_not_joined'));
  mocks.join.mockRejectedValue(new Error('join completion failed'));
  await runIosBridgeAcceptance();
  expect(mocks.leaveGroup).toHaveBeenCalledTimes(2);
  expect(mocks.saveEndpoint).toHaveBeenCalledTimes(2);
  expect(mocks.postMessage).toHaveBeenCalledWith(expect.objectContaining({ phase: 'failed', status: 'failed' }));
});
