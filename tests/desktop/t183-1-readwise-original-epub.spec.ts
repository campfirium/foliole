import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { createTestZip } from '../../electron/ipc/testZipBuilder';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';
import {
  createT178ApiAcceptanceSession,
  seedCompletedReadwiseApiMode,
  type T178AcceptanceSession
} from './harness/t178ApiAcceptanceSession';

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
    const runtime = globalThis as typeof globalThis & {
      __T183_EPUB_FETCH_COUNT__?: number;
    };
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
    const runtime = globalThis as typeof globalThis & {
      __T183_EPUB_FETCH_COUNT__?: number;
    };
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
        referenceCount: driver.queryOne(
          "SELECT COUNT(*) count FROM nodes n, json_each(n.resource_references) r WHERE n.id=? AND json_extract(r.value, '$.role')='reference'", [source.nodeId]
        ).count,
        state: JSON.parse(source.state)
      };
    });
  });
}

async function seedApiState(app: ElectronApplication) {
  await seedCompletedReadwiseApiMode(app, '2026-09-12T00:00:00.000Z');
  await app.evaluate(() => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const config = require(pathApi.join(process.cwd(), 'dist/lib/core/import/readwiseReaderSettings.js'));
    const identity = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseRemoteIdentity.js'));
    const materialization = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseApiMaterialization.js'));
    const secret = require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseApiSecret.js'));
    connection.runWithDatabaseConnectionOwner(() => {
      const now = '2026-09-12T00:00:00.000Z';
      const source = identity.createReadwiseRemoteSource(now);
      const secretRef = 'readwise-api-00000000-0000-4000-8000-000000000183.bin';
      secret.writeReadwiseApiSecret(secretRef, 't183-2-token');
      identity.saveReadwiseConnectionState({
        secretRef, state: 'connected', verifiedAt: now
      }, source, now);
      materialization.materializeReadwiseApiDocument({
        config: config.createDefaultReadwiseReaderConfig(),
        connectionRef: source.connectionRef,
        destination: 'inbox',
        document: {
          annotations: [], body: '# Reader Chapter\n\nReader HTML body.', category: 'epub',
          coverImageUrl: null, degradedReason: null,
          epubStructure: {
            degradedReason: null, imageCount: 0, markerCount: 1, rootBody: '',
            sections: [{ content: '# Reader Chapter\n\nReader HTML body.', headingLevel: 1,
              markerKey: 'reader', title: 'Reader Chapter' }]
          },
          id: 't183-book', metadata: { author: null, category: 'epub', readerUrl: null,
            sourceUrl: null, title: 'T183 Book' },
          title: 'T183 Book', unmatchedAnnotationCount: 0, updatedAt: now
        }
      });
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
    await expectWorkspaceShell(session.firstWindow);
    await seedApiState(session.electronApp);
    await expect.poll(() => inspect(session!.electronApp)).toMatchObject({
      childTitles: ['Reader Chapter'], fetchCount: 0, referenceCount: 0
    });
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
    await expect.poll(() => inspect(session!.electronApp)).toMatchObject({
      childTitles: ['Original Chapter'], fetchCount: 1, nodeId: before!.nodeId, referenceCount: 0,
      state: { bodyAuthority: 'original_epub', originalFile: null }
    });

    await session.firstWindow.reload();
    await session.firstWindow.waitForFunction(() => globalThis.__FOLIOLE_APP_READY_REPORTED__ === true);
    await (await openRebuildMenu(session, before!.nodeId)).click();
    await session.firstWindow.getByRole('button', { name: /^(Rebuild|重建)$/ }).click();
    await expect.poll(() => inspect(session!.electronApp)).toMatchObject({
      childTitles: ['Original Chapter'], fetchCount: 2, nodeId: before!.nodeId, referenceCount: 0,
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
