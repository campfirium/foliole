import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication, Page, TestInfo } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance/t182-1');
const ORIGINAL_FILE_PATH = path.resolve('tests/desktop/fixtures/pdf-user-journey.pdf');
const ORDINARY_IDS = ['t182-ordinary-one', 't182-ordinary-two'];
const PLACEHOLDER_CONTENT = [
  '# T182 Readwise Topic', '',
  'Full text of this document omitted because this document is a PDF', '',
  '[Download original file →](https://readwise.io/reader/document_raw_content/182)'
].join('\n');

type RuntimeFacts = {
  dialogCount: number;
  inventorySettingCount: number;
  readwiseDirectoryReadCount: number;
};

async function seedWorkspace(app: ElectronApplication, stateRoot: string) {
  const readwiseRoot = path.join(stateRoot, 'Readwise');
  const primaryPath = path.join(readwiseRoot, 'Full Document Contents', 'Articles');
  const highlightPath = path.join(readwiseRoot, 'Articles');
  const sourceName = 'T182 Readwise Topic.md';
  return app.evaluate(async (_electron, fixture) => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    const fsApi = process.getBuiltinModule('fs');
    if (!moduleApi || !pathApi || !fsApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const fingerprint = require(pathApi.join(process.cwd(), 'dist/lib/core/import/fingerprint.js'));
    const pipeline = require(pathApi.join(process.cwd(), 'dist/electron/database/importPipeline.js'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    const locations = require(pathApi.join(process.cwd(), 'dist/electron/database/desktopSources.js'));
    const settings = require(pathApi.join(process.cwd(), 'dist/electron/import/importManagerSettings.js'));
    const host = require(pathApi.join(process.cwd(), 'dist/electron/database/readwiseHostAssignment.js'));
    const electron = require('electron');
    await fsApi.promises.mkdir(fixture.primaryPath, { recursive: true });
    await fsApi.promises.mkdir(fixture.highlightPath, { recursive: true });
    const sourcePath = pathApi.join(fixture.primaryPath, fixture.sourceName);
    const highlightFile = pathApi.join(fixture.highlightPath, fixture.sourceName);
    const content = fixture.content;
    await fsApi.promises.writeFile(sourcePath, content, 'utf8');
    await fsApi.promises.writeFile(highlightFile, '# T182 Readwise Topic\n\n## Highlights\n- Govern database reads.', 'utf8');
    const imported = await connection.runWithDatabaseConnectionOwner(() => {
      settings.saveImportManagerSettings({
        ...settings.loadImportManagerSettings(),
        readwiseReaderConfig: { enabled: true, highlightsHeading: '## Highlights', importScope: 'full_document', validatedAt: null },
        readwiseRootPath: fixture.readwiseRoot,
        readwiseSources: [{ highlightMode: 'split', highlightPath: fixture.highlightPath, id: 't182-articles',
          keepPreview: null, keepState: 'enabled', kind: 'articles', primaryPath: fixture.primaryPath }]
      });
      const prepared = fingerprint.createPreparedDesktopTextImport({
        content, fileName: fixture.sourceName, filePath: sourcePath,
        importedAt: '2026-09-12T00:00:00.000Z', kind: 'markdown',
        sourceIdentity: 'readwise/articles/t182-topic', sourceLocator: sourcePath
      });
      const result = pipeline.runPreparedImport(prepared);
      locations.recordDesktopImportLocation({
        configRef: 't182-articles', location: fixture.sourceName,
        sourceFingerprint: prepared.sourceFingerprint, sourceType: 'readwise',
        updatedAt: '2026-09-12T00:00:00.000Z'
      });
      host.activateReadwiseOnThisHost();
      return result;
    });
    const originalReaddir = fsApi.promises.readdir.bind(fsApi.promises);
    globalThis.__t182ReadwiseGate = { dialogCount: 0, readwiseDirectoryReadCount: 0 };
    fsApi.promises.readdir = async (...args) => {
      if (String(args[0]).startsWith(fixture.readwiseRoot)) globalThis.__t182ReadwiseGate.readwiseDirectoryReadCount += 1;
      return originalReaddir(...args);
    };
    electron.dialog.showOpenDialog = async () => {
      globalThis.__t182ReadwiseGate.dialogCount += 1;
      return { canceled: false, filePaths: [fixture.originalPath] };
    };
    return imported.nodeId;
  }, { content: PLACEHOLDER_CONTENT, highlightPath, originalPath: ORIGINAL_FILE_PATH, primaryPath, readwiseRoot, sourceName });
}

async function openNode(page: Page, nodeId: string) {
  await expect.poll(() => page.evaluate((id) => window.__folioleWorkspaceDebug?.openNode?.(id), nodeId)).toBe(true);
}

async function readFacts(app: ElectronApplication): Promise<RuntimeFacts> {
  return app.evaluate(() => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(process.cwd(), 'package.json'));
    const connection = require(pathApi.join(process.cwd(), 'dist/electron/database/connection.js'));
    return connection.runWithDatabaseConnectionOwner(() => ({
      dialogCount: globalThis.__t182ReadwiseGate?.dialogCount ?? 0,
      inventorySettingCount: connection.openDatabaseConnection().driver.queryOne(
        "SELECT COUNT(*) count FROM settings WHERE key='readwise_books_inventory_state'"
      ).count,
      readwiseDirectoryReadCount: globalThis.__t182ReadwiseGate?.readwiseDirectoryReadCount ?? 0
    }));
  });
}

