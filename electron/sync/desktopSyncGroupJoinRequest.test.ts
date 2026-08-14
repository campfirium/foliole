import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  existingGroup: null as null | {
    group_id: string;
    local_member_state: 'active';
    timeline_id: string;
  },
  queryOne: vi.fn((sql: string) => {
    if (sql.includes('FROM nodes')) return { value: 4 };
    if (sql.includes('FROM attachments')) return { value: 2 };
    if (sql.includes('FROM content_blobs')) return { value: 2 };
    if (sql.includes('FROM review_log')) return { value: 6 };
    return { value: 0 };
  }),
  requestJson: vi.fn(async (url: string, init: { body: string }) => {
    void url;
    void init;
    return { expires_at: '2026-08-14T08:00:00.000Z', pair_request_id: 'request-1' };
  }),
  savePending: vi.fn()
}));

vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => ({ driver: { queryOne: mocks.queryOne } })
}));
vi.mock('../database/deviceIdentity.js', () => ({ loadOrCreateDesktopDeviceId: () => 'desktop-b' }));
vi.mock('../database/syncGroupStore.js', () => ({
  joinDesktopSyncGroup: vi.fn(), loadDesktopSyncGroup: () => mocks.existingGroup
}));
vi.mock('./companionLanPayloads.js', () => ({ resolveDesktopDeviceName: () => 'Desktop B' }));
vi.mock('./desktopSyncGroupHttp.js', () => ({
  createDesktopSyncGroupSignedHeaders: vi.fn(), requestJson: mocks.requestJson
}));
vi.mock('./desktopSyncGroupJoinState.js', () => ({
  loadDesktopSyncGroupJoinState: () => ({
    candidates: [{ endpoint_url: 'http://provider', group_id: 'group-1', timeline_id: 'timeline-1' }],
    pending: null
  }),
  saveDesktopSyncGroupPendingJoin: mocks.savePending
}));
vi.mock('./desktopSyncGroupPairingCrypto.js', () => ({
  createDesktopSyncGroupPairingKey: async () => ({ privateKey: 'private', publicKey: 'public' }),
  decryptDesktopSyncGroupPairingSecret: vi.fn()
}));

import { requestDesktopSyncGroupJoin } from './desktopSyncGroupJoin.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
  mocks.existingGroup = null;
});

it('requests a Sync Group join with nonempty library facts', async () => {
  await requestDesktopSyncGroupJoin('http://provider');

  const request = mocks.requestJson.mock.calls[0]![1];
  expect(JSON.parse(request.body).library_facts).toEqual({
    attachment_count: 2, content_blob_count: 2, node_count: 4, review_log_count: 6, timeline_id: null
  });
  expect(mocks.savePending).toHaveBeenCalledOnce();
});

it('rejects replacing a different local Sync Group identity', async () => {
  mocks.existingGroup = {
    group_id: 'group-old', local_member_state: 'active', timeline_id: 'timeline-old'
  };

  await expect(requestDesktopSyncGroupJoin('http://provider')).rejects
    .toThrow('sync_group_identity_mismatch');
  expect(mocks.requestJson).not.toHaveBeenCalled();
});
