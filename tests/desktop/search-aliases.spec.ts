import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { importWorkingSetPdf, writeWorkingSetPdf } from './pdf-working-set-fixture';

const ORIGINAL_ID = 'search-alias-original';
const ALIAS_ID = 'search-alias-equivalent';
const BULK_COUNT = 505;
const ORIGINAL_BULK_COUNT = 490;

async function saveAliases(desktopWindow: Page, stateRoot: string, text: string) {
  const status = await desktopWindow.evaluate(() =>
    window.electronAPI?.invoke('load_search_alias_file_status', {}));
  if (!status?.path || !path.resolve(status.path).startsWith(path.resolve(stateRoot) + path.sep)) {
    throw new Error('alias file is outside the isolated native test state');
  }
  await fs.mkdir(path.dirname(status.path), { recursive: true });
  await fs.writeFile(status.path, text, 'utf8');
}

async function countSearchResults(page: Page, query: string) {
  return page.evaluate(async (value) => {
    const snapshot = await window.electronAPI?.invoke('search_workspace', { query: value });
    if (!snapshot) return 0;
    let count = snapshot.results.length;
    let hasMore = snapshot.hasMore;
    while (hasMore) {
      const batch = await window.electronAPI?.invoke('load_workspace_search_batch', { snapshotId: snapshot.snapshotId, offset: count });
      if (!batch?.results.length) break;
      count += batch.results.length;
      hasMore = batch.hasMore;
    }
    await window.electronAPI?.invoke('release_workspace_search', { snapshotId: snapshot.snapshotId });
    return count;
  }, query);
}

async function seedBulkSearchRows(app: ElectronApplication) {
  await app.evaluate(async (_, { count, originalCount }) => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    const require = process.getBuiltinModule('module')!.createRequire(`${process.cwd()}/package.json`);
    const { openDatabaseConnection, runWithDatabaseConnectionOwner } = require(`${process.cwd()}/dist/electron/database/connection.js`);
    const { upsertNodeSnapshot } = require(`${process.cwd()}/dist/lib/core/database/nodeMutations.js`);
    const { syncNodeSearchIndexForNodeIds } = require(`${process.cwd()}/dist/lib/core/database/workspaceSearchIndex.js`);
    return runWithDatabaseConnectionOwner(() => {
      const ids = Array.from({ length: count }, (_, index) => `search-bulk-${index}`);
      const { driver } = openDatabaseConnection();
      driver.transaction(() => {
        for (const [index, id] of ids.entries()) {
          const name = index < originalCount ? 'Atlas' : 'Mapbook';
          upsertNodeSnapshot(driver, {
            nodeId: id, parentNodeId: null, kind: 'topic', title: `${name} catalogue entry ${index}`, isTitleManual: true,
            content: '', reveal: null, anchorLink: null, position: index,
            createdAt: '2026-04-08T00:00:00.000Z', updatedAt: '2026-04-08T00:00:01.000Z'
          });
        }
      });
      syncNodeSearchIndexForNodeIds(driver, ids);
    });
  }, { count: BULK_COUNT, originalCount: ORIGINAL_BULK_COUNT });
}

