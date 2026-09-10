// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import {
  createDefaultReadwiseHostSettings,
  READWISE_HOST_SETTINGS_VERSION
} from '../../lib/core/import/readwiseHostSettings.js';

const state = vi.hoisted(() => ({
  active: true,
  documentIds: [] as string[],
  remoteSource: null as null | { connectionRef: string },
  secret: '',
  secure: true,
  settings: null as unknown
}));
const clipboardRead = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({ clipboard: { readText: clipboardRead } }));
vi.mock('../database/readwiseHostAssignment.js', () => ({
  loadReadwiseHostAssignment: () => ({ is_active: state.active })
}));
vi.mock('../database/readwiseRemoteIdentity.js', () => ({
  createReadwiseRemoteSource: () => ({
    connectionRef: 'readwise-new', createdAt: 'created', updatedAt: 'updated', version: 1
  }),
  loadReadwiseRemoteDocumentIds: () => state.documentIds,
  loadReadwiseRemoteSource: () => state.remoteSource,
  saveReadwiseConnectionState: (settings: unknown, source: typeof state.remoteSource) => {
    state.settings = settings;
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

import {
  connectReadwiseApiFromClipboard,
  disconnectReadwiseApi,
  loadReadwiseApiConnection
} from './readwiseApiConnection.js';

beforeEach(() => {
  state.active = true;
  state.documentIds = [];
  state.remoteSource = null;
  state.secret = '';
  state.secure = true;
  state.settings = { ...createDefaultReadwiseHostSettings(), readwiseSourceMode: 'api' };
  clipboardRead.mockReset();
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
    apiConnection: { secretRef: expect.stringMatching(/^readwise-api-/), state: 'connected' },
    version: READWISE_HOST_SETTINGS_VERSION
  });
});

it('blocks non-active Hosts before reading the clipboard or sending a request', async () => {
  state.active = false;
  const fetchImpl = vi.fn();

  await expect(connectReadwiseApiFromClipboard({ fetchImpl })).resolves.toMatchObject({ status: 'not_active_host' });
  expect(clipboardRead).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
});

it('blocks folder mode before reading the clipboard or sending a request', async () => {
  state.settings = { ...createDefaultReadwiseHostSettings(), readwiseSourceMode: 'folder' };
  const fetchImpl = vi.fn();

  await expect(connectReadwiseApiFromClipboard({ fetchImpl })).resolves.toMatchObject({
    status: 'source_mode_mismatch'
  });
  expect(clipboardRead).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
});

it('allows an explicit migration connection without committing API mode first', async () => {
  state.settings = { ...createDefaultReadwiseHostSettings(), readwiseSourceMode: 'folder' };
  const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));

  await expect(connectReadwiseApiFromClipboard({ fetchImpl }, 'continue', 'migration'))
    .resolves.toMatchObject({ status: 'connected' });
  expect(clipboardRead).toHaveBeenCalledTimes(1);
  expect(state.settings).toMatchObject({ readwiseSourceMode: 'folder' });
});

it('reports auth rejection and rate limits without storing the attempted token', async () => {
  const rejected = await connectReadwiseApiFromClipboard({
    fetchImpl: vi.fn(async () => new Response(null, { status: 401 }))
  });
  expect(rejected).toMatchObject({ connection: { has_credential: false }, status: 'reconnect_required' });
  expect(state.secret).toBe('');

  state.settings = { ...createDefaultReadwiseHostSettings(), readwiseSourceMode: 'api' };
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

it('verifies a known remote document before continuing the existing source', async () => {
  state.remoteSource = { connectionRef: 'readwise-existing' };
  state.documentIds = ['document-1'];
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    return url.includes('/api/v2/auth/')
      ? new Response(null, { status: 204 })
      : new Response(JSON.stringify({ results: [{ category: 'article', id: 'document-1' }] }), { status: 200 });
  }) as typeof fetch;

  await expect(connectReadwiseApiFromClipboard({ fetchImpl })).resolves.toMatchObject({ status: 'connected' });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(state.remoteSource).toEqual({ connectionRef: 'readwise-existing' });
});

it('does not replace an existing source when the new account cannot prove its identity', async () => {
  state.remoteSource = { connectionRef: 'readwise-existing' };
  state.documentIds = ['document-1'];
  const fetchImpl = vi.fn(async (input: string | URL | Request) => String(input).includes('/api/v2/auth/')
    ? new Response(null, { status: 204 })
    : new Response(JSON.stringify({ results: [] }), { status: 200 })) as typeof fetch;

  await expect(connectReadwiseApiFromClipboard({ fetchImpl })).resolves.toMatchObject({ status: 'account_unverified' });
  expect(state.remoteSource).toEqual({ connectionRef: 'readwise-existing' });
  expect(state.secret).toBe('');
});

it('creates a new namespace only after an explicit source replacement', async () => {
  state.remoteSource = { connectionRef: 'readwise-existing' };
  state.documentIds = ['document-1'];
  const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));

  await expect(connectReadwiseApiFromClipboard({ fetchImpl }, 'replace')).resolves.toMatchObject({ status: 'connected' });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(state.remoteSource).toMatchObject({ connectionRef: 'readwise-new' });
});
