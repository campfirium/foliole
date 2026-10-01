// @vitest-environment node
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { dependencyResumeUrl } from '../../lib/core/sync/syncPackDependencyResume.js';
import type { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { mockedSyncPackBuilderAppDataDir, resolveSyncPackPath,
  setupSyncPackBuilderTestLifecycle } from '../database/syncPackBuilderTestSupport.js';

import { startAuthenticatedSyncHttp } from './companionLanAuthenticatedHttp.testSupport.js';
import { assertReceivedNodes, negotiateFactView, seedMixedSource } from './companionLanMultiNodeBatch.testSupport.js';
import { markDesktopSyncGroupMemberStateReady,
  revokeDesktopSyncGroupMemberStateReadiness } from './desktopSyncGroupMemberStateReadiness.js';
import { extractSyncPackDatabaseFromFile } from './syncPackContainerReader.js';

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
  devices: [{ device_identity_key: ids.source, state: 'active' },
    { device_identity_key: ids.receiver, state: 'active' }]
}) }));
vi.mock('./workgroupKeyStore.js', async (original) => ({
  ...await original<typeof import('./workgroupKeyStore.js')>(),
  loadDesktopWorkgroupKey: () => ({ group_id: 'group',
    group_key: Buffer.alloc(32, 7).toString('base64url'), group_tag: 'test-tag' }),
  consumeDesktopWorkgroupNonce: () => true
}));
setupSyncPackBuilderTestLifecycle();
type ApplyResult = Awaited<ReturnType<typeof applySyncPackNodeSurfaceWithDbPort>>;

function createTarget() {
  const targetPath = resolveSyncPackPath('crash-target.db');
  const db = new Database(targetPath);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = FULL');
    db.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
    db.exec("INSERT INTO sync_groups VALUES ('group', 'Group', 'key', 'now', 'now')");
    db.prepare("INSERT INTO sync_group_local_state VALUES (1, 'group', ?, 'active', 'now')")
      .run(ids.receiver);
  } finally { db.close(); }
  return targetPath;
}

function readDurableState(targetPath: string) {
  const db = new Database(targetPath, { readonly: true });
  try {
    const count = (table: string) => db.prepare(`SELECT count(*) FROM ${table}`).pluck().get();
    return { nodes: count('nodes'), versions: count('node_sync_versions'),
      rows: count('sync_pack_dependency_rows'), tombstones: count('node_sync_tombstones'),
      highWater: db.prepare('SELECT high_water FROM sync_state_sequence').pluck().get(),
      cursor: db.prepare('SELECT cursor_state_seq FROM sync_pack_receive_progress WHERE peer_id=?')
        .pluck().get(ids.source) ?? 0 };
  } finally { db.close(); }
}

async function applyInNewProcess(target: string, incoming: string, mode = 'resume') {
  const working = `${incoming}-${randomUUID()}.db`;
  await fs.copyFile(incoming, working);
  const args = ['--experimental-loader', './scripts/android/ts-js-extension-loader.mjs',
    '--experimental-strip-types', 'electron/sync/syncPackCrashApply.testWorker.ts',
    target, working, ids.source, mode];
  try {
    const result = await promisify(execFile)(process.execPath, args,
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 30_000 });
    return JSON.parse(result.stdout) as ApplyResult;
  } finally {
    for (const suffix of ['', '-journal', '-wal', '-shm']) await fs.rm(working + suffix, { force: true });
  }
}

async function transferWithCrash(http: Awaited<ReturnType<typeof startAuthenticatedSyncHttp>>,
  target: string, phase: string, mode: string) {
  const { viewId, frontierStateSeq } = await negotiateFactView(http);
  let url = new URL(`/companion/sync-pack?page_contract=bounded-v1&after_state_seq=0&fact_view=${viewId}`, http.origin);
  let killed = false;
  let finalIncoming = '';
  let recoveredState = readDurableState(target);
  for (let page = 0; page < 8; page++) {
    const archive = await http.archive(url);
    const incoming = resolveSyncPackPath(`crash-incoming-${page}.db`);
    try {
      const manifest = await extractSyncPackDatabaseFromFile({ archivePath: archive.filePath,
        outputPath: incoming, expectedPeerId: ids.receiver, expectedSourcePeerId: ids.source,
        maxDatabaseBytes: 4 * 1024 * 1024 });
      const dependency = Boolean(manifest.dependencyPage);
      if (!killed && dependency === (phase === 'dependency')) {
        const before = readDurableState(target);
        await expect(applyInNewProcess(target, incoming, mode)).rejects.toMatchObject({ signal: 'SIGKILL' });
        recoveredState = readDurableState(target);
        if (mode === 'before') expect(recoveredState).toEqual(before);
        else if (dependency) expect(recoveredState).toMatchObject({ nodes: 0, versions: 0, rows: 1, cursor: 0 });
        else expect(recoveredState).toMatchObject({ nodes: 2, versions: 2, rows: 0, cursor: frontierStateSeq });
        killed = true;
      }
      const result = await applyInNewProcess(target, incoming);
      if (!result.dependencyProgress) { finalIncoming = incoming; break; }
      url = new URL(dependencyResumeUrl(url.href, result.dependencyProgress));
    } finally { await archive.cleanup(); }
  }
  expect(killed).toBe(true);
  expect(finalIncoming).not.toBe('');
  const beforeReplay = readDurableState(target);
  expect((await applyInNewProcess(target, finalIncoming)).applied).toBe(false);
  expect(readDurableState(target)).toEqual(beforeReplay);
  return { recoveredState, finalState: beforeReplay };
}

it.each(['dependency-before', 'dependency-after', 'business-before', 'business-after'])(
  'recovers a real killed receiver across authenticated HTTP (%s)', async (scenario) => {
    seedMixedSource(ids, true);
    const target = createTarget();
    markDesktopSyncGroupMemberStateReady(ids.receiver);
    const http = await startAuthenticatedSyncHttp({ sourceDeviceId: ids.source,
      receiverDeviceId: ids.receiver });
    try {
      const [phase, mode] = scenario.split('-');
      if (!phase || !mode) throw new Error('crash_fixture_scenario_invalid');
      const evidence = await transferWithCrash(http, target, phase, mode);
      const db = new Database(target, { readonly: true });
      try {
        assertReceivedNodes(db, true);
        expect(db.prepare(`SELECT version_id, object_id, parent_version_id, body_text
          FROM node_sync_versions ORDER BY version_id`).all()).toEqual([
          { version_id: 'version-1', object_id: 'live-1', parent_version_id: null, body_text: 'body-1' },
          { version_id: 'version-2', object_id: 'live-2', parent_version_id: null, body_text: 'body-2' }
        ]);
        expect(db.prepare('SELECT id, current_version_id FROM nodes ORDER BY id').all()).toEqual([
          { id: 'live-1', current_version_id: 'version-1' }, { id: 'live-2', current_version_id: 'version-2' }
        ]);
        expect(db.pragma('quick_check', { simple: true })).toBe('ok');
      } finally { db.close(); }
      await fs.mkdir('.tmp/artifacts/T267', { recursive: true });
      await fs.writeFile(path.resolve(`.tmp/artifacts/T267/database-crash-${scenario}.json`),
        JSON.stringify(evidence, null, 2));
    } finally { await http.close(); revokeDesktopSyncGroupMemberStateReadiness(ids.receiver); }
  }, 90_000);