async function attachEvidence(testInfo: TestInfo, before: RuntimeFacts, after: RuntimeFacts) {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const target = path.join(ARTIFACT_DIR, 'readwise-action-gate.json');
  await writeFile(target, JSON.stringify({ after, before }, null, 2));
  await testInfo.attach('t182-1-readwise-action-gate', { contentType: 'application/json', path: target });
}

test('keeps ordinary switching and placeholder display inert until one original-file action', async (
  { desktopApp, desktopSession, desktopWindow },
  testInfo
) => {
  test.setTimeout(120_000);
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await desktopWindow.evaluate(async (ids) => window.__folioleWorkspaceDebug?.seedNodes?.(ids.map((id, index) => ({
    content: `# Ordinary ${index + 1}\n\nNo Readwise original file action.`, id, kind: 'topic', title: `Ordinary ${index + 1}`
  }))), ORDINARY_IDS);
  const readwiseNodeId = await seedWorkspace(desktopApp, desktopSession.target.runtimeStateRoot);
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await openNode(desktopWindow, ORDINARY_IDS[0]!);
  await openNode(desktopWindow, ORDINARY_IDS[1]!);
  await desktopWindow.locator(`[role="treeitem"][data-node-id="${readwiseNodeId}"]`).click();
  await expect(desktopWindow.locator('.cm-md-readwise-original-file')).toBeVisible();
  const before = await readFacts(desktopApp);
  expect(before).toEqual({ dialogCount: 0, inventorySettingCount: 0, readwiseDirectoryReadCount: 0 });

  await desktopWindow.getByRole('button', { name: /^(Load original file|加载原文件)$/ }).evaluate((button) => button.click());
  await expect(desktopWindow.getByRole('dialog', { name: /^(Choose reading mode|选择阅读模式)$/ })).toBeVisible({
    timeout: 30_000
  });
  await desktopWindow.getByRole('button', { name: /^(Free reading|自由阅读)/ }).click();
  await expect.poll(() => readFacts(desktopApp)).toMatchObject({ dialogCount: 1 });
  const after = await readFacts(desktopApp);
  expect(after.inventorySettingCount).toBe(0);
  expect(after.readwiseDirectoryReadCount).toBeGreaterThan(0);
  await attachEvidence(testInfo, before, after);
});

declare global {
  var __t182ReadwiseGate: { dialogCount: number; readwiseDirectoryReadCount: number } | undefined;
}
