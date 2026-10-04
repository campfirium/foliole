// @vitest-environment node
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { DESKTOP_FRESH_SCHEMA_STATEMENTS } from '../../lib/core/database/desktopFreshSchemaStatements.js';
import { syncIdentityPartition } from '../../lib/core/sync/syncIdentityDigest.js';
import { buildSyncIdentityPackPage } from '../../lib/core/sync/syncIdentityPackPage.js';
import { openDatabaseConnection } from '../database/connection.js';
import { openSyncIdentitySourceView } from '../database/syncIdentitySourceView.js';
import {
  insertNodeSyncState, mockedSyncPackBuilderAppDataDir, resolveSyncPackPath,
  setupSyncPackBuilderTestLifecycle
} from '../database/syncPackBuilderTestSupport.js';
import { loadPackRowsByIdentity } from '../database/syncPackRowsByIdentity.js';

import { startAuthenticatedSyncHttp } from './companionLanAuthenticatedHttp.testSupport.js';
import { markDesktopSyncGroupMemberStateReady,
  revokeDesktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';
import { readDesktopSyncIdentityCandidatePage } from './desktopSyncIdentityCandidatePages.js';
import { identityPositionCandidate } from './desktopSyncIdentityHttp.testSupport.js';
import { probeDesktopSyncIdentities } from './desktopSyncIdentityProbe.js';
import { extractSyncIdentityPackDatabaseFromFile } from './syncPackContainerReader.js';

const ids = vi.hoisted(() => ({
  source: JSON.stringify([1, 'group', '11111111-1111-4111-8111-111111111111', '/source']),
  receiver: JSON.stringify([1, 'group', '22222222-2222-4222-8222-222222222222', '/receiver'])
}));
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: mockedSyncPackBuilderAppDataDir,
  app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
  app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
  app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
}) }));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: () => ({
  group_id: 'group', local_device_identity_key: ids.source,
  devices: [ids.source, ids.receiver].map((device_identity_key) => ({ device_identity_key, state: 'active' }))
}) }));
vi.mock('./workgroupKeyStore.js', async (original) => ({
  ...await original<typeof import('./workgroupKeyStore.js')>(),
  loadDesktopWorkgroupKey: () => ({ group_id: 'group',
    group_key: Buffer.alloc(32, 7).toString('base64url'), group_tag: 'test-tag' }),
  consumeDesktopWorkgroupNonce: () => true
}));
setupSyncPackBuilderTestLifecycle();

function seedGroup() {
  const driver = openDatabaseConnection().driver;
  driver.execute("INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now')");
  driver.execute("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')", [ids.source]);
  for (const [id, anchor, library] of [
    [ids.source, '11111111-1111-4111-8111-111111111111', '/source'],
    [ids.receiver, '22222222-2222-4222-8222-222222222222', '/receiver']
  ] as const) driver.execute(`INSERT INTO sync_group_devices
    (group_id, device_identity_key, device_anchor, canonical_library_path,
      device_name, platform, state, joined_at, updated_at)
    VALUES ('group', ?, ?, ?, 'Device', 'mac', 'active', 'now', 'now')`, [id, anchor, library]);
}

function assertFactSummary(summary: Record<string, unknown>, viewId: string) {
  expect(summary).toMatchObject({ contract: 'global-id-v2', source_view_id: viewId,
    inventory: { digest: expect.stringMatching(/^[a-f0-9]{64}$/u), row_count: 1 } });
  expect(summary.proof_root).toMatch(/^[a-f0-9]{64}$/u);
}

async function assertNodeFacts(http: Awaited<ReturnType<typeof startAuthenticatedSyncHttp>>,
  viewId: string) {
  const pathFor = (section: string) => '/companion/sync-identity-node-facts?' +
    new URLSearchParams({ source_view_id: viewId, node_id: 'node-1', section });
  const versions = await http.getJson(pathFor('versions'));
  expect(versions).toMatchObject({ contract: 'global-id-v1', source_view_id: viewId,
    node_id: 'node-1', head_id: 'desktop#node-1-v1', section: 'versions',
    entries: [expect.objectContaining({ version_id: 'desktop#node-1-v1' })], nextAfter: null });
  expect((versions.entries as Array<Record<string, unknown>>)[0])
    .not.toHaveProperty('body_text');
  expect(versions.fact_digest).toMatch(/^[a-f0-9]{64}$/u);
  const requirements = await http.getJson(pathFor('requirements'));
  expect(requirements.entries).toEqual([expect.objectContaining({
    version_id: 'desktop#node-1-v1' })]);
  expect(requirements.requirements_digest).toMatch(/^[a-f0-9]{64}$/u);
  for (const section of ['parents', 'reviews']) {
    expect((await http.getJson(pathFor(section))).entries).toEqual([]);
  }
}

