import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { createDefaultImportManagerSettings } from '../../lib/core/import/importManagerSettings';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';
import {
  createT178ApiAcceptanceSession,
  type T178AcceptanceSession
} from './harness/t178ApiAcceptanceSession';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance/t178-18');

async function installApiTransport(app: ElectronApplication) {
  await app.evaluate(() => {
    const documents = [
      { id: 'manual-article', title: 'Manual API Article', author: 'Writer', category: 'article' },
      { id: 'manual-book', title: 'Manual API Book', author: 'Writer', category: 'epub' },
      { id: 'old-suppressed', title: 'Suppressed Article', author: 'Writer', category: 'article' }
    ];
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/v2/export/') {
        return Response.json({ results: [], nextPageCursor: null });
      }
      const id = url.searchParams.get('id');
      const values = documents.filter((item) => id
        ? item.id === id
        : item.category === url.searchParams.get('category'));
      return Response.json({
        nextPageCursor: null,
        results: values.map((item) => ({
          ...item,
          created_at: item.id === 'old-suppressed' ? '2000-01-01T00:00:00Z' : '2099-01-01T00:00:00Z',
          ...(url.searchParams.has('withHtmlContent') ? {
            html_content: item.category === 'epub'
              ? '<h1 data-rw-epub-toc="chapter">Chapter One</h1><p>Book body</p>'
              : '<p>Article body</p>'
          } : {})
        }))
      });
    };
  });
}

async function seedFolder(page: Page, stateRoot: string) {
  const sourceRoot = path.join(stateRoot, 'Readwise');
  const primary = path.join(sourceRoot, 'Full Document Contents', 'Articles');
  const highlights = path.join(sourceRoot, 'Articles');
  await mkdir(primary, { recursive: true });
  await mkdir(highlights, { recursive: true });
  await writeFile(
    path.join(primary, 'Manual Folder Article.md'),
    '# Manual Folder Article\n## Metadata\n- Author: Writer\n## Full Document\nReadable text.'
  );
  const defaults = createDefaultImportManagerSettings();
  const settings = {
    ...defaults,
    readwiseAutoImportPolicy: {
      ...defaults.readwiseAutoImportPolicy,
      articleWithoutHighlights: 'off'
    },
    readwiseReaderConfig: {
      ...defaults.readwiseReaderConfig,
      enabled: true,
      validatedAt: '2026-09-10T00:00:00Z'
    },
    readwiseRootPath: sourceRoot,
    readwiseSources: [{
      highlightMode: 'split',
      highlightPath: highlights,
      id: 'articles',
      keepState: 'enabled',
      kind: 'articles',
      primaryPath: primary
    }]
  };
  await expect.poll(async () => {
    try {
      await page.evaluate(async (nextSettings) => {
        await window.electronAPI.invoke('save_import_manager_settings', { settings: nextSettings });
        await window.electronAPI.invoke('run_readwise_reader_import');
      }, settings);
      return 'completed';
    } catch (error) {
      if (String(error).includes('sqlite connection is owned')) return 'waiting';
      throw error;
    }
  }, { timeout: 30_000 }).toBe('completed');
}

async function seedApi(app: ElectronApplication) {
  await installApiTransport(app);
  await app.evaluate(async (_electron, cwd) => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(cwd, 'package.json'));
    const connection = require(pathApi.join(cwd, 'dist/electron/database/connection.js'));
    const hostSettings = require(pathApi.join(cwd, 'dist/lib/core/import/readwiseHostSettings.js'));
    const identity = require(pathApi.join(cwd, 'dist/electron/database/readwiseRemoteIdentity.js'));
    const secret = require(pathApi.join(cwd, 'dist/electron/import/readwiseApiSecret.js'));
    const cutover = require(pathApi.join(cwd, 'dist/electron/database/readwiseSourceCutover.js'));
    return connection.runWithDatabaseConnectionOwner(() => {
      const source = identity.createReadwiseRemoteSource('2026-09-10T00:00:00Z');
      const settings = hostSettings.createDefaultReadwiseHostSettings();
      const secretRef = 'readwise-api-00000000-0000-4000-8000-000000000018.bin';
      secret.writeReadwiseApiSecret(secretRef, 't178-18-token');
      identity.saveReadwiseConnectionState({
        ...settings,
        apiConnection: { secretRef, state: 'connected', verifiedAt: '2026-09-10T00:00:00Z' },
        readwiseSourceMode: 'api'
      }, source, '2026-09-10T00:00:00Z');
      cutover.writeReadwiseSourceCutover({
        annotations: [],
        cohortDocumentIds: ['old-suppressed'],
        completedAt: '2026-09-10T00:00:00Z',
        documents: [{ remoteId: 'old-suppressed', nodeId: null, status: 'suppressed' }],
        retiredNodeIds: [],
        sourceHost: 'Test host',
        startedAt: '2026-09-10T00:00:00Z',
        status: 'api'
      });
    });
  }, process.cwd());
}

