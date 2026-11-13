import path from 'node:path';

import type { Page, TestInfo } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectCombinedPdfAutoHide, expectNarrowRightReviewFooter, expectReviewFooterSidebarWidths, expectReviewFooterTracksSidebars } from './pdf-review-footer';
import { expectSidebarContextMenu } from './pdf-sidebar-context-menu';
import { expectEdgeHover, expectRightTitlebarControlsAligned } from './pdf-sidebar-hover';
import { importWorkingSetPdf, writeWorkingSetPdf } from './pdf-working-set-fixture';

const realPdf = process.env.FOLIOLE_PDF_ZOOM_FIXTURE;
const fixtures = [
  { title: 'mixed-size PDF', file: null, pageNumber: 20 },
  ...(realPdf ? [{ title: 'NIST PDF', file: path.resolve(realPdf), pageNumber: 250 }] : [])
];

function readLocation(page: Page) {
  return page.getByTestId('pdf-scroll-container').evaluate((container) => {
    const viewport = container.getBoundingClientRect();
    const anchor = viewport.top + container.clientHeight * 0.35;
    const shells = Array.from(container.querySelectorAll<HTMLElement>('[data-pdf-page-number]'));
    const shell = shells.reverse().find((element) => element.getBoundingClientRect().top <= anchor);
    const frame = shell?.querySelector('[data-testid="pdf-document-page-frame"]')?.getBoundingClientRect();
    const canvas = shell?.querySelector('canvas');
    const context = canvas?.getContext('2d');
    let ink = false;
    if (canvas && context && canvas.width && canvas.height && getComputedStyle(canvas).visibility === 'visible') {
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index + 3] === 255 && data[index]! < 160) {
          ink = true;
          break;
        }
      }
    }
    return {
      page: Number(shell?.dataset.pdfPageNumber),
      position: frame ? (anchor - frame.top) / frame.height : null,
      ink,
      state: shell?.dataset.pdfPageState,
      top: container.scrollTop,
      height: container.clientHeight,
      zoom: document.querySelector('[data-testid="pdf-zoom-value"]')?.textContent?.trim()
    };
  });
}

type PdfLocation = Awaited<ReturnType<typeof readLocation>>;

async function waitForLocation(page: Page, target: number, check: (location: PdfLocation) => boolean) {
  await expect.poll(async () => {
    const location = await readLocation(page);
    return { page: location.page, ink: location.ink, detail: check(location) ? true : location };
  }).toMatchObject({ page: target, ink: true, detail: true });
  await expect(page.getByRole('textbox', { name: /PDF page|PDF 页码/ })).toHaveValue(String(target));
}

async function moveToReadingPosition(page: Page, target: number) {
  const input = page.getByRole('textbox', { name: /PDF page|PDF 页码/ });
  await input.fill(String(target));
  await input.press('Enter');
  await waitForLocation(page, target, (location) => location.zoom === '100%');
  const scroller = page.getByTestId('pdf-scroll-container');
  await scroller.hover();
  await page.mouse.wheel(0, 180);
  await waitForLocation(page, target, ({ position }) => position !== null && position > 0.45);
}

async function verifyTransform(page: Page, target: number, action: () => Promise<void>, changesViewport = false) {
  const before = await readLocation(page);
  await action();
  await waitForLocation(page, target, (after) =>
    after.zoom !== before.zoom && (after.height !== before.height) === changesViewport &&
    after.position !== null && before.position !== null && Math.abs(after.position - before.position) < 0.02);
}

