// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import {
  createDefaultReadwiseHostSettings
} from '../../lib/core/import/readwiseHostSettings.js';

const state = vi.hoisted(() => ({
  active: true,
  legacyUnassigned: false,
  remoteSource: null as null | { connectionRef: string },
  secret: '',
  secure: true,
  settings: null as unknown,
  sourceMode: 'api' as 'api' | 'relay'
}));
const clipboardRead = vi.hoisted(() => vi.fn());
const invalidateCutover = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({ clipboard: { readText: clipboardRead } }));
vi.mock('../database/readwiseHostAssignment.js', () => ({
  loadReadwiseHostAssignment: () => ({ current_host_name: 'This Mac', is_active: state.active,
    legacy_unassigned: state.legacyUnassigned })
}));
vi.mock('../database/readwiseSourceMode.js', () => ({
  loadReadwiseSourceModeState: () => ({
    completion: null, conflictReasons: [], mode: state.sourceMode
  })
}));
vi.mock('../database/readwiseDeviceConnection.js', () => ({
  deleteReadwiseDeviceConnection: () => {
    state.settings = { secretRef: null, state: 'disconnected', verifiedAt: null };
  },
  loadReadwiseDeviceConnection: () => state.settings,
  saveReadwiseDeviceConnection: (connection: unknown) => { state.settings = connection; }
}));
vi.mock('../database/readwiseRemoteIdentity.js', () => ({
  createReadwiseRemoteSource: () => ({
    connectionRef: 'readwise-new', createdAt: 'created', updatedAt: 'updated', version: 1
  }),
  loadReadwiseRemoteSource: () => state.remoteSource,
  saveReadwiseConnectionState: (connection: unknown, source: typeof state.remoteSource) => {
    state.settings = connection;
    if (source) state.remoteSource = source;
  }
}));
vi.mock('../database/settingsStore.js', () => ({
  loadJsonSetting: () => state.settings,
  saveJsonSetting: (_key: string, value: unknown) => { state.settings = value; }
}));
vi.mock('../security/secureStorageBackend.js', () => ({
  ensureSecureStorageBackend: () => {
    if (!state.secure) throw new Error('secure_storage_unavailable');
  }
}));
vi.mock('./readwiseApiSecret.js', () => ({
  deleteReadwiseApiSecret: () => { state.secret = ''; return true; },
  hasReadwiseApiSecret: () => Boolean(state.secret),
  readReadwiseApiSecret: () => state.secret,
  writeReadwiseApiSecret: (_ref: string, token: string) => { state.secret = token; }
}));
vi.mock('./readwiseSourceCutoverReset.js', () => ({
  invalidateIncompleteReadwiseSourceCutover: invalidateCutover
}));

import {
  connectReadwiseApiFromClipboard,
  disconnectReadwiseApi,
  loadReadwiseApiConnection
} from './readwiseApiConnection.js';

beforeEach(() => {
  state.active = true;
  state.legacyUnassigned = false;
  state.remoteSource = null;
  state.secret = '';
  state.secure = true;
  state.settings = createDefaultReadwiseHostSettings().apiConnection;
  state.sourceMode = 'api';
  clipboardRead.mockReset();
  invalidateCutover.mockReset();
  clipboardRead.mockReturnValue('READWISE-SECRET');
});

it('validates and stores a clipboard token without returning or persisting it', async () => {
  const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
  const connected = await connectReadwiseApiFromClipboard({ fetchImpl });

  expect(fetchImpl).toHaveBeenCalledWith('https://readwise.io/api/v2/auth/', expect.objectContaining({
    headers: { Authorization: 'Token READWISE-SECRET' }, method: 'GET', redirect: 'error'
  }));
  expect(connected).toMatchObject({
    connection: { has_credential: true, state: 'connected' }, status: 'connected'
  });
  expect(JSON.stringify(connected)).not.toContain('READWISE-SECRET');
  expect(JSON.stringify(state.settings)).not.toContain('READWISE-SECRET');
  expect(state.settings).toMatchObject({
    secretRef: expect.stringMatching(/^readwise-api-/), state: 'connected'
  });
});

