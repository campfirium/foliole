import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ElectronApplication, TestInfo } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { connectAndCutoverReadwiseApi, expectWorkspaceShell, openSettingsCategory } from './harness/settings';
import {
  createT178ApiAcceptanceSession,
  type T178AcceptanceSession
} from './harness/t178ApiAcceptanceSession';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance');

async function installFixture(desktopApp: ElectronApplication) {
  const pdfBase64 = (await readFile(path.resolve('tests/desktop/fixtures/pdf-user-journey.pdf'))).toString('base64');
  await desktopApp.evaluate(({ clipboard }, fixture) => {
    const documents = [
      { category: 'pdf', html_content: '<p>Localized PDF text</p>', id: 'pdf-local', title: 'Localized PDF',
        url: 'https://readwise.io/reader/read/pdf-local' },
      { category: 'epub', html_content: '<p>Readable EPUB text</p>', id: 'epub-html', title: 'HTML EPUB',
        url: 'https://readwise.io/reader/read/epub-html' },
      { category: 'pdf', html_content: null, id: 'pdf-unavailable', title: 'Unavailable PDF',
        source_url: 'https://example.com/unavailable', url: 'https://readwise.io/reader/read/pdf-unavailable' }
    ];
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.hostname.endsWith('.amazonaws.com')) {
        if (new Headers(init?.headers).has('authorization')) throw new Error('token_leaked_to_raw_source');
        return new Response(Buffer.from(fixture.pdfBase64, 'base64'), {
          headers: { 'content-type': 'application/pdf' }, status: 200
        });
      }
      if (url.pathname === '/api/v2/auth/') return new Response(null, { status: 204 });
      if (url.pathname === '/api/v2/export/') return Response.json({ nextPageCursor: null, results: [] });
      const id = url.searchParams.get('id');
      const results = id ? documents.filter((document) => document.id === id).map((document) => ({
        ...document,
        raw_source_url: id === 'pdf-local' ? 'https://bucket.s3.amazonaws.com/current.pdf?signature=transient' : null
      })) : documents;
      return Response.json({ nextPageCursor: null, results });
    };
    clipboard.writeText('t178-6-token');
  }, { pdfBase64 });
}

async function configureAndImport(session: T178AcceptanceSession) {
  await expectWorkspaceShell(session.firstWindow);
  const settings = await openSettingsCategory(session.firstWindow, 'ReadwiseReader');
  await connectAndCutoverReadwiseApi(session.firstWindow, settings);
  await settings.getByRole('radio', { name: /^(Inbox|收件箱)$/ }).last().click();
  await settings.getByRole('button', { name: /^(Preview import|预览导入)$/ }).click();
  const preview = session.firstWindow.getByRole('dialog', { name: /^(Readwise import preview|Readwise 导入预览)$/ });
  await expect(preview.getByText('Localized PDF')).toBeVisible();
  await expect(preview.getByText('HTML EPUB')).toBeVisible();
  await expect(preview.getByText('Unavailable PDF')).toBeVisible();
  await preview.getByRole('button', { name: /^(Import|导入)$/ }).click();
  await expect(preview).toHaveCount(0);
  await session.firstWindow.locator('[role="presentation"][aria-label="Settings"], [role="presentation"][aria-label="设置"]')
    .click({ position: { x: 5, y: 5 } });
}

async function inspect(desktopApp: ElectronApplication) {
  return desktopApp.evaluate(() => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    return connection.runWithDatabaseConnectionOwner(() => {
      const driver = connection.openDatabaseConnection().driver;
      const rows = driver.queryAll(`SELECT latest_node_id nodeId, remote_document_id id, remote_import_state_json state
        FROM import_sources WHERE remote_document_id IN ('pdf-local','epub-html','pdf-unavailable') ORDER BY id`);
      return {
        attachmentCount: driver.queryOne("SELECT COUNT(*) count FROM attachments WHERE mime_type='application/pdf'").count,
        rows: rows.map((row) => ({ id: row.id, nodeId: row.nodeId, state: JSON.parse(row.state).originalFile })),
        signedUrlCount: rows.filter((row) => row.state.includes('amazonaws.com')).length,
        syncAttachmentCount: driver.queryOne(
          `SELECT COUNT(*) count FROM sync_object_state WHERE object_type='attachment'
           AND object_id IN (SELECT id FROM attachments WHERE mime_type='application/pdf')`
        ).count
      };
    });
  });
}

async function waitForInspection(desktopApp: ElectronApplication) {
  let latest: Awaited<ReturnType<typeof inspect>> | undefined;
  await expect(async () => {
    latest = await inspect(desktopApp);
    expect(latest).toMatchObject({
      attachmentCount: 1, signedUrlCount: 0, syncAttachmentCount: 1,
      rows: [
        { id: 'epub-html', state: { status: 'html_only' } },
        { id: 'pdf-local', state: { status: 'localized' } },
        { id: 'pdf-unavailable', state: { status: 'unavailable' } }
      ]
    });
  }).toPass({ intervals: [100, 250, 500], timeout: 10_000 });
  if (!latest) throw new Error('Readwise original-file state was not available.');
  return latest;
}

async function capture(session: T178AcceptanceSession, testInfo: TestInfo) {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const target = path.join(ARTIFACT_DIR, `t178-6-readwise-original-${process.platform}.png`);
  await session.firstWindow.getByLabel(/^(Document area|文档区域)$/).screenshot({ path: target });
  await testInfo.attach('t178-6-readwise-original', { contentType: 'image/png', path: target });
}

test('localizes a PDF and keeps explicit EPUB/PDF degradation without signed URLs', async ({ browserName }, testInfo) => {
  void browserName;
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-t178-6-'));
  let session: T178AcceptanceSession | null = null;
  try {
    session = await createT178ApiAcceptanceSession(stateRoot);
    await session.firstWindow.setViewportSize({ width: 1600, height: 1000 });
    await installFixture(session.electronApp);
    await configureAndImport(session);

    await session.firstWindow.reload();
    await session.firstWindow.waitForFunction(() => globalThis.__FOLIOLE_APP_READY_REPORTED__ === true);
    await expectWorkspaceShell(session.firstWindow);
    const imported = await waitForInspection(session.electronApp);
    const nodeId = (id: string) => imported.rows.find((row) => row.id === id)?.nodeId;
    await session.firstWindow.locator('[role="treeitem"][data-node-id="special-inbox"]').click();
    await session.firstWindow.locator(`[role="treeitem"][data-node-id="${nodeId('pdf-local')}"]`).click();
    await expect(session.firstWindow.getByTestId('pdf-document-surface')).toBeVisible();
    await session.firstWindow.locator(`[role="treeitem"][data-node-id="${nodeId('epub-html')}"]`).click();
    await expect(session.firstWindow.getByText('Readable EPUB text')).toBeVisible();
    await session.firstWindow.locator(`[role="treeitem"][data-node-id="${nodeId('pdf-unavailable')}"]`).click();
    await expect(session.firstWindow.getByText(/original PDF was not synced/i)).toBeVisible();
    await capture(session, testInfo);

  } finally {
    await session?.close();
    await rm(stateRoot, { force: true, recursive: true });
  }
});
