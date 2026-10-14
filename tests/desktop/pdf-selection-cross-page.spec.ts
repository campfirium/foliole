import path from 'node:path';

import { closeDesktopApplication } from '../../scripts/desktop/playwright-desktop-close.mjs';
import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import { expect, test } from './harness/fixtures';
import { importPdf } from './pdf-image-excerpt-test-support';
import { dragAcrossPdfPages, expectPdfTextCovered, verifyCrossPageExcerpt } from './pdf-selection-cross-page-drag';
import { createCrossPagePdf } from './pdf-selection-cross-page-fixture';

for (const scenario of [
  { name: 'two-page-forward', texts: ['First page ending', 'Second page beginning'], reverse: false },
  { name: 'two-page-reverse', texts: ['First page ending', 'Second page beginning'], reverse: true },
  { name: 'long-range', texts: Array.from({ length: 8 }, (_, index) => `Page ${index + 1} selected text`), reverse: false },
  { name: 'empty-middle', texts: ['First page ending', '', 'Last page beginning'], reverse: false }
]) {
  test(`PDF cross-page selection @pdf ${scenario.name}`, async ({ desktopApp, desktopSession, desktopWindow: initialPage }) => {
    let page = initialPage;
    let reopened: Awaited<ReturnType<typeof launchDesktopSession>> | null = null;
    try {
    const file = path.resolve(`.tmp/artifacts/pdf-cross-page-${scenario.name}.pdf`);
    createCrossPagePdf(file, scenario.texts);
    await page.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ }).click();
    const parent = await importPdf(desktopApp, page, file);
    await page.getByRole('button', { name: /^(Custom fit|自定义适配)$/ }).click();
    await page.getByRole('button', { name: /^(Confirm|确认)$/ }).click();
    await page.getByRole('button', { name: /Set zoom level|设置缩放级别/ }).click();
    await page.getByRole('menuitem', { name: '100%' }).click();
    await dragAcrossPdfPages(page, scenario.texts, scenario.reverse);
    const numbers = scenario.texts.flatMap((text, index) => text ? [index + 1] : []);
    for (const number of numbers) await expectPdfTextCovered(page, number, 'pdf-selection-rect');
    if (scenario.texts.length > 5) {
      await expect(page.locator('[data-testid="pdf-official-text-layer"]')).toHaveCount(8);
      expect(await page.locator('[data-pdf-page-number] canvas').count()).toBeLessThanOrEqual(5);
    }
    await page.screenshot({ path: path.resolve(`.tmp/artifacts/pdf-cross-page-${scenario.name}-drag.png`) });
    await page.mouse.up();
    await page.getByRole('button', { name: /^(Highlight|高亮)$/ }).click();
    await expect(page.locator('[data-annotation-toolbar="true"]')).toHaveCount(0);
    const excerpts = await page.evaluate(parentId => {
      const debug = window.__folioleWorkspaceDebug;
      return debug?.listNodes().map(node => debug.getNode(node.id)).filter(node => node?.parentNodeId === parentId && node.anchorKind === 'highlight') ?? [];
    }, parent);
    expect(excerpts).toHaveLength(1);
    const excerpt = excerpts[0];
    if (!excerpt) throw new Error('Excerpt is missing');
    expect(excerpt.content).toBe(scenario.texts.filter(Boolean).join('\n'));
    expect(excerpt.anchorLink?.locator).toMatchObject({ pages: numbers.map(number => ({ page: number })) });
    if (scenario.name === 'two-page-forward') {
      await closeDesktopApplication(desktopApp);
      reopened = await launchDesktopSession({ env: { ...process.env,
        FOLIOLE_ELECTRON_TEST_STATE_ROOT: desktopSession.target.runtimeStateRoot } });
      page = reopened.firstWindow;
      const window = await reopened.electronApp.browserWindow(page);
      await window.evaluate(window => { window.setBounds({ width: 1600, height: 1000, x: 80, y: 80 }); window.show(); window.focus(); });
      await expect(page.getByTestId('pdf-document-surface')).toBeVisible();
    } else await page.reload();
    await verifyCrossPageExcerpt(page, numbers, excerpt.id, parent);
    await page.screenshot({ path: path.resolve(`.tmp/artifacts/pdf-cross-page-${scenario.name}-restored.png`) });
    } finally { await reopened?.close(); }
  });
}