for (const { title, file, pageNumber } of fixtures) {
  test(`keeps the rendered reading position through PDF zoom and F11 on a ${title} @pdf`, async ({
    desktopApp, desktopWindow: page
  }, testInfo) => {
    test.setTimeout(90000);
    const fixture = file ?? testInfo.outputPath('zoom-working-set.pdf');
    if (!file) await writeWorkingSetPdf(fixture);
    const nodeId = await importWorkingSetPdf(desktopApp, page, fixture);
    expect(await page.evaluate((id) => window.__folioleWorkspaceDebug?.openNode?.(id), nodeId)).toBe(true);

    const autoHide = page.getByRole('button', { name: /Auto-hide top bars|自动隐藏顶部栏/ });
    await expect(autoHide).toBeEnabled({ timeout: 45000 });
    if (await autoHide.getAttribute('aria-pressed') === 'true') await autoHide.click();
    await page.getByRole('button', { name: /Set zoom level|设置缩放级别/ }).click();
    await page.getByRole('menuitem', { name: '100%', exact: true }).click();
    await moveToReadingPosition(page, pageNumber);

    const fixed = await readLocation(page);
    await page.keyboard.press('F11');
    await waitForLocation(page, pageNumber, (after) =>
      after.height !== fixed.height && after.zoom === '100%' && Math.abs(after.top - fixed.top) < 2);
    await page.screenshot({ path: testInfo.outputPath('fixed-f11.png') });
    await page.keyboard.press('F11');
    await waitForLocation(page, pageNumber, (after) =>
      after.height === fixed.height && after.zoom === '100%' && Math.abs(after.top - fixed.top) < 2);

    await verifyTransform(page, pageNumber, () => page.getByRole('button', { name: /^(Zoom in|放大)$/ }).click());
    await page.screenshot({ path: testInfo.outputPath('custom-zoom.png') });
    await verifyTransform(page, pageNumber, () => page.getByRole('button', { name: /^(Fit width|适合宽度)$/ }).click());
    await page.screenshot({ path: testInfo.outputPath('fit-width.png') });
    await verifyTransform(page, pageNumber, () => page.keyboard.press('F11'), true);
    await page.screenshot({ path: testInfo.outputPath('fit-width-f11.png') });

    const jumpPage = pageNumber - 5;
    const input = page.getByRole('textbox', { name: /PDF page|PDF 页码/ });
    await input.fill(String(jumpPage));
    await input.press('Enter');
    await page.keyboard.press('F11');
    await page.keyboard.press('F11');
    await waitForLocation(page, jumpPage, ({ position }) => position !== null && position < 0.4);
    await page.screenshot({ path: testInfo.outputPath('jump-and-f11.png') });
  });
}

async function expectPdfHorizontalBrowsing(page: Page, target: number, testInfo: TestInfo) {
  const scroller = page.getByTestId('pdf-scroll-container');
  const bounds = await scroller.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) throw new Error('PDF viewport unavailable');
  const zoom = page.getByTestId('pdf-zoom-value');
  const frame = page.locator(`[data-pdf-page-number="${target}"]`).getByTestId('pdf-document-page-frame');
  await scroller.evaluate((element) => { element.scrollLeft = 0; });
  expect((await frame.boundingBox())!.x).toBeGreaterThanOrEqual(bounds.x);
  await scroller.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
  const end = (await frame.boundingBox())!;
  expect(end.x + end.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
  expect((await zoom.boundingBox())!.x).toBeGreaterThan(bounds.x);
  await page.screenshot({ path: testInfo.outputPath('pdf-expanded-horizontal.png') });
}

async function openPdfDuringReview(page: Page, nodeId: string) {
  const enter = page.getByRole('button', { name: /^(Enter Flow|进入 Flow)$/ });
  const exit = page.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ });
  await enter.click();
  await expect(exit.first()).toBeVisible();
  expect(await page.evaluate((id) => window.__folioleWorkspaceDebug?.openNode?.(id), nodeId)).toBe(true);
}

async function expectExpandedPdfDuringReview(page: Page, nodeId: string, target: number, testInfo: TestInfo) {
  const expand = page.getByRole('button', { name: /Automatically expand width|自动扩展宽度/ });
  await openPdfDuringReview(page, nodeId);
  await expect(expand).toHaveAttribute('aria-pressed', 'true');
  await waitForLocation(page, target, (after) => after.zoom === '270%');
  const scroller = page.getByTestId('pdf-scroll-container');
  await expectEdgeHover(page);
  await expectSidebarContextMenu(page);
  const footer = page.getByRole('button', { name: /^(Continue|Continue Review|Resume Review|继续|继续复习)$/i }).first();
  await expectReviewFooterSidebarWidths(page, [0, 0, 0]);
  const expandedButton = await footer.boundingBox();
  const title = page.locator('.window-titlebar-center-title');
  const expandedTitle = await title.boundingBox();
  await expand.click();
  await expect(expand).toHaveAttribute('aria-pressed', 'false');
  expect((await footer.boundingBox())?.x).not.toBe(expandedButton?.x);
  expect((await title.boundingBox())?.x).not.toBe(expandedTitle?.x);
  await expand.click();
  await expect(expand).toHaveAttribute('aria-pressed', 'true');
  expect(await footer.boundingBox()).toEqual(expandedButton);
  expect(await title.boundingBox()).toEqual(expandedTitle);
  const reviewBounds = await scroller.boundingBox();
  await expectReviewFooterTracksSidebars(page, footer, await footer.boundingBox());
  expect(await scroller.boundingBox()).toEqual(reviewBounds);
  await expect(page.getByTestId('pdf-zoom-value')).toHaveText('270%');
  await page.screenshot({ path: testInfo.outputPath('pdf-expanded-review.png') });
  await expectNarrowRightReviewFooter(page);
  await expectCombinedPdfAutoHide(page);
}