test('editor-saved aliases filter and open the actual matching spelling', async ({ desktopSession, desktopWindow }) => {
  await expect(desktopWindow.getByRole('main', { name: /Foliole (workspace|工作区)/ })).toBeVisible();
  await desktopWindow.evaluate(async ({ originalId, aliasId }) => {
    const api = window.__folioleWorkspaceDebug;
    if (!api) throw new Error('missing workspace debug bridge');
    await api.seedNodes([
      { id: originalId, kind: 'topic', title: 'Original speech', content: 'Obama spoke today.' },
      { id: aliasId, kind: 'topic', title: 'Equivalent speech', content: 'Barack Obama spoke today.' }
    ], { persist: true });
    for (const [nodeId, title, content] of [
      [originalId, 'Original speech', 'Obama spoke today.'],
      [aliasId, 'Equivalent speech', 'Barack Obama spoke today.']
    ]) {
      await window.electronAPI?.invoke('update_node_content', {
        anchorLink: null, content, createdAt: '2026-09-27T00:00:00.000Z', desiredRetention: null,
        hideTitleHeading: false, imageRegions: null, isTitleManual: true, kind: 'topic', nodeId,
        parentNodeId: null, position: null, priority: null, reading: null, reveal: null, review: null,
        title, updatedAt: '2026-09-27T00:00:10.000Z', virtualFilter: null
      });
    }
  }, { originalId: ORIGINAL_ID, aliasId: ALIAS_ID });

  await saveAliases(desktopWindow, desktopSession.target.runtimeStateRoot, 'Obama | Barack Obama\n');

  await expect.poll(() => desktopWindow.evaluate(async () => {
    const snapshot = await window.electronAPI?.invoke('search_workspace', { query: 'Obama' });
    return snapshot?.results.map((item) => item.id) ?? [];
  })).toEqual(expect.arrayContaining([ORIGINAL_ID, ALIAS_ID]));

  await desktopWindow.evaluate(() => window.localStorage.setItem('foliole-search-enhancement-prompt-dismissed', 'true'));
  await desktopWindow.getByRole('button', { name: /^(Search|搜索)$/ }).click();
  const dialog = desktopWindow.getByRole('dialog', { name: /(Workspace search|工作区搜索)/ });
  await dialog.getByLabel(/(Search workspace|搜索工作区)/).fill('Obama');
  const filters = dialog.getByRole('group', { name: /(Filter by matching spelling|按命中写法筛选)/ });
  await expect(filters.getByRole('button', { name: 'Barack Obama' })).toBeVisible();
  await filters.getByRole('button', { name: 'Barack Obama' }).click();
  await expect(dialog.getByRole('button', { name: /Equivalent speech/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Original speech/ })).toHaveCount(0);
  await dialog.getByRole('button', { name: /Equivalent speech/ }).click();
  await expect.poll(() => desktopWindow.evaluate(() => {
    const selection = window.__folioleDebug?.getEditorSelection?.('prompt-editor');
    const content = window.__folioleDebug?.getEditorContent?.('prompt-editor') ?? '';
    return selection ? content.slice(selection.from, selection.to) : '';
  })).toBe('Barack Obama');
});

test('an alias found on a distant PDF page opens that exact page', async ({ desktopSession, desktopApp, desktopWindow }, testInfo) => {
  await expect(desktopWindow.getByRole('main', { name: /Foliole (workspace|工作区)/ })).toBeVisible();
  const pdfPath = testInfo.outputPath('alias-pages.pdf');
  await writeWorkingSetPdf(pdfPath);
  const nodeId = await importWorkingSetPdf(desktopApp, desktopWindow, pdfPath);
  await saveAliases(desktopWindow, desktopSession.target.runtimeStateRoot, 'distantneedle | Working set page 35\n');
  await expect.poll(() => desktopWindow.evaluate(async (id) => {
    const snapshot = await window.electronAPI?.invoke('search_workspace', { query: 'distantneedle' });
    const pdf = snapshot?.results.find((result) => result.id === id && result.kind === 'pdf');
    return pdf?.aliasMatches?.find((match) => match.spelling === 'working set page 35')?.pdfMatch?.page ?? null;
  }, nodeId)).toBe(35);

  await desktopWindow.evaluate(() => window.localStorage.setItem('foliole-search-enhancement-prompt-dismissed', 'true'));
  await desktopWindow.getByRole('button', { name: /^(Search|搜索)$/ }).click();
  const dialog = desktopWindow.getByRole('dialog', { name: /(Workspace search|工作区搜索)/ });
  await dialog.getByLabel(/(Search workspace|搜索工作区)/).fill('distantneedle');
  const filters = dialog.getByRole('group', { name: /(Filter by matching spelling|按命中写法筛选)/ });
  await filters.getByRole('button', { name: 'Working set page 35' }).click();
  const pdfResult = dialog.getByRole('button', { name: /alias-pages\.pdf/i });
  await expect(pdfResult).toContainText('Page 35');
  await pdfResult.click();
  await expect(dialog).toBeHidden();
  await expect(desktopWindow.getByRole('textbox', { name: /PDF page|PDF 页码/ })).toHaveValue('35');
  await expect(desktopWindow.locator('[data-pdf-page-number="35"] [data-testid="pdf-search-match-active"]').first()).toBeInViewport();
  await desktopWindow.screenshot({ path: testInfo.outputPath('alias-pdf-page-35.png') });
});

