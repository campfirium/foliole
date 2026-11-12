import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
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
