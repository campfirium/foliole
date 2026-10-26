import { expect, test } from './harness/fixtures';
import { importWorkingSetPdf, openWorkingSetPdf, writeWorkingSetPdf } from './pdf-working-set-fixture';

test('local text indexing preserves PDF search page navigation', async ({ desktopApp, desktopWindow: page }, testInfo) => {
  await expect(page.getByRole('main', { name: /Foliole (workspace|工作区)/ })).toBeVisible();
  // A fresh isolated library builds its sidecar in a worker after the shell appears.
  const waitForSearch = async () => expect.poll(() => page.evaluate(async () =>
    (await window.electronAPI?.invoke('load_search_index_rebuild_status', {}))?.status
  ), { timeout: 30_000 }).toBe('ready');
  await waitForSearch();
  await page.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ }).click();
  const localId = await page.evaluate(async () => window.__folioleWorkspaceDebug?.createRootNode?.('LocalMapBefore'));
  expect(localId).toBeTruthy();
  const pdfPath = testInfo.outputPath('page-map.pdf');
  await writeWorkingSetPdf(pdfPath);
  const nodeId = await importWorkingSetPdf(desktopApp, page, pdfPath);
  await waitForSearch();
  expect(await page.evaluate(async (id) => window.__folioleWorkspaceDebug?.updateNodeContent?.(id!, 'LocalMapSentinel'), localId)).toBe(true);
  await waitForSearch();
  await expect.poll(() => page.evaluate(async () =>
    (await window.electronAPI?.invoke('search_workspace', { query: 'LocalMapSentinel' }))?.results.map(({ id }) => id)
  )).toContain(localId);
  await openWorkingSetPdf(page, nodeId);
  await expect(page.locator('[data-pdf-page-number="1"] .textLayer')).toContainText('Working set page 1');
  await expect.poll(() => page.evaluate(async (id) => {
    const snapshot = await window.electronAPI?.invoke('search_workspace', { query: 'Working set page 35' });
    return snapshot?.results.find((result) => result.id === id && result.kind === 'pdf')?.pdfMatch?.page;
  }, nodeId)).toBe(35);
  await page.evaluate(() => window.localStorage.setItem('foliole-search-enhancement-prompt-dismissed', 'true'));
  await page.getByRole('button', { name: /^(Search|搜索)$/ }).click();
  const dialog = page.getByRole('dialog', { name: /(Workspace search|工作区搜索)/ });
  await dialog.getByLabel(/(Search workspace|搜索工作区)/).fill('Working set page 35');
  const result = dialog.getByRole('button', { name: /page-map\.pdf/i });
  await expect(result).toContainText('Page 35');
  await result.click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('textbox', { name: /PDF page|PDF 页码/ })).toHaveValue('35');
  await expect(page.locator('[data-pdf-page-number="35"] [data-testid="pdf-search-match-active"]').first()).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('page-map-navigation.png') });
});
