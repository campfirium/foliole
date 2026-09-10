import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import type { ElectronApplication, Locator, TestInfo } from '@playwright/test';

import { createDefaultImportManagerSettings } from '../../lib/core/import/importManagerSettings';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';
import {
  createT178ApiAcceptanceSession,
  type T178AcceptanceSession
} from './harness/t178ApiAcceptanceSession';

const ARTIFACT_DIR = path.resolve('.tmp/artifacts/desktop-acceptance');
const POLICY = {
  articleWithHighlights: 'inbox', articleWithoutHighlights: 'off',
  bookWithHighlights: 'external', bookWithoutHighlights: 'inbox', version: 1
} as const;

async function captureMatrix(dialog: Locator, testInfo: TestInfo, name: string) {
  const matrix = dialog.getByRole('group', {
    name: /^(Readwise automatic import|Readwise 自动导入)$/
  });
  await expect(matrix).toBeVisible();
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const target = path.join(ARTIFACT_DIR, `${name}-${process.platform}.png`);
  await matrix.screenshot({ path: target });
  await testInfo.attach(name, { contentType: 'image/png', path: target });
}

async function createFolderSettings(root: string) {
  const articles = path.join(root, 'Full Document Contents', 'Articles');
  const articleHighlights = path.join(root, 'Articles');
  const books = path.join(root, 'Full Document Contents', 'Books');
  const bookHighlights = path.join(root, 'Books');
  for (const directory of [articles, articleHighlights, books, bookHighlights]) {
    await mkdir(directory, { recursive: true });
  }
  await writeFile(path.join(articles, 'Article Highlighted.md'), '# Article Highlighted\n\narticle quote\n');
  await writeFile(path.join(articleHighlights, 'Article Highlighted.md'), '# Article Highlighted\n\n## Highlights\narticle quote\n');
  await writeFile(path.join(articles, 'Article Plain.md'), '# Article Plain\n\nplain article\n');
  await writeFile(path.join(books, 'Book Highlighted.md'), [
    '# Book Highlighted', '## Metadata', '- Download URL: https://readwise.example/book-highlighted.epub',
    '## Full Document', 'Full text omitted because this document is an EPUB.'
  ].join('\n'));
  await writeFile(path.join(bookHighlights, 'Book Highlighted.md'), '# Book Highlighted\n\n## Highlights\nbook quote\n');
  await writeFile(path.join(books, 'Book Plain.md'), [
    '# Book Plain', '## Metadata', '- Download URL: https://readwise.example/book-plain.epub',
    '## Full Document', 'Full text omitted because this document is an EPUB.'
  ].join('\n'));
  await writeFile(path.join(bookHighlights, 'Book Plain.md'), '# Book Plain\n\n## Highlights\n');
  const next = createDefaultImportManagerSettings();
  return { ...next, readwiseAutoImportPolicy: POLICY,
    readwiseReaderConfig: { ...next.readwiseReaderConfig, enabled: true,
      validatedAt: '2026-09-10T00:00:00.000Z' }, readwiseRootPath: root,
    readwiseSources: [
      { highlightMode: 'split' as const, highlightPath: articleHighlights, id: 'articles',
        keepState: 'enabled' as const, kind: 'articles' as const, primaryPath: articles },
      { highlightMode: 'split' as const, highlightPath: bookHighlights, id: 'books',
        keepState: 'enabled' as const, kind: 'books' as const, primaryPath: books }
    ] };
}

async function installApiFixture(app: ElectronApplication) {
  await app.evaluate(() => {
    const documents = {
      'api-article-highlighted': { category: 'article', title: 'API Article Highlighted' },
      'api-article-plain': { category: 'article', title: 'API Article Plain' },
      'api-book-highlighted': { category: 'epub', title: 'API Book Highlighted' },
      'api-book-plain': { category: 'epub', title: 'API Book Plain' }
    } as const;
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/v2/export/') return Response.json({ nextPageCursor: null, results: [
        { external_id: 'api-article-highlighted', highlights: [{ external_id: 'api-highlight-a', text: 'article quote' }], source: 'reader' },
        { external_id: 'api-book-highlighted', highlights: [{ external_id: 'api-highlight-b', text: 'book quote' }], source: 'reader' }
      ] });
      const id = url.searchParams.get('id');
      if (id?.startsWith('api-highlight-')) return Response.json({ results: [{
        category: 'highlight', id, parent_id: id.endsWith('a') ? 'api-article-highlighted' : 'api-book-highlighted'
      }] });
      if (id && id in documents) {
        const item = documents[id as keyof typeof documents];
        return Response.json({ results: [{ ...item, id,
          ...(url.searchParams.has('withHtmlContent') ? { html_content: `<p>${item.title} body</p>` } : {}) }] });
      }
      const category = url.searchParams.get('category');
      const result = category === 'article' ? [{ ...documents['api-article-plain'], id: 'api-article-plain' }]
        : category === 'epub' ? [{ ...documents['api-book-plain'], id: 'api-book-plain' }] : [];
      return Response.json({ nextPageCursor: null, results: result });
    };
  });
}

