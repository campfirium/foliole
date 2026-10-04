// @vitest-environment node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { setTimeout, clearTimeout } from 'node:timers';

import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

// Select the retained sequence algorithm only inside this benchmark; production advertises v21.
vi.mock('../../../lib/platform/syncProtocolContract.js', async (importOriginal) => {
  const actual = await importOriginal();
  const descriptor = new Proxy({ ...actual.CURRENT_SYNC_PROTOCOL_DESCRIPTOR }, {
    get(target, key) {
      if (process.env.FOLIOLE_BENCHMARK_ACTIVE_PATH === 'old' &&
          ['version', 'min_supported_version', 'max_supported_version'].includes(key)) return 15;
      return Reflect.get(target, key);
    }
  });
  return { ...actual, CURRENT_SYNC_PROTOCOL_DESCRIPTOR: descriptor,
    evaluateSyncProtocolCompatibility: (remote, local = descriptor, required) =>
      actual.evaluateSyncProtocolCompatibility(remote, local, required) };
});

vi.mock('../../../electron/database/connection.js', async () => {
  const { currentPeer } = await import('./scope.js');
  const { getSqliteConnectionCoordinator } = await import('../../../electron/database/sqliteConnectionCoordinator.js');
  return { openDatabaseConnection: currentPeer, resolveDatabasePath: () => currentPeer().dbPath,
    registerDatabaseConnectionCleanup: () => {},
    runWithDatabaseConnectionOwner(task) {
      return getSqliteConnectionCoordinator(currentPeer().sqlite).runExclusive(task);
    } };
});
vi.mock('../../../electron/database/hostProfile.js', async (original) => {
  const actual = await original();
  const { currentPeer } = await import('./scope.js');
  return { ...actual, loadOrCreateDesktopHostName: () => currentPeer().name };
});
vi.mock('../../../electron/attachments/attachmentLibraryPathSnapshot.js', async (original) => {
  const actual = await original();
  const { currentPeer } = await import('./scope.js');
  return { ...actual, readAttachmentLibraryPathSnapshot: () => ({ assetsDir: currentPeer().assets,
    libraryScope: currentPeer().id }) };
});
vi.mock('../../../electron/ipc/paths.js', async () => {
  const { currentPeer } = await import('./scope.js');
  return { resolveAppPaths: () => ({ app_data_dir: currentPeer().root,
    app_cache_dir: currentPeer().root + '/cache', app_config_dir: currentPeer().root + '/config',
    app_log_dir: currentPeer().root + '/logs' }) };
});
vi.mock('../../../electron/ipc/libraryPaths.js', async () => {
  const { currentPeer } = await import('./scope.js');
  return { loadLibraryPathSettingsSync: () => ({ library_home: currentPeer().root,
    assets_dir: currentPeer().assets, data_dir: currentPeer().root, database_path: currentPeer().dbPath }) };
});
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] },
  app: { getPath: () => { throw new Error('simulator_os_path_forbidden'); }, isPackaged: false },
  ipcMain: { handle: () => {}, on: () => {} }, nativeImage: {} }));
vi.mock('../../../electron/import/keepImportMonitor.js', () => ({ refreshKeepImportMonitorFromSettings: async () => {} }));

vi.stubGlobal('window', { setTimeout, clearTimeout });
await import('./companionBoundary.js');
const { runIdentityPerformanceComparison } = await import('./performance.js');
const { measureIdentitySourceViewPreparation } = await import('./performancePreparation.js');
const { openPeer } = await import('./peers.js');
const { edit } = await import('./operations.js');

function originalFacts(database) {
  const sqlite = new Database(database, { readonly: true, fileMustExist: true });
  try {
    return {
      nodes: sqlite.prepare('SELECT id, current_version_id, body_blob_hash FROM nodes ORDER BY id').all(),
      versions: sqlite.prepare(`SELECT version_id, object_id, parent_version_id, content_hash,
        body_text, snapshot_json FROM node_sync_versions ORDER BY version_id`).all()
    };
  } finally { sqlite.close(); }
}