async function expectExpandedWidthRestored(page: Page, target: number) {
  const expand = page.getByRole('button', { name: /Automatically expand width|自动扩展宽度/ });
  await expand.click();
  await expect(page.locator('.workspace-floating-sidebar')).toHaveCount(0);
  await expect(page.getByTestId('pdf-zoom-value')).toHaveText('270%');
  await page.reload();
  await waitForLocation(page, target, (after) => after.zoom === '270%');
  await expect(expand).toHaveAttribute('aria-pressed', 'false');

  await expand.click();
  await expect(expand).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(expand).toHaveAttribute('aria-pressed', 'true');
}

test('widens a PDF past the sidebars at a fixed zoom above 200 percent @pdf', async ({
  desktopApp, desktopWindow: page
}, testInfo) => {
  test.setTimeout(90000);
  const fixture = realPdf ?? testInfo.outputPath('expanded-width.pdf');
  const target = realPdf ? 250 : 20;
  if (!realPdf) await writeWorkingSetPdf(fixture);
  const nodeId = await importWorkingSetPdf(desktopApp, page, fixture);
  expect(await page.evaluate((id) => window.__folioleWorkspaceDebug?.openNode?.(id), nodeId)).toBe(true);

  const autoHide = page.getByRole('button', { name: /Auto-hide top bars|自动隐藏顶部栏/ });
  await expect(autoHide).toBeEnabled({ timeout: 45000 });
  if (await autoHide.getAttribute('aria-pressed') === 'true') await autoHide.click();
  const sidebar = (side: 'left' | 'right') => page.locator(`.window-titlebar [data-workspace-sidebar-toggle="${side}"]`);
  for (const side of ['left', 'right'] as const) {
    if (await sidebar(side).getAttribute('aria-pressed') === 'false') await sidebar(side).click();
  }
  const zoom = page.getByRole('button', { name: /Set zoom level|设置缩放级别/ });
  await zoom.click();
  await page.getByRole('menuitem', { name: '100%', exact: true }).click();
  await moveToReadingPosition(page, target);
  const expand = page.getByRole('button', { name: /Automatically expand width|自动扩展宽度/ });
  await expand.click();
  await expect(expand).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.workspace-floating-sidebar')).toHaveCount(0);

  const panelButton = page.locator('.window-titlebar button[data-panel-id="outline"]');
  const dockedButton = await panelButton.boundingBox();
  expect(dockedButton).not.toBeNull();
  await expectRightTitlebarControlsAligned(page);
  const before = await readLocation(page);
  await zoom.click();
  await page.getByRole('menuitem', { name: '200%', exact: true }).click();
  const zoomIn = page.getByRole('button', { name: /^(Zoom in|放大)$/ });
  for (let i = 0; i < 7; i++) await zoomIn.click();
  await waitForLocation(page, target, (after) => after.zoom === '270%' &&
    after.position !== null && before.position !== null && Math.abs(after.position - before.position) < 0.02);

  const scroller = page.getByTestId('pdf-scroll-container');
  const bounds = await scroller.boundingBox();
  await expectEdgeHover(page);
  await expect(panelButton).toBeHidden();
  const left = page.locator('.workspace-floating-sidebar-left');
  const right = page.locator('.workspace-floating-sidebar-right');
  for (const [side, panel] of [['left', left], ['right', right]] as const) {
    await page.mouse.move(side === 'left' ? 80 : (await page.evaluate(() => innerWidth)) - 60, bounds!.y + bounds!.height / 2);
    await expect(panel).toBeVisible();
    await expect(sidebar(side)).toBeVisible();
    if (side === 'right') expect(await panelButton.boundingBox()).toEqual(dockedButton);
    expect(await scroller.boundingBox()).toEqual(bounds);
    await expect(page.getByTestId('pdf-zoom-value')).toHaveText('270%');
    await page.screenshot({ path: testInfo.outputPath(`pdf-expanded-${side}.png`) });
    await page.keyboard.press('Escape');
    await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  }
  await page.keyboard.press('Escape');
  await expect(right).toBeHidden();
  await expectPdfHorizontalBrowsing(page, target, testInfo);

  await expectExpandedWidthRestored(page, target);
  await expectExpandedPdfDuringReview(page, nodeId, target, testInfo);
});