async function assertFactPage(http: Awaited<ReturnType<typeof startAuthenticatedSyncHttp>>,
  viewId: string, fingerprint: string | undefined) {
  const factPage = await http.getJson('/companion/sync-identity-fact-global-page?' +
    new URLSearchParams({ source_view_id: viewId }));
  expect(factPage).toMatchObject({ contract: 'global-id-v2', source_view_id: viewId, nextAfter: null });
  expect((factPage.entries as Array<{ object_id: string; state_fingerprint: string }>)[0])
    .toMatchObject({ object_id: 'node-1', state_fingerprint: fingerprint });
}

async function readGlobalSourcePage(http: Awaited<ReturnType<typeof startAuthenticatedSyncHttp>>) {
  const summary = await http.getJson('/companion/sync-identity-global-summary');
  expect(summary.contract).toBe('global-id-v2');
  expect(summary.inventory).toEqual({ digest: expect.stringMatching(/^[a-f0-9]{64}$/u),
    row_count: expect.any(Number) });
  const path = '/companion/sync-identity-global-page?' + new URLSearchParams({
    source_view_id: String(summary.source_view_id) });
  const page = await http.getJson(path);
  expect((page.entries as Array<{ object_id: string }>).map((row) => row.object_id))
    .toContain('node-1');
  return { page, path };
}

