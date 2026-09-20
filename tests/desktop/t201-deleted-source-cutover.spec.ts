import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';
import { createT178ApiAcceptanceSession } from './harness/t178ApiAcceptanceSession';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance/t201-deleted-source');

async function seedDeletedBook(app: ElectronApplication, root: string) {
  await app.evaluate((_electron, stateRoot) => {
    const moduleApi = process.getBuiltinModule('module')!;
    const pathApi = process.getBuiltinModule('path')!;
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const host = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseHostAssignment.js'));
    const identity = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseRemoteIdentity.js'));
    const secret = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseApiSecret.js'));
    const settings = require(pathApi.join(process.cwd(), 'dist/electron/import/importManagerSettings.js'));
    connection.runWithDatabaseConnectionOwner(() => {
      host.activateReadwiseOnThisHost();
      const hostName = host.loadReadwiseHostAssignment().current_host_name;
      const rule = settings.loadImportManagerSettings().readwiseSources.find(
        (item: { kind: string }) => item.kind === 'books');
      if (!rule) throw new Error('missing_readwise_books_rule');
      const secretRef = 'readwise-api-00000000-0000-4000-8000-000000000201.bin';
      secret.writeReadwiseApiSecret(secretRef, 't201-token');
      const source = identity.createReadwiseRemoteSource('2026-09-20T00:00:00.000Z');
      identity.saveReadwiseConnectionState({ secretRef, state: 'connected', verifiedAt: 'now' },
        source, '2026-09-20T00:00:00.000Z');
      const driver = connection.openDatabaseConnection().driver;
      driver.execute(`INSERT INTO desktop_sources
        (source_ref,source_type,config_ref,host_name,host_platform,root_path,path_flavor,
         type_settings_json,created_at,updated_at)
        VALUES (?,'readwise',?,?,?,?,?,?,'old','old')`, [
        `readwise:${rule.id}`, rule.id, hostName, process.platform,
        pathApi.join(stateRoot, 'legacy'), 'posix', JSON.stringify({ kind: 'books' })
      ]);
      driver.execute(`INSERT INTO keep_import_items
        (rule_id,source_path,source_mtime_ms,source_size_bytes,source_state,local_node_state,
         has_source_update,last_node_id,last_status,first_seen_at,last_seen_at,last_imported_at)
        VALUES (?,'Sample.md',1,1,'present','locally_deleted',0,'deleted-book',
          'blocked_deleted','old','old','old')`, [rule.id]);
      driver.execute(`INSERT INTO keep_import_item_cache
        (rule_id,source_path,title,content,source_mtime_ms,source_size_bytes,refreshed_at)
        VALUES (?,'Sample.md','Sample',?,1,1,'old')`, [rule.id,
        '[Download original file](https://readwise.io/reader/document_raw_content/33661889)']);
      driver.execute(`INSERT INTO source_disposition_states
        (source_kind,source_scope,original_title,disposition,updated_at)
        VALUES ('readwise',?,'Sample','hard_deleted','old')`, [`${rule.id}:.`]);
    });
  }, root);
}

function runDeletedBookCutover(app: ElectronApplication) {
  return app.evaluate(async () => {
    const moduleApi = process.getBuiltinModule('module')!;
    const pathApi = process.getBuiltinModule('path')!;
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const identity = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseRemoteIdentity.js'));
    const cutover = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseSourceCutover.js'));
    return connection.runWithDatabaseConnectionOwner(async () => {
      const document = {
        category: 'epub', html_content: '<p>Remote body.</p>', id: 'document-1',
        raw_source_url: 'https://bucket.s3.amazonaws.com/ParsedDocument33661889.epub',
        title: 'Sample'
      };
      const fetchImpl = async (input: string | URL | Request) => {
        const url = new URL(String(input));
        if (url.pathname === '/api/v2/export/') {
          return Response.json({ count: 0, nextPageCursor: null, results: [] });
        }
        return Response.json({ count: 1, nextPageCursor: null, results: [document] });
      };
      const run = await cutover.runReadwiseSourceCutover({
        dependencies: { fetchImpl, minIntervalMs: 0 }
      });
      const driver = connection.openDatabaseConnection().driver;
      const source = identity.loadReadwiseRemoteSource();
      const journal = JSON.parse(driver.queryOne(
        "SELECT value FROM settings WHERE key='readwise_source_cutover_v2'")?.value ?? '{}');
      return {
        run,
        documents: journal.documents,
        bound: driver.queryOne(
          "SELECT latest_node_id FROM import_sources WHERE remote_document_id='document-1'"),
        disposition: driver.queryOne(
          'SELECT disposition FROM source_disposition_states WHERE source_kind=? AND source_scope=?',
          ['readwise', `api/${source.connectionRef}/document-1`])
      };
    });
  });
}

// SKIP: acceptance limited to macOS Hidden Native | 2026-09-20 | revive: plan requires another host
test.skip(process.platform !== 'darwin' || process.env.FOLIOLE_ELECTRON_NATIVE_HIDDEN !== '1',
  'Deleted-source cutover acceptance runs only in macOS Hidden Native mode.');

test('keeps a permanently deleted legacy book suppressed during native API cutover', async ({ browserName }) => {
  void browserName;
  test.setTimeout(120_000);
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-t201-deleted-'));
  let session: Awaited<ReturnType<typeof createT178ApiAcceptanceSession>> | null = null;
  try {
    session = await createT178ApiAcceptanceSession(stateRoot);
    await expectWorkspaceShell(session.firstWindow);
    await seedDeletedBook(session.electronApp, stateRoot);
    const result = await runDeletedBookCutover(session.electronApp);
    expect(result.run).toMatchObject({ migrated_count: 0, status: 'completed' });
    expect(result.documents).toContainEqual({ nodeId: null, remoteId: 'document-1', status: 'suppressed' });
    expect(result.bound).toBeUndefined();
    expect(result.disposition).toEqual({ disposition: 'hard_deleted' });
    await mkdir(ARTIFACT_DIR, { recursive: true });
    await session.firstWindow.screenshot({ path: path.join(ARTIFACT_DIR, 'workspace-remains-open.png') });
  } finally {
    await session?.close();
    await rm(stateRoot, { force: true, recursive: true });
  }
});
