// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clearPairing: vi.fn(),
  fetchDesktopJson: vi.fn(),
  loadBootstrap: vi.fn(),
  loadPairing: vi.fn(),
  loadWorkspace: vi.fn(),
  pair: vi.fn(),
  postMessage: vi.fn(),
  requestPairing: vi.fn(),
  saveEndpoint: vi.fn(),
  sign: vi.fn()
}));

vi.mock('../shared/platform/companionBootstrap', () => ({ loadCompanionBootstrapState: mocks.loadBootstrap }));
vi.mock('../shared/platform/companionDesktopSyncHttp', () => ({
  DesktopSyncHttpError: class extends Error {
    status: number;
    constructor(_message: string, args: { status: number }) { super(_message); this.status = args.status; }
  },
  fetchDesktopJson: mocks.fetchDesktopJson
}));
vi.mock('../shared/platform/companionWorkspacePairing', () => ({
  clearCompanionPairingCredentials: mocks.clearPairing,
  createSignedRequestHeaders: mocks.sign,
  loadCompanionPairingState: mocks.loadPairing,
  pairCompanionWithDesktop: mocks.pair,
  requestCompanionPairing: mocks.requestPairing
}));
vi.mock('../shared/platform/companionWorkspaceSync', () => ({
  loadCompanionWorkspaceSyncState: mocks.loadWorkspace,
  saveCompanionWorkspaceSyncEndpoint: mocks.saveEndpoint
}));

import { DesktopSyncHttpError } from '../shared/platform/companionDesktopSyncHttp';

import { runIosBridgeAcceptance } from './iosBridgeAcceptance';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_FOLIOLE_IOS_BRIDGE_ACCEPTANCE_ENDPOINT', 'http://127.0.0.1:43123');
  window.webkit = { messageHandlers: { folioleBridgeAcceptance: { postMessage: mocks.postMessage } } };
  mocks.loadBootstrap.mockResolvedValue({
    database_path: '/app/Library/CapacitorDatabase/foliole-companionSQLite.db',
    host_name: 'Acceptance iPhone'
  });
  mocks.clearPairing.mockResolvedValue({ is_paired: false });
  mocks.saveEndpoint.mockResolvedValue({ endpoint_url: 'http://127.0.0.1:43123' });
});

it('pairs through existing APIs, persists the endpoint, and performs a signed request', async () => {
  mocks.loadPairing.mockResolvedValue({ is_paired: false });
  mocks.sign.mockRejectedValue(new Error('not paired'));
  mocks.requestPairing.mockResolvedValue({ pair_request_id: 'pair-1' });
  mocks.pair.mockResolvedValue({ authorization_id: 'authorization-ios-1', is_paired: true });
  mocks.fetchDesktopJson.mockResolvedValue({ ok: true });

  await runIosBridgeAcceptance();

  expect(mocks.requestPairing).toHaveBeenCalledWith(expect.objectContaining({
    hostName: 'Acceptance iPhone', hostPlatform: 'ios-capacitor'
  }));
  expect(mocks.pair).toHaveBeenCalledWith(expect.objectContaining({ pairRequestId: 'pair-1' }));
  expect(mocks.postMessage).toHaveBeenCalledWith(expect.objectContaining({
    database_path: '/app/Library/CapacitorDatabase/foliole-companionSQLite.db',
    phase: 'paired', status: 'passed'
  }));
});

it('restores pairing, propagates redirect/error status, and clears signing ability', async () => {
  mocks.loadPairing
    .mockResolvedValueOnce({ authorization_id: 'authorization-ios-1', is_paired: true })
    .mockResolvedValueOnce({ authorization_id: null, is_paired: false });
  mocks.loadWorkspace
    .mockResolvedValueOnce({ endpoint_url: 'http://127.0.0.1:43123' })
    .mockResolvedValueOnce({ endpoint_url: null });
  mocks.fetchDesktopJson.mockImplementation(async (_endpoint: string, path: string) => {
    if (path === '/acceptance/signed') return { ok: true };
    throw new DesktopSyncHttpError('expected', { body: '', path, status: path.endsWith('redirect') ? 302 : 503 });
  });
  mocks.sign.mockRejectedValue(new Error('pairing must be repaired'));

  await runIosBridgeAcceptance();

  expect(mocks.clearPairing).toHaveBeenCalledOnce();
  expect(mocks.saveEndpoint).toHaveBeenCalledWith('');
  expect(mocks.postMessage).toHaveBeenCalledWith(expect.objectContaining({
    endpoint_cleared: true,
    phase: 'disconnected',
    redirect_rejected: true,
    signing_rejected_after_disconnect: true
  }));
});

it('posts a structured bridge rejection', async () => {
  mocks.loadBootstrap.mockRejectedValue(new Error('native bootstrap rejected'));
  await runIosBridgeAcceptance();
  expect(mocks.postMessage).toHaveBeenCalledWith(expect.objectContaining({
    error: 'native bootstrap rejected', phase: 'failed', status: 'failed'
  }));
});

it('best-effort clears pairing and endpoint after an initial pairing failure', async () => {
  mocks.loadPairing.mockResolvedValue({ is_paired: false });
  mocks.sign.mockRejectedValue(new Error('not paired'));
  mocks.requestPairing.mockResolvedValue({ pair_request_id: 'pair-1' });
  mocks.pair.mockRejectedValue(new Error('pair completion failed'));

  await runIosBridgeAcceptance();

  expect(mocks.clearPairing).toHaveBeenCalledTimes(2);
  expect(mocks.saveEndpoint).toHaveBeenCalledTimes(2);
  expect(mocks.postMessage).toHaveBeenCalledWith(expect.objectContaining({
    endpoint_cleanup_succeeded: true,
    pairing_cleanup_succeeded: true,
    phase: 'failed',
    status: 'failed'
  }));
});