async function runApiFixture(app: ElectronApplication) {
  await app.evaluate(async (_electron, input) => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(input.cwd, 'package.json'));
    const connection = require(pathApi.join(input.cwd, 'dist/electron/database/connection.js'));
    const hostSettings = require(pathApi.join(input.cwd, 'dist/lib/core/import/readwiseHostSettings.js'));
    const identity = require(pathApi.join(input.cwd, 'dist/electron/database/readwiseRemoteIdentity.js'));
    const secret = require(pathApi.join(input.cwd, 'dist/electron/import/readwiseApiSecret.js'));
    const cutover = require(pathApi.join(input.cwd, 'dist/electron/database/readwiseSourceCutover.js'));
    return connection.runWithDatabaseConnectionOwner(() => {
      const source = identity.createReadwiseRemoteSource('2026-09-10T00:00:00.000Z');
      const host = hostSettings.createDefaultReadwiseHostSettings();
      const secretRef = 'readwise-api-00000000-0000-4000-8000-000000000015.bin';
      secret.writeReadwiseApiSecret(secretRef, 't178-15-token');
      identity.saveReadwiseConnectionState({ ...host, apiConnection: { secretRef, state: 'connected' },
        readwiseSourceMode: 'api' }, source, '2026-09-10T00:00:00.000Z');
      cutover.writeLegacyReadwiseSourceCutover({ completedAt: '2026-09-10T00:00:00.000Z',
        completedCandidateCount: 0, migratedCount: 0, sourceHost: 'Test host',
        startedAt: '2026-09-10T00:00:00.000Z', status: 'api', totalCandidateCount: 0, unmatchedCount: 0 });
    });
  }, { cwd: process.cwd(), policy: POLICY });
}

async function inspectProjection(app: ElectronApplication) {
  return app.evaluate((_electron, cwd) => {
    const moduleApi = process.getBuiltinModule('module');
    const pathApi = process.getBuiltinModule('path');
    if (!moduleApi || !pathApi) throw new Error('Node built-ins unavailable.');
    const require = moduleApi.createRequire(pathApi.join(cwd, 'package.json'));
    const connection = require(pathApi.join(cwd, 'dist/electron/database/connection.js'));
    return connection.runWithDatabaseConnectionOwner(() => {
      const driver = connection.openDatabaseConnection().driver;
      return {
        external: driver.queryAll('SELECT title FROM external_documents WHERE is_present=1 ORDER BY title'),
        inbox: driver.queryAll(`SELECT title FROM nodes WHERE deleted_at IS NULL AND parent_id='special-inbox' AND
          (title LIKE 'Article %' OR title LIKE 'Book %' OR title LIKE 'API %') ORDER BY title`)
      };
    });
  }, process.cwd());
}

test('routes four representative folder and API inputs through the same policy', async ({ browserName }, testInfo) => {
  void browserName;
  test.setTimeout(120_000);
  for (const mode of ['folder', 'api'] as const) {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), `foliole-t178-15-${mode}-`));
    let session: T178AcceptanceSession | null = null;
    try {
      session = await createT178ApiAcceptanceSession(stateRoot);
      await expectWorkspaceShell(session.firstWindow);
      const settings = mode === 'folder'
        ? await createFolderSettings(path.join(stateRoot, 'Readwise'))
        : { ...createDefaultImportManagerSettings(), readwiseAutoImportPolicy: POLICY,
          readwiseSourceMode: 'api' as const };
      if (mode === 'api') {
        await installApiFixture(session.electronApp);
        await runApiFixture(session.electronApp);
      }
      await expect.poll(async () => {
        try {
          await session!.firstWindow.evaluate(async (nextSettings) => {
            await window.electronAPI.invoke('save_import_manager_settings', { settings: nextSettings });
            return window.electronAPI.invoke('run_readwise_reader_import', { settings: nextSettings });
          }, settings);
          return 'completed';
        } catch (error) {
          if (String(error).includes('sqlite connection is owned')) return 'waiting';
          throw error;
        }
      }, { timeout: 90_000 }).toBe('completed');
      const result = await inspectProjection(session.electronApp);
      expect(result).toEqual(mode === 'folder' ? {
        external: [{ title: 'Book Highlighted' }],
        inbox: [{ title: 'Article Highlighted' }, { title: 'Book Plain' }]
      } : {
        external: [{ title: 'API Book Highlighted' }],
        inbox: [{ title: 'API Article Highlighted' }, { title: 'API Book Plain' }]
      });
      await session.firstWindow.reload();
      await expectWorkspaceShell(session.firstWindow);
      const dialog = await openSettingsCategory(session.firstWindow, 'ReadwiseReader');
      await captureMatrix(dialog, testInfo, `t178-15-${mode}-policy`);
    } finally {
      await session?.close().catch(() => undefined);
      await rm(stateRoot, { force: true, recursive: true });
    }
  }
});
