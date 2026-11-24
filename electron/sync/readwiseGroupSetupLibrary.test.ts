// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { READWISE_SOURCE_MODE_KEY } from '../../lib/core/import/readwiseSourceMode.js';
import { READWISE_SOURCE_CUTOVER_COMPLETION_VERSION, READWISE_SOURCE_CUTOVER_JOURNAL_KEY } from '../../lib/core/readwise/readwiseSourceCutover.js';
import { openNodeSqliteFixture } from '../database/nodeSqliteFixture.testSupport.js';
import { loadReadwiseOwnerGuard } from '../database/readwiseOwnerGuard.js';
import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';

import { resolveReadwiseJoinDecision } from './readwiseGroupSetup.js';
import { loadReadwiseHandoffIntent } from './readwiseHandoffIntent.js';
import { continuePendingReadwiseHandoff } from './readwiseOwnerHandoff.js';

const { post, remoteStop, resume } = vi.hoisted(() => ({ post: vi.fn(), remoteStop: vi.fn(), resume: vi.fn() }));
vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => active,
  runWithDatabaseConnectionOwner: async (execute: () => unknown) => execute()
}));
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({ app_config_dir: root }) }));
vi.mock('../database/readwiseHostAssignment.js', () => ({
  canPrepareReadwiseOnThisHost: () => true,
  loadReadwiseHostAssignment: () => {
    const owner = loadJsonSetting('readwise_active_host') as { device_identity_key: string; epoch: number } | null;
    return { legacy_unassigned: !owner, active_device_identity_key: owner?.device_identity_key ?? null,
      active_owner_epoch: owner?.epoch ?? 0, is_active: owner?.device_identity_key === 'local', current_host_name: 'Local' };
  }
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
vi.mock('./desktopSyncGroupHttp.js', () => ({
  postDesktopWorkgroupJson: post,
  createDesktopWorkgroupPost: ({ body }: { body: string }) => ({ body, headers: {} }),
  readDesktopWorkgroupResponse: async ({ response }: { response: Response }) => Buffer.from(await response.text())
}));
vi.mock('./desktopSyncGroupMemberState.js', () => ({
  exchangeDesktopSyncGroupMemberState: async () => ({ localExited: false, peerBlocked: false })
}));
vi.mock('./lanPeerHttp.js', () => ({ lanPeerHttp: { fetch: remoteStop } }));
vi.mock('./workgroupKeyStore.js', () => ({ loadDesktopWorkgroupKey: () => ({ group_key: 'same-key' }) }));
vi.mock('./readwiseOwnerStop.js', () => ({
  READWISE_OWNER_STOP_PATH: '/companion/readwise-owner-stop',
  handleReadwiseOwnerStop: (body: string) => ({ ...JSON.parse(body), status: 'stopped', oldDeviceId: 'local' }),
  resumeReadwiseExecutionAfterActivation: resume
}));

const completion = { batchId: 'batch', completedAt: 'done', sourceHost: 'Peer', startedAt: 'start' };
const status = {
  apiProof: { completion, cutover: { ...completion, annotations: [], cohortDocumentIds: [], documents: [],
    retiredNodeIds: [], completionVersion: READWISE_SOURCE_CUTOVER_COMPLETION_VERSION, status: 'api', version: 2 } },
  deviceId: 'peer', deviceName: 'Peer', mode: 'api', ready: true
};
type Library = ReturnType<typeof openNodeSqliteFixture> & { dbPath: string };
let first: Library;
let second: Library;
let active: Library;
let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'foliole-readwise-join-'));
  first = { ...openNodeSqliteFixture(), dbPath: path.join(root, 'first.db') };
  second = { ...openNodeSqliteFixture(), dbPath: path.join(root, 'second.db') };
  for (const library of [first, second]) {
    active = library;
    saveJsonSetting(READWISE_SOURCE_MODE_KEY, { mode: 'relay', version: 1 });
  }
  active = first;
  post.mockReset();
  remoteStop.mockReset();
  resume.mockReset();
});
afterEach(() => {
  first.sqlite.close(); second.sqlite.close();
  rmSync(root, { recursive: true, force: true });
});

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

it('keeps automatic owner activation and its recovery intent bound to the starting library', async () => {
  post.mockResolvedValue({ ...status, apiProof: null, mode: 'relay', ready: false });
  const requested = Promise.withResolvers<void>();
  const reply = Promise.withResolvers<void>();
  remoteStop.mockImplementation(async (_url, init: RequestInit) => {
    requested.resolve();
    await reply.promise;
    return Response.json({ ...JSON.parse(String(init.body)), status: 'stopped', oldDeviceId: 'peer' });
  });
  const decision = resolveReadwiseJoinDecision();
  await Promise.race([requested.promise, decision.then(() => { throw new Error('No stop request'); })]);
  active = second;
  reply.resolve();
  await expect(decision).resolves.toEqual({ kind: 'none', devices: [] });

  expect(loadJsonSetting('readwise_active_host')).toBeNull();
  expect(loadReadwiseOwnerGuard('same-group')).toBeNull();
  expect(resume).not.toHaveBeenCalled();
  active = first;
  expect(loadReadwiseHandoffIntent('same-group')).toMatchObject({ dbPath: first.dbPath, targetId: 'local' });
  await expect(continuePendingReadwiseHandoff()).resolves.toMatchObject({ is_active: true });
  expect(loadJsonSetting('readwise_active_host')).toMatchObject({ device_identity_key: 'local', epoch: 1 });
  expect(loadReadwiseHandoffIntent('same-group')).toBeNull();
});
