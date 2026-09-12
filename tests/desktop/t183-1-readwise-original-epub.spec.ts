import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import { createTestZip } from '../../electron/ipc/testZipBuilder';

import { expect, test } from './harness/fixtures';
import { connectAndCutoverReadwiseApi, expectWorkspaceShell, openSettingsCategory } from './harness/settings';
import { createT178ApiAcceptanceSession, type T178AcceptanceSession } from './harness/t178ApiAcceptanceSession';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance/t183-1');

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
    clipboard.writeText('t183-1-token');
  }, originalEpubBase64());
}

async function inspect(app: ElectronApplication) {
  return app.evaluate(() => {
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
        nodeId: source.nodeId,
        state: JSON.parse(source.state)
      };
    });
  });
}

test('switches one Reader API EPUB to its original file and keeps it after reload', async ({ browserName }, testInfo) => {
  void browserName;
  test.setTimeout(120_000);
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-t183-1-'));
  let session: T178AcceptanceSession | null = null;
  try {
    session = await createT178ApiAcceptanceSession(stateRoot);
    await session.firstWindow.setViewportSize({ width: 1600, height: 1000 });
    await installFixture(session.electronApp);
    await expectWorkspaceShell(session.firstWindow);
    const settings = await openSettingsCategory(session.firstWindow, 'ReadwiseReader');
    await connectAndCutoverReadwiseApi(session.firstWindow, settings, 'inbox');
    await session.firstWindow.locator('[role="presentation"][aria-label="Settings"], [role="presentation"][aria-label="设置"]')
      .click({ position: { x: 5, y: 5 } });
    await expect.poll(() => inspect(session!.electronApp)).toMatchObject({ childTitles: ['Reader Chapter'] });

    const before = await inspect(session.electronApp);
    await session.firstWindow.locator('[data-node-id="special-inbox"]').first().click();
    const book = session.firstWindow.locator(`[role="treeitem"][data-node-id="${before!.nodeId}"]`);
    await book.click({ button: 'right' });
    await session.firstWindow.getByRole('menuitem', { name: /^(Use original EPUB|改用原始 EPUB)$/ }).click();
    await expect(session.firstWindow.getByText(/^(Original EPUB is now in use\.|已改用原始 EPUB。)$/)).toBeVisible();
    await expect.poll(() => inspect(session!.electronApp)).toMatchObject({
      childTitles: ['Original Chapter'], state: { bodyAuthority: 'original_epub', originalFile: { status: 'localized' } }
    });

    await session.firstWindow.reload();
    await session.firstWindow.waitForFunction(() => globalThis.__FOLIOLE_APP_READY_REPORTED__ === true);
    await expect.poll(() => inspect(session!.electronApp)).toMatchObject({
      childTitles: ['Original Chapter'], state: { bodyAuthority: 'original_epub' }
    });
    await mkdir(ARTIFACT_DIR, { recursive: true });
    const screenshot = path.join(ARTIFACT_DIR, `original-epub-${process.platform}.png`);
    await session.firstWindow.screenshot({ path: screenshot });
    await testInfo.attach('t183-1-original-epub', { contentType: 'image/png', path: screenshot });
  } finally {
    await session?.close();
    await rm(stateRoot, { force: true, recursive: true });
  }
});
