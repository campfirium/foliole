import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

const SOURCE_ID = 'text-save-limit-parent';

test('rejects oversized highlights and cloze answers but saves a shortened title after reload', async ({ desktopWindow: page }, testInfo) => {
  await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.evaluate(async (id) => {
    await window.__folioleWorkspaceDebug?.seedNodes?.([
      { id, kind: 'topic', title: 'Original title', content: 'Original body.' }
    ], { persist: true });
    await window.__folioleWorkspaceDebug?.openNode?.(id);
  }, SOURCE_ID);
  const result = await page.evaluate(async (parentNodeId) => {
    const api = window.__folioleWorkspaceDebug;
    if (!api) throw new Error('workspace debug API unavailable');
    const before = api.listNodes().map((node) => node.id);
    const oversized = '中'.repeat(349_526);
    const highlight = await api.createTextHighlightChild({ parentNodeId, anchorId: 'oversized-highlight', text: oversized });
    const cloze = await api.createTextClozeChild({ parentNodeId, anchorId: 'oversized-cloze', prompt: '[...]', answer: oversized });
    const renamed = await api.updateNodeTitle(parentNodeId, oversized);
    return { before, after: api.listNodes().map((node) => node.id), highlight, cloze, renamed };
  }, SOURCE_ID);
  expect(result.highlight).toBeNull();
  expect(result.cloze).toBeNull();
  expect(result.renamed).toBe(true);
  expect(result.after).toEqual(result.before);
  await expect(page.getByText(/Title shortened to 100 characters/)).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Split long text' })).toBeHidden();
  const screenshot = path.resolve('.tmp/artifacts/desktop-acceptance/node-text-save-limit.png');
  await mkdir(path.dirname(screenshot), { recursive: true });
  await page.screenshot({ path: screenshot });
  await testInfo.attach('node-text-save-limit', { path: screenshot, contentType: 'image/png' });
  await page.reload();
  await expectWorkspaceShell(page);
  expect((await loadNodeDocument(page, SOURCE_ID))?.content).toBe('Original body.');
  expect(await page.evaluate((id) => window.__folioleWorkspaceDebug?.getNode?.(id)?.title, SOURCE_ID)).toBe('中'.repeat(100));
});
