import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';
import { importWorkingSetPdf, openWorkingSetPdf, readHeavyPdfPages, writeWorkingSetPdf } from './pdf-working-set-fixture';

test('partial PDF dimensions recover and workspace search opens the exact distant result', async ({ desktopApp, desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const filePath = testInfo.outputPath('partial-dimensions.pdf');
  await writeWorkingSetPdf(filePath);
  const nodeId = await importWorkingSetPdf(desktopApp, desktopWindow, filePath);
  await desktopApp.evaluate(({ ipcMain }, targetNodeId) => {
    const moduleApi = process.getBuiltinModule('module')!;
    const require = moduleApi.createRequire(`${process.cwd()}/package.json`);
    const { handleInvokeRequest } = require(`${process.cwd()}/dist/electron/ipc/commands.js`);
    ipcMain.removeHandler('foliole:invoke');
    ipcMain.handle('foliole:invoke', async (event, request) => {
      const result = await handleInvokeRequest(request, { sender: event.sender });
      if (request.command === 'load_node_source_details' && request.args?.node_id === targetNodeId && result) {
        return { ...result, pdf_page_dimensions: result.pdf_page_dimensions.map((entry: { page: number }) =>
          entry.page === 1 ? entry : { ...entry, page_height: null, page_width: null }) };
      }
      return result;
    });
  }, nodeId);
  await openWorkingSetPdf(desktopWindow, nodeId);
  const pageInput = desktopWindow.getByRole('textbox', { name: /PDF page|PDF 页码/ });
  await pageInput.fill('35');
  await pageInput.press('Enter');
  await expect(desktopWindow.locator('[data-pdf-page-number="35"] .react-pdf__Page__textContent')).toContainText('Working set page 35');
  await expect(desktopWindow.locator('[data-pdf-page-number="35"] canvas')).toBeInViewport();
  await expect.poll(async () => (await readHeavyPdfPages(desktopWindow)).length).toBeLessThanOrEqual(5);
  await expect.poll(() => desktopWindow.evaluate(async (id) => {
    const result = await window.electronAPI?.invoke('search_workspace', { query: 'page 35' });
    return result?.some((entry) => entry.id === id && entry.pdfMatch?.page === 35) ?? false;
  }, nodeId)).toBe(true);
  await pageInput.fill('1');
  await pageInput.press('Enter');
  await expect(desktopWindow.locator('[data-pdf-page-number="1"] canvas')).toBeInViewport();
  await desktopWindow.evaluate(() => window.localStorage.setItem('foliole-search-enhancement-prompt-dismissed', 'true'));
  await desktopWindow.getByRole('button', { name: /^(Search|搜索)$/ }).click();
  const dialog = desktopWindow.getByRole('dialog', { name: /Workspace search|工作区搜索/ });
  await dialog.getByRole('textbox', { name: /Search workspace|搜索工作区/ }).fill('page 35');
  await dialog.getByRole('button').filter({ hasText: 'Page 35 · Working set page 35' }).click();
  await expect(dialog).toBeHidden();
  await expect(desktopWindow.getByTestId('pdf-search-status')).toHaveText('1 / 1');
  await expect(desktopWindow.locator('[data-pdf-page-number="35"] [data-testid="pdf-search-match-active"]').first()).toBeInViewport();
  await desktopWindow.screenshot({ path: testInfo.outputPath('external-pdf-search-target.png') });
});

test('switching between PDFs releases hidden surfaces and restores each reading page', async ({ desktopApp, desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const firstPath = testInfo.outputPath('first-reading.pdf');
  const secondPath = testInfo.outputPath('second-reading.pdf');
  await writeWorkingSetPdf(firstPath);
  await writeWorkingSetPdf(secondPath);
  const firstId = await importWorkingSetPdf(desktopApp, desktopWindow, firstPath);
  const secondId = await importWorkingSetPdf(desktopApp, desktopWindow, secondPath);
  const pageInput = desktopWindow.getByRole('textbox', { name: /PDF page|PDF 页码/ });
  for (const [nodeId, target] of [[firstId, 20], [secondId, 35]] as const) {
    await openWorkingSetPdf(desktopWindow, nodeId);
    await pageInput.fill(String(target));
    await pageInput.press('Enter');
    await expect(desktopWindow.locator(`[data-pdf-page-number="${target}"] canvas`)).toBeInViewport();
    await expect.poll(() => desktopWindow.evaluate((id) =>
      window.__folioleWorkspaceDebug?.getNodeViewState?.(id)?.selection?.from, nodeId)).toBe(target);
  }
  for (const [nodeId, target] of [[firstId, 20], [secondId, 35]] as const) {
    await openWorkingSetPdf(desktopWindow, nodeId);
    await expect(pageInput).toHaveValue(String(target));
    await expect(desktopWindow.locator(`[data-pdf-page-number="${target}"] canvas`)).toBeInViewport();
    await expect(desktopWindow.getByTestId('pdf-document-surface')).toHaveCount(1);
    await expect.poll(async () => (await readHeavyPdfPages(desktopWindow)).length).toBeLessThanOrEqual(5);
  }
  await desktopWindow.screenshot({ path: testInfo.outputPath('restored-second-pdf.png') });
});