test('ordinary and alias searches scroll through every result without a fixed cutoff', async ({ desktopSession, desktopApp, desktopWindow }, testInfo) => {
  await expect(desktopWindow.getByRole('main', { name: /Foliole (workspace|工作区)/ })).toBeVisible();
  await expect.poll(() => desktopWindow.evaluate(async () =>
    (await window.electronAPI?.invoke('load_search_index_rebuild_status', {}))?.status
  )).toBe('ready');
  const initialMainRssBytes = await desktopApp.evaluate(() => process.memoryUsage().rss);
  await seedBulkSearchRows(desktopApp);
  await saveAliases(desktopWindow, desktopSession.target.runtimeStateRoot, 'Atlas | Mapbook\n');
  await expect.poll(() => countSearchResults(desktopWindow, 'Atlas')).toBe(BULK_COUNT);

  await desktopWindow.evaluate(() => window.localStorage.setItem('foliole-search-enhancement-prompt-dismissed', 'true'));
  await desktopWindow.getByRole('button', { name: /^(Search|搜索)$/ }).click();
  const dialog = desktopWindow.getByRole('dialog', { name: /(Workspace search|工作区搜索)/ });
  const input = dialog.getByLabel(/(Search workspace|搜索工作区)/);
  const list = dialog.getByRole('list', { name: /(Workspace search results|工作区搜索结果)/ });
  const startedAt = Date.now();
  await input.fill('catalogue');
  await expect(list.getByRole('button')).toHaveCount(40);
  const firstScreenMs = Date.now() - startedAt;
  for (let expected = 80; expected <= BULK_COUNT + 40; expected += 40) {
    await list.evaluate((element) => { element.scrollTop = element.scrollHeight; element.dispatchEvent(new Event('scroll')); });
    await expect(list.getByRole('button')).toHaveCount(Math.min(expected, BULK_COUNT));
  }
  await list.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(list.getByRole('button', { name: /Mapbook catalogue entry 504/ })).toBeInViewport();
  await input.fill('Atlas');
  await expect(list.getByRole('button')).toHaveCount(40);
  for (let expected = 80; expected <= BULK_COUNT + 40; expected += 40) {
    await list.evaluate((element) => { element.scrollTop = element.scrollHeight; element.dispatchEvent(new Event('scroll')); });
    await expect(list.getByRole('button')).toHaveCount(Math.min(expected, BULK_COUNT));
  }
  const filters = dialog.getByRole('group', { name: /(Filter by matching spelling|按命中写法筛选)/ });
  await filters.getByRole('button', { name: 'Mapbook' }).click();
  await expect(list.getByRole('button')).toHaveCount(15);
  await expect(list.getByRole('button', { name: /Mapbook catalogue entry 504/ })).toBeVisible();
  const measurement = {
    firstScreenMs, results: BULK_COUNT, initialMainRssBytes,
    finalMainRssBytes: await desktopApp.evaluate(() => process.memoryUsage().rss)
  };
  await fs.writeFile(testInfo.outputPath('search-large-result-measurement.json'), JSON.stringify(measurement));
  await testInfo.attach('search-large-result-measurement', {
    body: JSON.stringify(measurement),
    contentType: 'application/json'
  });
  await desktopWindow.screenshot({ path: testInfo.outputPath('alias-last-batch.png') });
});
