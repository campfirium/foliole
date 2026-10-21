import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ElectronApplication } from '@playwright/test';

import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';
import { createT178ApiAcceptanceSession, type T178AcceptanceSession } from './harness/t178ApiAcceptanceSession';

const artifactRoot = path.resolve('.tmp/artifacts/t320-desktop');

function documentFixture(): PreparedReadwiseApiDocument {
  return {
    annotations: [
      { content: 'alpha keyword\n※ PDF view note', contentHash: 'pdf-view', kind: 'highlight',
        locatorText: 'alpha keyword', parentRemoteId: 't320-pdf', remoteId: 'pdf-view', updatedAt: null },
      { content: 'enhanced text excerpt\n※ Text view note', contentHash: 'text-view', kind: 'highlight',
        locatorText: 'enhanced text excerpt', parentRemoteId: 't320-pdf', remoteId: 'text-view', updatedAt: null },
      { content: 'keyword\n※ Ambiguous note', contentHash: 'ambiguous', kind: 'highlight',
        locatorText: 'keyword', parentRemoteId: 't320-pdf', remoteId: 'ambiguous', updatedAt: null }
    ],
    body: 'Reader converted text', category: 'pdf', coverImageUrl: null, degradedReason: null,
    id: 't320-pdf', metadata: { author: null, category: 'pdf', readerUrl: null, sourceUrl: null,
      title: 'Readwise PDF restart' }, title: 'Readwise PDF restart', unmatchedAnnotationCount: 0, updatedAt: null
  };
}

async function importPdf(app: ElectronApplication, fixturePath: string) {
  const bytes = await readFile(fixturePath);
  return app.evaluate(async (_electron, fixture) => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection: typeof import('../../electron/database/connection') =
      require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const importer: typeof import('../../electron/import/readwiseApiDocumentCommit') =
      require(pathApi.join(process.cwd(), 'dist/electron/import/readwiseApiDocumentCommit.js'));
    const settings: typeof import('../../lib/core/import/readwiseReaderSettings') =
      require(pathApi.join(process.cwd(), 'dist/lib/core/import/readwiseReaderSettings.js'));
    const bytes = Buffer.from(fixture.base64, 'base64');
    const result = await importer.commitReadwiseApiDocument({
      config: settings.createDefaultReadwiseReaderConfig(), connectionRef: 't320-connection',
      destination: 'inbox', document: fixture.document,
      preparedResources: { epubImages: null, originalFile: { bytes, state: {
        attachmentId: fixture.hash, contentHash: fixture.hash, mimeType: 'application/pdf',
        reason: null, sizeBytes: bytes.byteLength, status: 'localized'
      } } }
    });
    if (result.status !== 'imported') throw new Error(`Import failed: ${result.status}`);
    return connection.runWithDatabaseConnectionOwner(() => {
      const row = connection.openDatabaseConnection().driver.queryOne<{ latest_node_id: string }>(
        'SELECT latest_node_id FROM import_sources WHERE remote_document_id = ?', ['t320-pdf']
      );
      if (!row) throw new Error('Imported PDF missing');
      return row.latest_node_id;
    });
  }, { base64: bytes.toString('base64'), document: documentFixture(),
    hash: createHash('sha256').update(bytes).digest('hex') });
}

async function readNotes(app: ElectronApplication) {
  return app.evaluate(() => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection: typeof import('../../electron/database/connection') =
      require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const body: typeof import('../../lib/core/database/nodeBodyResolution') =
      require(pathApi.join(process.cwd(), 'dist/lib/core/database/nodeBodyResolution.js'));
    const identity: typeof import('../../lib/core/readwise/readwiseApiImport') =
      require(pathApi.join(process.cwd(), 'dist/lib/core/readwise/readwiseApiImport.js'));
    return connection.runWithDatabaseConnectionOwner(() => ['pdf-view', 'text-view', 'ambiguous'].map((id) =>
      body.loadNodeBodyResolution(connection.openDatabaseConnection().driver,
        identity.stableReadwiseAnnotationNodeId('t320-connection', id)).content).sort());
  });
}

async function openAndVerify(session: T178AcceptanceSession, nodeId: string, stage: string, automatic: boolean) {
  const page = session.firstWindow;
  await expectWorkspaceShell(page);
  await page.evaluate(async (id) => {
    await window.__folioleWorkspaceDebug?.openNode?.(id);
  }, nodeId);
  const surface = page.getByTestId('pdf-document-surface');
  await expect(surface).toBeVisible();
  await expect(surface.locator('[data-pdf-page-state="ready"]').first()).toBeVisible();
  await expect(surface.locator('.textLayer').first()).toContainText('alpha keyword');
  await expect(surface.getByTestId('pdf-document-loading-overlay')).toHaveCount(0);
  if (!automatic) {
    await surface.hover({ position: { x: 400, y: 5 } });
    await surface.getByRole('button', { name: /^(Set zoom level|设置缩放级别)$/ }).click();
    await page.getByRole('menuitem', { name: '100%', exact: true }).click();
    await expect(surface.getByTestId('pdf-zoom-value')).toHaveText('100%');
    const pageInput = surface.getByRole('textbox', { name: /^(PDF page|PDF 页码)$/ });
    await pageInput.fill('1');
    await pageInput.press('Enter');
    await surface.getByTestId('pdf-scroll-container').hover();
    await page.mouse.wheel(0, -10000);
    await page.mouse.move(10, 500);
  }
  const highlights = surface.getByTestId('pdf-highlight-rect');
  await expect(highlights).toHaveCount(automatic ? 2 : 1);
  for (const highlight of await highlights.all()) await expect(highlight).toBeInViewport();
  const notes = await readNotes(session.electronApp);
  expect(notes).toEqual(['alpha keyword\n※ PDF view note', 'enhanced text excerpt\n※ Text view note', 'keyword\n※ Ambiguous note']);
  if (automatic) {
    await page.mouse.move(20, 500);
    await expect(surface.getByTestId('pdf-document-toolbar')).toHaveAttribute('data-toolbar-visible', 'false');
  }
  const pixels = await session.electronApp.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) throw new Error('Missing acceptance window');
    return (await window.webContents.capturePage(undefined, { stayAwake: true, stayHidden: true }))
      .toPNG().toString('base64');
  });
  await writeFile(path.join(artifactRoot, `${stage}.png`), Buffer.from(pixels, 'base64'));
}

for (const automatic of [false, true]) {
test(`Readwise PDF highlights survive restart with ${automatic ? 'automatic multiline' : 'free single-line'} view`, async ({ browserName }) => {
  void browserName;
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-t320-'));
  let session: T178AcceptanceSession | null = null;
  try {
    await mkdir(artifactRoot, { recursive: true });
    session = await createT178ApiAcceptanceSession(stateRoot);
    const nodeId = await importPdf(session.electronApp, `tests/desktop/fixtures/${automatic ? 'readwise-pdf-reading' : 'pdf-user-journey'}.pdf`);
    await session.firstWindow.reload();
    await openAndVerify(session, nodeId, `${automatic ? 'automatic' : 'free'}-before-restart`, automatic);
    await session.close();
    session = null;
    session = await createT178ApiAcceptanceSession(stateRoot);
    await openAndVerify(session, nodeId, `${automatic ? 'automatic' : 'free'}-after-restart`, automatic);
  } finally {
    await session?.close();
    await rm(stateRoot, { force: true, recursive: true });
  }
});
}
