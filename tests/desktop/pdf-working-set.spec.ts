import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';
import { expectSearchTargetVisible, importWorkingSetPdf, openWorkingSetPdf, readHeavyPdfPages, writeWorkingSetPdf } from './pdf-working-set-fixture';

test('long PDF search stays complete while distant page resources are released', async ({ desktopApp, desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.evaluate(async () => window.__folioleWorkspaceDebug?.seedNodes?.([
    { id: 'pdf-away', title: 'Away from PDF', kind: 'topic', content: 'Ordinary text destination.' }
  ], { persist: true }));
  const fixturePath = testInfo.outputPath('working-set.pdf');
  await writeWorkingSetPdf(fixturePath);
  const nodeId = await importWorkingSetPdf(desktopApp, desktopWindow, fixturePath);
  await openWorkingSetPdf(desktopWindow, nodeId);
  const search = desktopWindow.getByRole('textbox', { name: /PDF search|PDF 搜索/ });
  const status = desktopWindow.getByTestId('pdf-search-status');
  await search.fill('distantneedle');
  await expect(status).toHaveText('1 / 3');
  await expect.poll(() => readHeavyPdfPages(desktopWindow)).toContain(8);
  await expectSearchTargetVisible(desktopWindow, 8, testInfo);
  await expect.poll(async () => (await readHeavyPdfPages(desktopWindow)).length).toBeLessThanOrEqual(6);
  await search.press('Enter');
  await expect(status).toHaveText('2 / 3');
  await expect.poll(() => readHeavyPdfPages(desktopWindow)).toContain(20);
  await expect.poll(() => readHeavyPdfPages(desktopWindow)).not.toContain(8);
  await expectSearchTargetVisible(desktopWindow, 20, testInfo);
  await search.press('Enter');
  await expect(status).toHaveText('3 / 3');
  await expect.poll(() => readHeavyPdfPages(desktopWindow)).toContain(35);
  await expect.poll(() => readHeavyPdfPages(desktopWindow)).not.toContain(20);
  await expectSearchTargetVisible(desktopWindow, 35, testInfo);
  await search.press('Shift+Enter');
  await expect(status).toHaveText('2 / 3');
  await search.fill('crimson bridge');
  await expect(status).toHaveText('1 / 1');
  await expect.poll(() => readHeavyPdfPages(desktopWindow)).toEqual(expect.arrayContaining([19, 20]));
  await expectSearchTargetVisible(desktopWindow, 19, testInfo);
  await expect.poll(async () => (await readHeavyPdfPages(desktopWindow)).length).toBeLessThanOrEqual(7);
  await desktopWindow.screenshot({ path: testInfo.outputPath('cross-page-search.png') });
  await search.fill('');
  const pageInput = desktopWindow.getByRole('textbox', { name: /PDF page|PDF 页码/ });
  await pageInput.fill('19');
  await pageInput.press('Enter');
  await expect.poll(() => desktopWindow.evaluate((id) =>
    window.__folioleWorkspaceDebug?.getNodeViewState?.(id), nodeId
  )).toMatchObject({ selection: { from: 19, to: 0 } });
  await desktopWindow.getByRole('treeitem', { name: 'Home', exact: true }).click();
  await desktopWindow.getByRole('treeitem', { name: 'Away from PDF', exact: true }).click();
  await expect(desktopWindow.locator('.cm-content')).toContainText('Ordinary text destination.');
  await expect(desktopWindow.getByTestId('pdf-document-surface')).toHaveCount(0);
  await expect(desktopWindow.locator('.react-pdf__Page')).toHaveCount(0);
  await openWorkingSetPdf(desktopWindow, nodeId);
  const exitFlow = desktopWindow.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ });
  if (await exitFlow.isVisible()) await exitFlow.click();
  await expect(desktopWindow.getByRole('textbox', { name: /PDF page|PDF 页码/ })).toHaveValue('19');
  await search.fill('distantneedle');
  await expect(status).toHaveText(/\d \/ 3/);
  await expect.poll(async () => (await readHeavyPdfPages(desktopWindow)).length).toBeLessThanOrEqual(7);
  await desktopWindow.screenshot({ path: testInfo.outputPath('pdf-reopened.png') });
});