it('allows initial API connection before an import device has been assigned', async () => {
  state.active = false;
  state.legacyUnassigned = true;
  const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
  await expect(connectReadwiseApiFromClipboard({ fetchImpl }))
    .resolves.toMatchObject({ status: 'connected' });
});

it('blocks non-active Hosts before reading the clipboard or sending a request', async () => {
  state.active = false;
  const fetchImpl = vi.fn();

  await expect(connectReadwiseApiFromClipboard({ fetchImpl })).resolves.toMatchObject({ status: 'not_active_host' });
  expect(clipboardRead).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
});

it('prepares and removes a local token on a non-active Host for an existing shared source', async () => {
  state.active = false;
  state.remoteSource = { connectionRef: 'readwise-existing' };
  const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));

  await expect(connectReadwiseApiFromClipboard({ fetchImpl }))
    .resolves.toMatchObject({ status: 'connected' });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(state.remoteSource).toEqual({ connectionRef: 'readwise-existing' });
  expect(disconnectReadwiseApi()).toMatchObject({ status: 'disconnected' });
  expect(state.secret).toBe('');
});

it('blocks relay mode before reading the clipboard or sending a request', async () => {
  state.sourceMode = 'relay';
  const fetchImpl = vi.fn();

  await expect(connectReadwiseApiFromClipboard({ fetchImpl })).resolves.toMatchObject({
    status: 'source_mode_mismatch'
  });
  expect(clipboardRead).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
});

it('allows an explicit migration connection without committing API mode first', async () => {
  state.sourceMode = 'relay';
  const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));

  await expect(connectReadwiseApiFromClipboard({ fetchImpl }, 'migration'))
    .resolves.toMatchObject({ status: 'connected' });
  expect(clipboardRead).toHaveBeenCalledTimes(1);
  expect(state.sourceMode).toBe('relay');
});

it('reports auth rejection and rate limits without storing the attempted token', async () => {
  const rejected = await connectReadwiseApiFromClipboard({
    fetchImpl: vi.fn(async () => new Response(null, { status: 401 }))
  });
  expect(rejected).toMatchObject({ connection: { has_credential: false }, status: 'reconnect_required' });
  expect(state.secret).toBe('');

  state.sourceMode = 'api';
  const limited = await connectReadwiseApiFromClipboard({
    fetchImpl: vi.fn(async () => new Response(null, { headers: { 'Retry-After': '12' }, status: 429 }))
  });
  expect(limited).toMatchObject({ retry_after_seconds: 12, status: 'rate_limited' });
  expect(state.secret).toBe('');
});

it('refuses connection when secure storage is unavailable', async () => {
  state.secure = false;
  const fetchImpl = vi.fn();

  await expect(connectReadwiseApiFromClipboard({ fetchImpl })).resolves.toMatchObject({
    status: 'secure_storage_unavailable'
  });
  expect(clipboardRead).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
});

it('restores redacted state after restart and clears the Host credential on disconnect', async () => {
  await connectReadwiseApiFromClipboard({ fetchImpl: vi.fn(async () => new Response(null, { status: 204 })) });
  expect(loadReadwiseApiConnection()).toMatchObject({ has_credential: true, state: 'connected' });

  expect(disconnectReadwiseApi()).toMatchObject({
    connection: { has_credential: false, state: 'disconnected' }, status: 'disconnected'
  });
  expect(state.secret).toBe('');
});

it('replaces the current token without changing the library source identity', async () => {
  state.remoteSource = { connectionRef: 'readwise-existing' };
  state.settings = {
    secretRef: 'readwise-api-current.bin', state: 'connected', verifiedAt: '2026-09-15T00:00:00.000Z'
  };
  state.secret = 'OLD-SECRET';
  clipboardRead.mockReturnValue('NEW-SECRET');
  const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));

  await expect(connectReadwiseApiFromClipboard({ fetchImpl })).resolves.toMatchObject({ status: 'connected' });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(state.remoteSource).toEqual({ connectionRef: 'readwise-existing' });
  expect(state.secret).toBe('NEW-SECRET');
  expect(invalidateCutover).toHaveBeenCalledWith({
    connectionRef: 'readwise-existing', sourceHost: 'This Mac'
  });
});
