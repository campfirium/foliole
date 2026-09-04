import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  applyReadwiseRootPath,
  createDefaultImportManagerSettings
} from '../../lib/core/import/importManagerSettings';
import type { NativeReadwiseImportRunResult } from '../../lib/platform/nativeImportContract';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const SOURCE_NAME = 'T175 Boundary.md';
const TITLE_TEXT = 'T175 Boundary';
const BODY_TEXT = 'Body target sentence.';

async function writeReadwiseFixture(readwiseRoot: string) {
  const articleDirectory = path.join(readwiseRoot, 'Articles');
  const fullDocumentDirectory = path.join(readwiseRoot, 'Full Document Contents', 'Articles');
  await mkdir(articleDirectory, { recursive: true });
  await mkdir(fullDocumentDirectory, { recursive: true });
  await writeFile(path.join(fullDocumentDirectory, SOURCE_NAME), [
    '## Metadata',
    '- Author: Boundary Test',
    '',
    '## Full Document',
    BODY_TEXT
  ].join('\n'), 'utf8');
  await writeFile(path.join(articleDirectory, SOURCE_NAME), [
    `# ${TITLE_TEXT}`,
    '',
    '## Highlights',
    TITLE_TEXT,
    '',
    BODY_TEXT
  ].join('\n'), 'utf8');
}

async function runReadwiseImport(desktopWindow: import('@playwright/test').Page, readwiseRoot: string) {
  const settings = createDefaultImportManagerSettings();
  settings.readwiseRootPath = readwiseRoot;
  settings.readwiseReaderConfig = {
    ...settings.readwiseReaderConfig,
    enabled: true,
    importScope: 'all',
    validatedAt: new Date().toISOString()
  };
  settings.readwiseSources = applyReadwiseRootPath(settings.readwiseSources, readwiseRoot)
    .map((source) => ({ ...source, keepState: 'enabled' as const }));
  let completed: NativeReadwiseImportRunResult | null = null;
  await expect.poll(async () => {
    try {
      completed = await desktopWindow.evaluate((nextSettings) => (
        window.electronAPI.invoke('run_readwise_reader_import', { settings: nextSettings })
      ), settings);
      return completed.status === 'completed';
    } catch (error) {
      if (error instanceof Error && error.message.includes('owned by another asynchronous transaction')) return false;
      throw error;
    }
  }, { timeout: 10_000 }).toBe(true);
  return completed;
}

test('shows a body highlight without highlighting the generated article title', async ({
  desktopApp,
  desktopWindow
}, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const readwiseRoot = testInfo.outputPath('readwise-root');
  await writeReadwiseFixture(readwiseRoot);
  expect(await runReadwiseImport(desktopWindow, readwiseRoot)).toMatchObject({ imported_count: 1, status: 'completed' });

  const libraryHome = await desktopApp.evaluate(() => process.env.FOLIOLE_LIBRARY_HOME ?? null);
  if (!libraryHome) throw new Error('missing isolated library home');
  const database = new DatabaseSync(path.join(libraryHome, 'Data', 'foliole.db'));
  const parent = database.prepare('SELECT id FROM nodes WHERE title = ? AND deleted_at IS NULL')
    .get(TITLE_TEXT) as { id: string } | undefined;
  if (!parent) throw new Error('missing imported article');
  const children = database.prepare(
    'SELECT content, anchor_link FROM nodes WHERE parent_id = ? AND deleted_at IS NULL ORDER BY created_at ASC'
  ).all(parent.id) as Array<{ anchor_link: string | null; content: string }>;
  database.close();

  expect(children).toHaveLength(2);
  expect(children.find((child) => child.content === TITLE_TEXT)?.anchor_link).toBeNull();
  expect(children.find((child) => child.content === BODY_TEXT)?.anchor_link).not.toBeNull();
  expect(await desktopWindow.evaluate((nodeId) => window.__folioleWorkspaceDebug?.openNode(nodeId), parent.id)).toBe(true);
  await expect(desktopWindow.locator('.prompt-editor-host .cm-md-highlight')).toContainText(BODY_TEXT);

  const visibleHighlights = await desktopWindow.locator(
    '.prompt-editor-host .cm-md-highlight, .prompt-editor-host .cm-md-highlight-overlap'
  ).allTextContents();
  expect(visibleHighlights).toEqual([BODY_TEXT]);
  await testInfo.attach('t175-5-visible-body-highlight', {
    body: await desktopWindow.locator('.prompt-editor-host').screenshot(),
    contentType: 'image/png'
  });
});