test('distant PDF annotations stay lightweight and a selected annotation remains reachable after zoom and rotation', async ({ desktopApp, desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  const fixturePath = testInfo.outputPath('annotated-working-set.pdf');
  await writeWorkingSetPdf(fixturePath);
  const nodeId = await importWorkingSetPdf(desktopApp, desktopWindow, fixturePath);
  await openWorkingSetPdf(desktopWindow, nodeId);
  const targetId = await desktopWindow.evaluate(async (parentNodeId) => {
    let lastId: string | null = null;
    for (let page = 2; page <= 40; page += 1) {
      lastId = await window.__folioleWorkspaceDebug?.createTextHighlightChild?.({
        parentNodeId, text: `Annotation on page ${page}`, anchorId: `window-annotation-${page}`,
        anchorLink: { id: `window-annotation-${page}`, kind: 'highlight', locator: { page, x: 0.2, y: 0.2 } }
      }) ?? null;
    }
    return lastId;
  }, nodeId);
  expect(targetId).toBeTruthy();
  await openWorkingSetPdf(desktopWindow, nodeId);
  await expect.poll(async () => (await readHeavyPdfPages(desktopWindow)).length).toBeLessThanOrEqual(5);
  await expect.poll(() => readHeavyPdfPages(desktopWindow)).not.toContain(40);
  await desktopWindow.getByRole('button', { name: /^(Highlights panel|高亮面板)$/ }).click();
  await desktopWindow.getByRole('button', { name: 'Annotation on page 40', exact: true }).click();
  await expect.poll(() => readHeavyPdfPages(desktopWindow)).toContain(40);
  await expect(desktopWindow.getByRole('textbox', { name: /PDF page|PDF 页码/ })).toHaveValue('40');
  await expect(desktopWindow.locator('[data-pdf-page-number="40"] canvas')).toBeInViewport();
  // Reveal the auto-hidden toolbar as a reader would before clicking its controls.
  await desktopWindow.getByTestId('pdf-scroll-container').hover();
  await desktopWindow.mouse.wheel(0, -32);
  await expect(desktopWindow.getByTestId('pdf-document-toolbar')).toHaveAttribute('data-toolbar-visible', 'true');
  await desktopWindow.getByRole('button', { name: /Set zoom level|设置缩放级别/ }).click();
  await desktopWindow.getByRole('menuitem', { name: '150%' }).click();
  await expect(desktopWindow.locator('[data-pdf-page-number="40"] canvas')).toBeInViewport();
  await expect(desktopWindow.getByRole('textbox', { name: /PDF page|PDF 页码/ })).toHaveValue('40');
  await desktopWindow.getByTestId('pdf-scroll-container').hover();
  await desktopWindow.mouse.wheel(0, -32);
  await expect(desktopWindow.getByTestId('pdf-document-toolbar')).toHaveAttribute('data-toolbar-visible', 'true');
  await desktopWindow.getByRole('button', { name: /Rotate page clockwise|顺时针旋转页面/ }).click();
  await expect(desktopWindow.getByTestId('pdf-zoom-value')).toHaveText('150%');
  await expect.poll(() => readHeavyPdfPages(desktopWindow)).toContain(40);
  await expect.poll(async () => (await readHeavyPdfPages(desktopWindow)).length).toBeLessThanOrEqual(6);
  await expect(desktopWindow.locator('[data-pdf-page-number="40"] .textLayer')).toContainText('Working set page 40');
  await expect(desktopWindow.locator('[data-pdf-page-number="40"] canvas')).toBeInViewport();
  await expect(desktopWindow.getByRole('textbox', { name: /PDF page|PDF 页码/ })).toHaveValue('40');
  await desktopWindow.screenshot({ path: testInfo.outputPath('far-annotation-rotated.png') });
});