async function readRuntimeFacts(app: ElectronApplication) {
  return app.evaluate((_electron, cwd) => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(cwd, 'package.json'));
    const connection = require(pathApi.join(cwd, 'dist/electron/database/connection.js'));
    return connection.runWithDatabaseConnectionOwner(() => {
      const driver = connection.openDatabaseConnection().driver;
      return {
        database: connection.openDatabaseConnection().dbPath,
        externalCount: driver.queryOne('SELECT COUNT(*) count FROM external_documents WHERE is_present=1'),
        imported: driver.queryAll(
          "SELECT title FROM nodes WHERE parent_id='special-inbox' AND deleted_at IS NULL ORDER BY title"
        ),
        stageCount: driver.queryOne('SELECT COUNT(*) count FROM readwise_api_import_stage')
      };
    });
  }, process.cwd());
}

test('searches local metadata and adopts folder, Off, and External sources once', async ({ browserName }, testInfo) => {
  void browserName;
  test.setTimeout(120_000);
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-t178-18-'));
  let session: T178AcceptanceSession | null = null;
  try {
    session = await createT178ApiAcceptanceSession(stateRoot);
    await expectWorkspaceShell(session.firstWindow);
    const initialFacts = await readRuntimeFacts(session.electronApp);
    expect(initialFacts.database.startsWith(`${stateRoot}${path.sep}`)).toBe(true);
    expect(initialFacts.database).not.toBe('/Users/roamer/Documents/Foliole/Data/foliole.db');

    await seedFolder(session.firstWindow, stateRoot);
    await session.firstWindow.reload();
    let dialog = await openSettingsCategory(session.firstWindow, 'ReadwiseReader');
    let search = dialog.getByRole('searchbox', { name: /Search by title or author|搜索标题或作者/ });
    await expect(search).toBeEnabled();
    await expect(dialog.getByText(/^(No matches|没有匹配结果)$/)).toHaveCount(0);
    await search.fill('Writer');
    await expect(dialog.getByText('Manual Folder Article', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: /^(Import|导入)$/ }).click();
    await expect(dialog.getByRole('button', { name: /^(Imported|已导入)$/ })).toBeDisabled();
    await session.firstWindow.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await seedApi(session.electronApp);
    await session.firstWindow.reload();
    dialog = await openSettingsCategory(session.firstWindow, 'ReadwiseReader');
    search = dialog.getByRole('searchbox', { name: /Search by title or author|搜索标题或作者/ });
    await expect(search).toBeEnabled({ timeout: 45_000 });
    await search.fill('Writer');
    await expect(dialog.getByText('Manual API Article', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Manual API Book', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Cannot import again|不可重复导入/ })).toBeDisabled();
    await mkdir(ARTIFACT_DIR, { recursive: true });
    const matchesPath = path.join(ARTIFACT_DIR, 'search-results.png');
    await dialog.getByRole('region', { name: /^(Manual import|手动导入)$/ }).screenshot({ path: matchesPath });
    await testInfo.attach('manual-search-results', { contentType: 'image/png', path: matchesPath });

    for (let imported = 0; imported < 2; imported += 1) {
      await dialog.getByRole('button', { name: /^(Import|导入)$/ }).first().click();
      await expect(dialog.getByRole('button', { name: /^(Imported|已导入)$/ })).toHaveCount(imported + 1);
    }
    const finalFacts = await readRuntimeFacts(session.electronApp);
    expect(finalFacts).toMatchObject({ externalCount: { count: 0 }, stageCount: { count: 0 } });
    expect(finalFacts.imported).toEqual(expect.arrayContaining([
      { title: 'Manual Folder Article' },
      { title: 'Manual API Article' },
      { title: 'Manual API Book' }
    ]));
    const importedPath = path.join(ARTIFACT_DIR, 'imported-results.png');
    await dialog.getByRole('region', { name: /^(Manual import|手动导入)$/ }).screenshot({ path: importedPath });
    await testInfo.attach('manual-imported-results', { contentType: 'image/png', path: importedPath });
    await writeFile(path.join(ARTIFACT_DIR, 'runtime-facts.json'), JSON.stringify(finalFacts, null, 2));
  } finally {
    await session?.close().catch(() => undefined);
    await rm(stateRoot, { force: true, recursive: true });
  }
});
