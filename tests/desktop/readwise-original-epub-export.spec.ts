import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { createTestZip } from '../../electron/ipc/testZipBuilder';

import { expect, test } from './harness/fixtures';
import { createT178ApiAcceptanceSession } from './harness/t178ApiAcceptanceSession';

const EPUB_BYTES = createTestZip([
  { content: 'application/epub+zip', name: 'mimetype' },
  { content: '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>', name: 'META-INF/container.xml' },
  { content: '<?xml version="1.0"?><package version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Export Book</dc:title></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>', name: 'OPS/book.opf' },
  { content: '<html><body><h1>Chapter</h1><p>Original EPUB body.</p></body></html>', name: 'OPS/chapter.xhtml' }
]);

async function seedReadwise(app: ElectronApplication) {
  await app.evaluate(({ clipboard }, epubBase64) => {
    const root = {
      category: 'epub', html_content: '<h1>Reader body</h1>', id: 'export-book',
      raw_source_url: 'https://bucket.s3.amazonaws.com/export-book.epub', title: 'Export Book',
      updated_at: '2026-09-12T00:00:00.000Z'
    };
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.hostname.endsWith('.amazonaws.com')) {
        return new Response(Buffer.from(epubBase64, 'base64'), {
          headers: { 'content-type': 'application/epub+zip' }, status: 200
        });
      }
      if (url.pathname === '/api/v2/auth/') return new Response(null, { status: 204 });
      if (url.pathname === '/api/v2/export/') return Response.json({ nextPageCursor: null, results: [] });
      const category = url.searchParams.get('category');
      return Response.json({ nextPageCursor: null, results: category === 'highlight' || category === 'note' ? [] : [root] });
    };
    clipboard.writeText('epub-export-token');
  }, EPUB_BYTES.toString('base64'));

  await app.evaluate(() => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const host = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseHostAssignment.js'));
    const identity = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseRemoteIdentity.js'));
    const cutover = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseSourceCutover.js'));
    const sourceMode = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseSourceMode.js'));
    const cutoverContract = require(pathApi.join(process.cwd(), 'dist/lib/core/readwise/readwiseSourceCutover.js'));
    const secret = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseApiSecret.js'));
    connection.runWithDatabaseConnectionOwner(() => {
      const now = '2026-09-12T00:00:00.000Z';
      const source = identity.createReadwiseRemoteSource(now);
      const secretRef = 'readwise-api-00000000-0000-4000-8000-000000000184.bin';
      secret.writeReadwiseApiSecret(secretRef, 'epub-export-token');
      identity.saveReadwiseConnectionState({ secretRef, state: 'connected', verifiedAt: now }, source, now);
      host.activateReadwiseOnThisHost();
      const sourceHost = host.loadReadwiseHostAssignment().current_host_name;
      cutover.writeReadwiseSourceCutover({
        annotations: [], cohortDocumentIds: [], completedAt: now,
        completionVersion: cutoverContract.READWISE_SOURCE_CUTOVER_COMPLETION_VERSION,
        documents: [], retiredNodeIds: [], sourceHost, startedAt: now, status: 'api'
      });
      sourceMode.writeReadwiseSourceMode(connection.openDatabaseConnection().driver, 'api', now, {
        batchId: null, completedAt: now, sourceHost, startedAt: now
      });
    });
  });
}

async function importBook(app: ElectronApplication) {
  return app.evaluate(async () => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const apiImport = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseApiImportRun.js'));
    const host = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseHostAssignment.js'));
    const sourceMode = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseSourceMode.js'));
    const apiConnection = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseApiConnectionState.js'));
    return connection.runWithDatabaseConnectionOwner(async () => {
      if (!host.canCurrentHostRunReadwise('api')) {
        throw new Error(`fixture_not_ready:${JSON.stringify({
          assignment: host.loadReadwiseHostAssignment(),
          connection: apiConnection.toPublicReadwiseApiConnection(),
          mode: sourceMode.loadReadwiseSourceModeState()
        })}`);
      }
      const result = await apiImport.runReadwiseApiImport();
      if (result.status !== 'completed') throw new Error(`import_failed:${JSON.stringify(result)}`);
      const row = connection.openDatabaseConnection().driver.queryOne(
        "SELECT latest_node_id id FROM import_sources WHERE remote_document_id='export-book'"
      );
      if (!row?.id) throw new Error('EPUB topic missing');
      return row.id as string;
    });
  });
}

test('exports a Readwise original EPUB after the save location is chosen', async ({ browserName }) => {
  void browserName;
  test.setTimeout(120_000);
  const stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-epub-export-e2e-'));
  const outputPath = path.join(stateRoot, 'Export Book.epub');
  const session = await createT178ApiAcceptanceSession(stateRoot);
  try {
    await seedReadwise(session.electronApp);
    const nodeId = await importBook(session.electronApp);
    await session.firstWindow.reload();
    await session.firstWindow.waitForFunction(() => globalThis.__FOLIOLE_APP_READY_REPORTED__ === true);
    await session.firstWindow.locator('[data-node-id="special-inbox"]').first().click();
    await session.firstWindow.locator(`[role="treeitem"][data-node-id="${nodeId}"]`).click({ button: 'right' });
    const action = session.firstWindow.getByRole('menuitem', { name: /Export original EPUB|导出原始 EPUB/ });
    await expect(action).toBeVisible();
    await session.firstWindow.screenshot({ path: path.resolve('.tmp/artifacts/readwise-original-epub-export-menu.png') });
    await session.electronApp.evaluate(({ dialog }, destination) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination });
    }, outputPath);
    await action.click();
    await expect.poll(async () => fs.readFile(outputPath).catch(() => null)).not.toBeNull();
    expect(await fs.readFile(outputPath)).toEqual(EPUB_BYTES);
  } finally {
    await session.close();
    await fs.rm(stateRoot, { force: true, recursive: true });
  }
});
