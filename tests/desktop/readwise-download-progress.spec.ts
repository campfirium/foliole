import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { openSettingsCategory } from './harness/settings';
import { createT178ApiAcceptanceSession } from './harness/t178ApiAcceptanceSession';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance/readwise-download-progress');

async function seedDownload(app: ElectronApplication, completed: number) {
  await app.evaluate((_electron, count) => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      // Hold the remote transport while exercising durable progress and the real bridge/UI.
      return url.hostname === 'readwise.io' ? new Promise(() => undefined) : originalFetch(input, init);
    };
    const moduleApi = process.getBuiltinModule('module')!;
    const pathApi = process.getBuiltinModule('path')!;
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const load = (name: string) => require(pathApi.join(process.cwd(), `dist/electron/${name}.js`));
    const connection = load('database/connection');
    connection.runWithDatabaseConnectionOwner(() => {
      const host = load('database/readwiseHostAssignment');
      host.activateReadwiseOnThisHost();
      const identity = load('database/readwiseRemoteIdentity');
      const source = identity.loadReadwiseRemoteSource() ?? identity.createReadwiseRemoteSource();
      const secretRef = 'readwise-api-00000000-0000-4000-8000-000000000198.bin';
      load('import/readwiseApiSecret').writeReadwiseApiSecret(secretRef, 'progress-fixture');
      identity.saveReadwiseConnectionState({ secretRef, state: 'connected', verifiedAt: 'now' }, source, 'now');
      load('database/readwiseSourceCutover').writeReadwiseSourceCutover({
        annotations: [], cohortDocumentIds: [], completedAt: '2026-10-02T00:00:00Z',
        documents: [], phase: 'indexing', retiredNodeIds: [],
        sourceHost: host.loadReadwiseHostAssignment().current_host_name,
        startedAt: '2026-10-02T00:00:00Z', status: 'migration-in-progress'
      });
      load('database/readwiseCutoverStage').saveReadwiseCutoverStage(source.connectionRef, 'cutover-download-v1', {
        reader: { cursor: 'next', done: false, saved: count - 515, started: true, total: 1573 },
        export: { cursor: null, done: true, saved: 515, started: true, total: 515 },
        countIssue: 'remote_total_changed', startedAt: '2026-10-02T00:00:00Z', version: 2
      });
    });
    load('ipc/readwiseReaderImportProgressEvents').notifyReadwiseReaderImportProgress({
      phase: 'indexing', processedCount: count, totalCount: 0, status: 'running'
    });
  }, completed);
}

async function beginImport(app: ElectronApplication) {
  await app.evaluate(() => {
    const moduleApi = process.getBuiltinModule('module')!;
    const pathApi = process.getBuiltinModule('path')!;
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const load = (name: string) => require(pathApi.join(process.cwd(), `dist/electron/${name}.js`));
    load('database/connection').runWithDatabaseConnectionOwner(() => {
      const cutover = load('database/readwiseSourceCutover');
      const current = cutover.loadReadwiseSourceCutover();
      cutover.writeReadwiseSourceCutover({ ...current, phase: 'merging',
        cohortDocumentIds: Array.from({ length: 50 }, (_, i) => `document-${i}`),
        updateDocumentIds: Array.from({ length: 50 }, (_, i) => `document-${i}`),
        documents: Array.from({ length: 12 }, (_, i) => ({
          nodeId: null, reason: 'original_file_unavailable', remoteId: `document-${i}`, status: 'unavailable'
        }))
      });
    });
    load('ipc/readwiseReaderImportProgressEvents').notifyReadwiseReaderImportProgress({
      phase: 'merging', processedCount: 12, totalCount: 50, status: 'running'
    });
  });
}