it('measures real source views while preserving original node identities and bodies', async () => {
  const artifacts = path.resolve('.tmp/artifacts');
  await fs.mkdir(artifacts, { recursive: true });
  const root = await fs.mkdtemp(path.join(artifacts, 'identity-preparation-'));
  let peer;
  try {
    peer = openPeer(root, 'base', 'preparation-contract');
    edit(peer, 'First original body', 'first');
    edit(peer, 'Second original body', 'second');
    peer.sqlite.close();
    const before = originalFacts(peer.dbPath);
    expect(before.nodes).toHaveLength(2);
    expect(before.versions.map((row) => row.body_text).sort())
      .toEqual(['First original body', 'Second original body']);
    const output = path.join(root, 'measurements');
    const report = await measureIdentitySourceViewPreparation(peer.root, output);
    expect(report.views.map((view) => view.kind)).toEqual(['old', 'identity']);
    for (const view of report.views) {
      expect(Number.isFinite(view.durationMs) && view.durationMs >= 0).toBe(true);
      expect(view.sourceBytes).toBeGreaterThan(0);
      expect(view.publishedViewBytes).toBe((await fs.stat(path.join(output, view.kind, 'view.db'))).size);
      expect(view.viewWalBytes).toBe(0);
      expect(originalFacts(path.join(output, view.kind, 'view.db'))).toEqual(before);
    }
    expect(originalFacts(peer.dbPath)).toEqual(before);
    expect(JSON.parse(await fs.readFile(path.join(output, 'preparation.json'), 'utf8')).views)
      .toEqual(report.views);
  } finally {
    if (peer?.sqlite.open) peer.sqlite.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

const benchmarkRequested = Object.keys(process.env).some((key) =>
  key.startsWith('FOLIOLE_BENCHMARK_'));

async function compareProductionPaths() {
  if (process.env.FOLIOLE_BENCHMARK_PREPARATION_ONLY === '1') {
    const base = process.env.FOLIOLE_BENCHMARK_BASE;
    const output = process.env.FOLIOLE_BENCHMARK_OUTPUT;
    if (!base || !output) throw new Error('benchmark_preparation_input_required');
    const report = await measureIdentitySourceViewPreparation(base, output,
      process.env.FOLIOLE_BENCHMARK_EDITED_DATABASE);
    expect(report.views).toHaveLength(2);
    return;
  }
  const database = process.env.FOLIOLE_BENCHMARK_DATABASE;
  const assets = process.env.FOLIOLE_BENCHMARK_ASSETS;
  const count = Number(process.env.FOLIOLE_BENCHMARK_COUNT);
  const output = process.env.FOLIOLE_BENCHMARK_OUTPUT;
  if (!database || !assets || !output || ![300, 1000, 10000].includes(count)) {
    throw new Error('benchmark_input_required');
  }
  const report = await runIdentityPerformanceComparison({ database, assets, output, count,
    preparedBase: process.env.FOLIOLE_BENCHMARK_BASE,
    kinds: process.env.FOLIOLE_BENCHMARK_KIND === 'identity' ? ['identity'] :
      process.env.FOLIOLE_BENCHMARK_KIND === 'old' ? ['old'] : undefined });
  await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(report, null, 2));
  expect(report.reports.map((item) => item.error)).toEqual(
    report.reports.map(() => null));
}

const benchmarkName = 'compares both production paths on one WAL-aware library snapshot';
if (benchmarkRequested) {
  it(benchmarkName, compareProductionPaths, 1_800_000);
} else {
  // SKIP: Requires the manual benchmark environment and isolated library snapshot | 2026-10-04 | revive: explicit FOLIOLE_BENCHMARK_* inputs
  it.skip(benchmarkName, compareProductionPaths, 1_800_000);
}