it('serves authenticated identity pages from a fixed source view after later writes', async () => {
  insertNodeSyncState();
  seedGroup();
  markDesktopSyncGroupMemberStateReady(ids.receiver);
  const http = await startAuthenticatedSyncHttp({ sourceDeviceId: ids.source, receiverDeviceId: ids.receiver });
  try {
    const first = await http.getJson('/companion/sync-identity-summary');
    expect(first.contract).toBe('global-id-v1');
    expect(first.partitions).toHaveLength(256);
    const global = await readGlobalSourcePage(http);
    const viewId = String(first.source_view_id);
    const partition = syncIdentityPartition('node', 'node-1');
    const pathFor = (id: string) => `/companion/sync-identity-page?source_view_id=${id}&partition=${partition}`;
    const page = await http.getJson(pathFor(viewId));
    const entry = (page.entries as Array<{ object_id: string; fingerprint: string }>).find(
      (row) => row.object_id === 'node-1');
    expect(entry?.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    const changedPath = '/companion/sync-identity-changed-page?' + new URLSearchParams({
      source_view_id: viewId, since: '2026-04-27T00:00:00.000Z'
    });
    const changedBefore = await http.getJson(changedPath);
    expect((changedBefore.entries as Array<{ object_id: string }>).map((row) => row.object_id))
      .toContain('node-1');
    const factSummary = await http.getJson('/companion/sync-identity-fact-summary?' +
      new URLSearchParams({ source_view_id: viewId }));
    assertFactSummary(factSummary, viewId);
    await assertFactPage(http, viewId, entry?.fingerprint);
    await assertNodeFacts(http, viewId);
    openDatabaseConnection().driver.execute(`UPDATE sync_object_state
      SET content_hash = 'later-hash', current_version_id = 'later-version'
      WHERE object_type = 'node' AND object_id = 'node-1'`);
    const frozen = await http.getJson(pathFor(viewId));
    expect((frozen.entries as Array<{ object_id: string; fingerprint: string }>).find(
      (row) => row.object_id === 'node-1')?.fingerprint).toBe(entry?.fingerprint);
    expect(await http.getJson(global.path)).toEqual(global.page);
    expect((await http.getJson(changedPath)).entries).toEqual(changedBefore.entries);
    const identityPage = buildSyncIdentityPackPage({ group_id: 'group',
      source_peer_id: ids.source, target_peer_id: ids.receiver,
      source_view_id: viewId, page_index: 0, previous_page_id: null,
      objects: [{ object_type: 'node', object_id: 'node-1', fingerprint: entry!.fingerprint }] });
    await expect(http.postArchive('/companion/sync-identity-pack',
      buildSyncIdentityPackPage({ ...identityPage, target_peer_id: ids.source })))
      .rejects.toThrow('sync_http_403');
    const archive = await http.postArchive('/companion/sync-identity-pack', identityPage);
    try {
      const verified = await extractSyncIdentityPackDatabaseFromFile({
        archivePath: archive.filePath, outputPath: resolveSyncPackPath('http-identity.db'),
        expectedPeerId: ids.receiver, expectedSourcePeerId: ids.source
      });
      expect(verified.identity_page.page_id).toBe(identityPage.page_id);
    } finally { await archive.cleanup(); }
    const second = await http.getJson('/companion/sync-identity-summary');
    const changed = await http.getJson(pathFor(String(second.source_view_id)));
    expect((changed.entries as Array<{ object_id: string; fingerprint: string }>).find(
      (row) => row.object_id === 'node-1')?.fingerprint).not.toBe(entry?.fingerprint);
  } finally {
    await http.close();
    revokeDesktopSyncGroupMemberStateReadiness(ids.receiver);
  }
});

it('stages authenticated source-only candidates after complete partition verification', async () => {
  insertNodeSyncState();
  seedGroup();
  markDesktopSyncGroupMemberStateReady(ids.receiver);
  const receiver = new Database(':memory:');
  for (const statement of DESKTOP_FRESH_SCHEMA_STATEMENTS) receiver.exec(statement);
  const http = await startAuthenticatedSyncHttp({ sourceDeviceId: ids.source, receiverDeviceId: ids.receiver });
  try {
    const staged = await probeDesktopSyncIdentities({
      endpointUrl: http.origin, groupId: 'group', localDatabase: receiver,
      localDeviceId: ids.receiver,
      outputRoot: path.join(mockedSyncPackBuilderAppDataDir, 'identity-probe'),
      secret: Buffer.alloc(32, 7).toString('base64url')
    });
    try {
      const position = identityPositionCandidate(openDatabaseConnection().sqlite, {
        nodeId: 'node-1', owner: ids.source, head: 'desktop#node-1-v1', pending: [], kind: 'source_only' });
      const candidates = new Database(staged.candidatePath, { readonly: true });
      try {
        expect(candidates.prepare(`SELECT object_type, object_id, kind FROM candidates
          ORDER BY object_type, object_id`).all()).toEqual([
          { object_type: 'node', object_id: 'node-1', kind: 'source_only' },
          position,
          { object_type: 'setting', object_id: 'user_space:windows:desktop:*:app_settings',
            kind: 'source_only' }
        ]);
      } finally { candidates.close(); }
      const page = readDesktopSyncIdentityCandidatePage({
        candidatePath: staged.candidatePath, groupId: 'group',
        sourcePeerId: ids.source, targetPeerId: ids.receiver,
        sourceViewId: staged.sourceViewId, pageIndex: 0,
        previousPageId: null, after: null, direction: 'source'
      });
      expect(staged.count).toBe(page.page.objects.length);
      expect(page.page.objects.map((object) => ({ object_type: object.object_type, object_id: object.object_id }))).toEqual([
        { object_type: 'node', object_id: 'node-1' },
        { object_type: 'node_position', object_id: position.object_id },
        { object_type: 'setting', object_id: 'user_space:windows:desktop:*:app_settings' }
      ]);
      const localView = openSyncIdentitySourceView(staged.localViewPath, staged.localViewId);
      try {
        expect(loadPackRowsByIdentity(localView.driver, [])).toMatchObject({ stateRows: [] });
      } finally { localView.close(); }
    } finally { await staged.cleanup(); }
  } finally {
    receiver.close();
    await http.close();
    revokeDesktopSyncGroupMemberStateReadiness(ids.receiver);
  }
});
