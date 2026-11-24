// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { READWISE_SOURCE_MODE_KEY } from '../../lib/core/import/readwiseSourceMode.js';
import { READWISE_SOURCE_CUTOVER_COMPLETION_VERSION, READWISE_SOURCE_CUTOVER_JOURNAL_KEY } from '../../lib/core/readwise/readwiseSourceCutover.js';
import { openNodeSqliteFixture } from '../database/nodeSqliteFixture.testSupport.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';

import { resolveReadwiseJoinDecision } from './readwiseGroupSetup.js';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => active,
  runWithDatabaseConnectionOwner: async (execute: () => unknown) => execute()
}));
vi.mock('../database/readwiseHostAssignment.js', () => ({
  canPrepareReadwiseOnThisHost: () => true,
  loadReadwiseHostAssignment: () => ({ legacy_unassigned: true, active_device_identity_key: null, is_active: false })
}));
vi.mock('../database/syncGroupStore.js', () => ({
  loadDesktopSyncGroup: () => ({
    group_id: 'same-group', local_device_identity_key: 'local',
    devices: [
      { device_identity_key: 'local', device_name: 'Local', platform: 'macOS', state: 'active' },
      { device_identity_key: 'peer', device_name: 'Peer', platform: 'Windows 11', state: 'active' }
    ]
  })
}));
vi.mock('./desktopSyncGroupMemberStateSession.js', () => ({
  loadDesktopSyncGroupMemberEndpoints: () => [{
    endpoint_url: 'http://peer', group_id: 'same-group', local_device_id: 'local', peer_device_id: 'peer'
  }]
}));
vi.mock('./desktopSyncGroupPeerCompatibility.js', () => ({
  assertDesktopSyncGroupPeerCompatible: async () => undefined
}));
vi.mock('./desktopSyncGroupHttp.js', () => ({ postDesktopWorkgroupJson: post }));
vi.mock('./workgroupKeyStore.js', () => ({ loadDesktopWorkgroupKey: () => ({ group_key: 'same-key' }) }));
vi.mock('./readwiseOwnerHandoff.js', () => ({ activateReadwiseWithHandoff: vi.fn() }));

const completion = { batchId: 'batch', completedAt: 'done', sourceHost: 'Peer', startedAt: 'start' };
const status = {
  apiProof: { completion, cutover: { ...completion, annotations: [], cohortDocumentIds: [], documents: [],
    retiredNodeIds: [], completionVersion: READWISE_SOURCE_CUTOVER_COMPLETION_VERSION, status: 'api', version: 2 } },
  deviceId: 'peer', deviceName: 'Peer', mode: 'api', ready: true
};
type Library = ReturnType<typeof openNodeSqliteFixture>;
let first: Library;
let second: Library;
let active: Library;

beforeEach(() => {
  first = openNodeSqliteFixture();
  second = openNodeSqliteFixture();
  for (const library of [first, second]) {
    active = library;
    saveJsonSetting(READWISE_SOURCE_MODE_KEY, { mode: 'relay', version: 1 });
  }
  active = first;
  post.mockReset();
});
afterEach(() => { first.sqlite.close(); second.sqlite.close(); });

it('drops a delayed migration proof if the active library changed within the same group', async () => {
  const inspection = Promise.withResolvers<void>();
  const reply = Promise.withResolvers<typeof status>();
  post.mockImplementation(() => { inspection.resolve(); return reply.promise; });
  const pending = resolveReadwiseJoinDecision();
  await Promise.race([inspection.promise, pending.then(() => { throw new Error('No inspection request'); })]);
  active = second;
  reply.resolve(status);
  const result = await pending;
  expect(loadJsonSetting(READWISE_SOURCE_CUTOVER_JOURNAL_KEY)).toBeNull();
  expect(loadJsonSetting(READWISE_SOURCE_MODE_KEY)).toMatchObject({ mode: 'relay' });
  active = first;
  expect(loadJsonSetting(READWISE_SOURCE_CUTOVER_JOURNAL_KEY)).toBeNull();
  expect(result).toEqual({ kind: 'none', devices: [] });
});

it('adopts the proof into the starting library when it remains active', async () => {
  post.mockResolvedValue(status);
  await expect(resolveReadwiseJoinDecision()).resolves.toMatchObject({ kind: 'choose' });
  expect(loadJsonSetting(READWISE_SOURCE_MODE_KEY)).toMatchObject({ mode: 'api', completion });
  active = second;
  expect(loadJsonSetting(READWISE_SOURCE_CUTOVER_JOURNAL_KEY)).toBeNull();
});
