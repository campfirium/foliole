import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  applyReadwiseRootPath,
  createDefaultImportManagerSettings
} from '../../lib/core/import/importManagerSettings';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const SOURCE_NAME = 'Partial Root Article.md';
const SOURCE_TITLE = 'Partial Root Article';

test('syncs an available Readwise category when other category directories are absent', async ({
  desktopWindow
}, testInfo) => {
  const readwiseRoot = testInfo.outputPath('readwise-root');
  const articleDirectory = path.join(readwiseRoot, 'Articles');
  const fullDocumentDirectory = path.join(
    readwiseRoot,
    'Full Document Contents',
    'Articles'
  );
  await mkdir(articleDirectory, { recursive: true });
  await mkdir(fullDocumentDirectory, { recursive: true });
  await writeFile(path.join(articleDirectory, SOURCE_NAME), '', 'utf8');
  await writeFile(
    path.join(fullDocumentDirectory, SOURCE_NAME),
    `# ${SOURCE_TITLE}\n\n## Full Document\n\nImported while optional category folders are absent.\n`,
    'utf8'
  );

  const settings = createDefaultImportManagerSettings();
  settings.readwiseRootPath = readwiseRoot;
  settings.readwiseReaderConfig = {
    ...settings.readwiseReaderConfig,
    enabled: true,
    validatedAt: new Date().toISOString()
  };
  settings.readwiseSources = applyReadwiseRootPath(settings.readwiseSources, readwiseRoot)
    .map((source) => ({ ...source, keepState: 'enabled' as const }));

  const result = await desktopWindow.evaluate(async (nextSettings) => {
    await window.electronAPI.invoke('save_import_manager_settings', { settings: nextSettings });
    return window.electronAPI.invoke('run_readwise_reader_import', { settings: nextSettings });
  }, settings);

  expect(result).toMatchObject({ imported_count: 1, status: 'completed' });
  await expectWorkspaceShell(desktopWindow);
  const snapshot = await desktopWindow.evaluate(() =>
    window.electronAPI.invoke('load_workspace_snapshot', {})
  );
  expect(Object.values(snapshot.nodesById).some((node) => node.title === SOURCE_TITLE)).toBe(true);
});
