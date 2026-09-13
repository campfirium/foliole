import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { createTestZip } from '../../electron/ipc/testZipBuilder';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';
import { createT178ApiAcceptanceSession, type T178AcceptanceSession } from './harness/t178ApiAcceptanceSession';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance/t183-2');

function originalEpubBase64() {
  return createTestZip([
    { content: 'application/epub+zip', name: 'mimetype' },
    {
      content: '<?xml version="1.0"?><container version="1.0"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      name: 'META-INF/container.xml'
    },
    {
      content: '<?xml version="1.0"?><package version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Original Book</dc:title></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>',
      name: 'OPS/book.opf'
    },
    {
      content: '<html><head><title>Original Chapter</title></head><body><h1>Original Chapter</h1><p>Original body survives reload.</p></body></html>',
      name: 'OPS/chapter.xhtml'
    }
  ]).toString('base64');
}

async function installFixture(app: ElectronApplication) {
  await app.evaluate(({ clipboard }, epubBase64) => {
    const runtime = globalThis as typeof globalThis & { __T183_EPUB_FETCH_COUNT__?: number };
    runtime.__T183_EPUB_FETCH_COUNT__ = 0;
    const root = {
      category: 'epub',
      html_content: '<h1 data-rw-epub-toc="reader">Reader Chapter</h1><p>Reader HTML body.</p>',
      id: 't183-book',
      raw_source_url: 'https://bucket.s3.amazonaws.com/t183-book.epub?signature=transient',
      title: 'T183 Book',
      updated_at: '2026-09-12T00:00:00.000Z'
    };
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.hostname.endsWith('.amazonaws.com')) {
        runtime.__T183_EPUB_FETCH_COUNT__ = (runtime.__T183_EPUB_FETCH_COUNT__ ?? 0) + 1;
        if (new Headers(init?.headers).has('authorization')) throw new Error('token_leaked_to_raw_source');
        return new Response(Buffer.from(epubBase64, 'base64'), {
          headers: { 'content-type': 'application/epub+zip' }, status: 200
        });
      }
      if (url.pathname === '/api/v2/auth/') return new Response(null, { status: 204 });
      if (url.pathname === '/api/v2/export/') return Response.json({ nextPageCursor: null, results: [] });
      const category = url.searchParams.get('category');
      const results = category === 'highlight' || category === 'note' ? [] : [root];
      return Response.json({ nextPageCursor: null, results });
    };
    clipboard.writeText('t183-2-token');
  }, originalEpubBase64());
}

async function inspect(app: ElectronApplication) {
  return app.evaluate(() => {
    const runtime = globalThis as typeof globalThis & { __T183_EPUB_FETCH_COUNT__?: number };
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    return connection.runWithDatabaseConnectionOwner(() => {
      const driver = connection.openDatabaseConnection().driver;
      const source = driver.queryOne(`SELECT latest_node_id nodeId, remote_import_state_json state
        FROM import_sources WHERE remote_document_id='t183-book'`);
      if (!source) return null;
      return {
        childTitles: driver.queryAll('SELECT title FROM nodes WHERE parent_id=? AND deleted_at IS NULL ORDER BY title',
          [source.nodeId]).map((row) => row.title),
        fetchCount: runtime.__T183_EPUB_FETCH_COUNT__ ?? 0,
        nodeId: source.nodeId,
        state: JSON.parse(source.state)
      };
    });
  });
}

async function seedApiState(app: ElectronApplication) {
  await app.evaluate(() => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const host = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseHostAssignment.js'));
    const hostSettings = require(pathApi.join(process.cwd(), 'dist/lib/core/import/readwiseHostSettings.js'));
    const identity = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseRemoteIdentity.js'));
    const secret = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseApiSecret.js'));
    const cutover = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseSourceCutover.js'));
    connection.runWithDatabaseConnectionOwner(() => {
      const now = '2026-09-12T00:00:00.000Z';
      const assignment = host.activateReadwiseOnThisHost();
      const source = identity.createReadwiseRemoteSource(now);
      const settings = hostSettings.createDefaultReadwiseHostSettings();
      const secretRef = 'readwise-api-00000000-0000-4000-8000-000000000183.bin';
      secret.writeReadwiseApiSecret(secretRef, 't183-2-token');
      identity.saveReadwiseConnectionState({
        ...settings,
        apiConnection: { secretRef, state: 'connected', verifiedAt: now },
        readwiseSourceMode: 'api'
      }, source, now);
      cutover.writeLegacyReadwiseSourceCutover({
        completedAt: now, completedCandidateCount: 0, migratedCount: 0,
        sourceHost: assignment.current_host_name, startedAt: now, status: 'api',
        totalCandidateCount: 0, unmatchedCount: 0
      });
    });
  });
}