test('keeps unknown-total download counts live and restores them after switching settings tabs', async ({ browserName }, testInfo) => {
  void browserName;
  test.setTimeout(120_000);
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-progress-'));
  const session = await createT178ApiAcceptanceSession(stateRoot);
  try {
    await seedDownload(session.electronApp, 8500);
    let settings = await openSettingsCategory(session.firstWindow, 'ReadwiseReader');
    await expect(settings.getByText(/^(Syncing · Downloading|正在同步 · 下载中) · 8500$/)).toBeVisible();
    await seedDownload(session.electronApp, 8600);
    await expect(settings.getByText(/^(Syncing · Downloading|正在同步 · 下载中) · 8600$/)).toBeVisible();
    await openSettingsCategory(session.firstWindow, 'Appearance');
    settings = await openSettingsCategory(session.firstWindow, 'ReadwiseReader');
    await expect(settings.getByText(/^(Syncing · Downloading|正在同步 · 下载中) · 8600$/)).toBeVisible();
    await expect(settings.getByText(/ · 0%$/)).toHaveCount(0);
    await mkdir(ARTIFACT_DIR, { recursive: true });
    const screenshot = path.join(ARTIFACT_DIR, 'restored-download.png');
    await settings.screenshot({ path: screenshot });
    await testInfo.attach('restored-download', { path: screenshot, contentType: 'image/png' });
    await beginImport(session.electronApp);
    await expect(settings.getByText(/^(Syncing · Importing|正在同步 · 导入中) · 12$/)).toBeVisible();
    await openSettingsCategory(session.firstWindow, 'Appearance');
    settings = await openSettingsCategory(session.firstWindow, 'ReadwiseReader');
    await expect(settings.getByText(/^(Syncing · Importing|正在同步 · 导入中) · 12$/)).toBeVisible();
    await expect(settings.getByText(/12 \/ 50/)).toHaveCount(0);
    await settings.screenshot({ path: path.join(ARTIFACT_DIR, 'import-count.png') });
  } finally {
    await session.close();
    await rm(stateRoot, { force: true, recursive: true });
  }
});

test('skips short legacy deletion titles while retaining exact API deletions in native SQLite', async ({ browserName }) => {
  void browserName;
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-title-length-'));
  const session = await createT178ApiAcceptanceSession(stateRoot);
  try {
    const result = await session.electronApp.evaluate(() => {
      const moduleApi = process.getBuiltinModule('module')!;
      const pathApi = process.getBuiltinModule('path')!;
      const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
      const load = (name: string) => require(pathApi.join(process.cwd(), `dist/electron/${name}.js`));
      const connection = load('database/connection');
      return connection.runWithDatabaseConnectionOwner(() => {
        const driver = connection.openDatabaseConnection().driver;
        const host = load('database/readwiseHostAssignment').loadReadwiseHostAssignment().current_host_name;
        driver.execute(`INSERT INTO desktop_sources (
          source_ref,source_type,config_ref,host_name,host_platform,root_path,path_flavor,
          type_settings_json,created_at,updated_at
        ) VALUES ('readwise:title-test','readwise','title-test',?,'darwin','/tmp','posix',
          '{"kind":"articles"}','old','old')`, [host]);
        for (const title of ['ChatGPT', 'x'.repeat(19), 'x'.repeat(20)]) {
          driver.execute(`INSERT INTO keep_import_items (
            rule_id,source_path,source_mtime_ms,source_size_bytes,source_state,local_node_state,
            has_source_update,last_node_id,last_status,first_seen_at,last_seen_at,last_imported_at
          ) VALUES ('title-test',?,1,1,'present','locally_deleted',0,?,'blocked_deleted','old','old','old')`,
          [`${title}.md`, `node-${title}`]);
          driver.execute(`INSERT INTO keep_import_item_cache (
            rule_id,source_path,title,source_mtime_ms,source_size_bytes,refreshed_at
          ) VALUES ('title-test',?,?,1,1,'old')`, [`${title}.md`, title]);
          driver.execute('INSERT INTO source_disposition_states VALUES (?,?,?,?,?)',
            ['readwise', 'title-test:.', title, 'hard_deleted', 'old']);
        }
        const api = load('database/readwiseApiSourceDispositions');
        api.writeReadwiseApiSourceDisposition(driver, 'connection', 'document-1', 'ChatGPT', 'hard_deleted', 'old');
        return {
          titles: load('database/readwiseLegacySourceDispositions').listReadwiseLegacySourceDispositions(driver)
            .map((item: { key: { originalTitle: string } }) => item.key.originalTitle),
          exact: api.readReadwiseApiSourceDisposition(driver, 'connection', 'document-1'),
          records: driver.queryOne('SELECT count(*) count FROM source_disposition_states').count
        };
      });
    });
    expect(result).toEqual({ titles: ['x'.repeat(20)], exact: 'hard_deleted', records: 4 });
  } finally {
    await session.close();
    await rm(stateRoot, { force: true, recursive: true });
  }
});