async function importReaderFixture(app: ElectronApplication) {
  await app.evaluate(async () => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const apiImport = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseApiImportRun.js'));
    await connection.runWithDatabaseConnectionOwner(async () => {
      const importResult = await apiImport.runReadwiseApiImport();
      if (importResult.status !== 'completed') throw new Error(`import_failed:${JSON.stringify(importResult)}`);
    });
  });
}

async function openRebuildMenu(session: T178AcceptanceSession, nodeId: string) {
  await session.firstWindow.locator('[data-node-id="special-inbox"]').first().click();
  await session.firstWindow.locator(`[role="treeitem"][data-node-id="${nodeId}"]`).click({ button: 'right' });
  const item = session.firstWindow.getByRole('menuitem', { name: /^(Rebuild from EPUB|从 EPUB 重建)$/ });
  await expect(item).toBeVisible();
  return item;
}

test('confirms and repeatedly rebuilds one Reader API book from EPUB', async ({ browserName }, testInfo) => {
  void browserName;
  test.setTimeout(120_000);
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-t183-2-'));
  let session: T178AcceptanceSession | null = null;
  try {
    session = await createT178ApiAcceptanceSession(stateRoot);
    await session.firstWindow.setViewportSize({ width: 1600, height: 1000 });
    await installFixture(session.electronApp);
    await seedApiState(session.electronApp);
    await expectWorkspaceShell(session.firstWindow);
    await importReaderFixture(session.electronApp);
    await expect.poll(() => inspect(session!.electronApp)).toMatchObject({ childTitles: ['Reader Chapter'] });
    await session.firstWindow.reload();
    await session.firstWindow.waitForFunction(() => globalThis.__FOLIOLE_APP_READY_REPORTED__ === true);

    const before = await inspect(session.electronApp);
    const menuItem = await openRebuildMenu(session, before!.nodeId);
    await mkdir(ARTIFACT_DIR, { recursive: true });
    const menuScreenshot = path.join(ARTIFACT_DIR, `rebuild-menu-${process.platform}.png`);
    await session.firstWindow.screenshot({ path: menuScreenshot });
    await testInfo.attach('t183-2-rebuild-menu', { contentType: 'image/png', path: menuScreenshot });
    await menuItem.click();
    await expect(session.firstWindow.getByRole('dialog')).toContainText(/Rebuild from EPUB|从 EPUB 重建/u);
    await session.firstWindow.getByRole('button', { name: /^(Cancel|取消)$/ }).click();
    await expect.poll(() => inspect(session!.electronApp)).toMatchObject({
      childTitles: ['Reader Chapter'], fetchCount: 0
    });

    await (await openRebuildMenu(session, before!.nodeId)).click();
    const dialogScreenshot = path.join(ARTIFACT_DIR, `rebuild-confirmation-${process.platform}.png`);
    await session.firstWindow.screenshot({ path: dialogScreenshot });
    await testInfo.attach('t183-2-rebuild-confirmation', { contentType: 'image/png', path: dialogScreenshot });
    await session.firstWindow.getByRole('button', { name: /^(Rebuild|重建)$/ }).click();
    await expect(session.firstWindow.getByText(/^(Rebuilt from EPUB\.|已从 EPUB 重建。)$/)).toBeVisible();
    await expect.poll(() => inspect(session!.electronApp)).toMatchObject({
      childTitles: ['Original Chapter'], fetchCount: 1, nodeId: before!.nodeId,
      state: { bodyAuthority: 'original_epub', originalFile: { status: 'localized' } }
    });

    await session.firstWindow.reload();
    await session.firstWindow.waitForFunction(() => globalThis.__FOLIOLE_APP_READY_REPORTED__ === true);
    await (await openRebuildMenu(session, before!.nodeId)).click();
    await session.firstWindow.getByRole('button', { name: /^(Rebuild|重建)$/ }).click();
    await expect.poll(() => inspect(session!.electronApp)).toMatchObject({
      childTitles: ['Original Chapter'], fetchCount: 2, nodeId: before!.nodeId,
      state: { bodyAuthority: 'original_epub' }
    });
    const screenshot = path.join(ARTIFACT_DIR, `repeated-rebuild-${process.platform}.png`);
    await session.firstWindow.screenshot({ path: screenshot });
    await testInfo.attach('t183-2-repeated-rebuild', { contentType: 'image/png', path: screenshot });
  } finally {
    await session?.close();
    await rm(stateRoot, { force: true, recursive: true });
  }
});
