import type { Page } from '@playwright/test';

import { expect } from './harness/fixtures';

export async function expectReviewFooterSidebarWidths(page: Page, widths: number[]) {
  const footerSidebarSurfaces = page.locator('.workspace-bottom-region-grid :is([data-workspace-surface-column="folder"], [data-workspace-surface-column="topic"], [data-workspace-surface-column="sidebar"])');
  await expect.poll(() => footerSidebarSurfaces.evaluateAll(surfaces =>
    surfaces.map(surface => Math.round(surface.getBoundingClientRect().width))
  )).toEqual(widths.map(Math.round));
}

async function expectFooterSeam(page: Page, sidebar?: ReturnType<Page['locator']>, side?: 'left' | 'right') {
  const shell = page.locator('.workspace-responsive-shell');
  if (!sidebar || !side) {
    await expect.poll(() => shell.evaluate(row => getComputedStyle(row, '::before').content)).toBe('none');
    return;
  }
  const edge = await shell.evaluate((row, side) => {
    const footer = row.querySelector('.workspace-bottom-region-grid')!.getBoundingClientRect();
    const bounds = row.getBoundingClientRect();
    const style = getComputedStyle(row, '::before');
    const position = side === 'left' ? bounds.left + parseFloat(style.left) + 1 : bounds.right - parseFloat(style.right) - 1;
    return { position, reachesFooter: bounds.top + parseFloat(style.height) >= footer.bottom, background: style.backgroundImage };
  }, side);
  const box = (await sidebar.boundingBox())!;
  expect(edge.background).toContain('linear-gradient');
  expect(edge.reachesFooter).toBe(true);
  expect(edge.position).toBeCloseTo(side === 'left' ? box.x + box.width : box.x, 0);
}

export async function expectReviewFooterTracksSidebars(
  page: Page, footer: ReturnType<Page['locator']>, position: Awaited<ReturnType<ReturnType<Page['locator']>['boundingBox']>>
) {
  const title = page.locator('.window-titlebar-center-title');
  const center = async () => {
    const box = (await title.boundingBox())!;
    return box.x + box.width / 2;
  };
  const initialTitle = await center();
  const viewport = (await page.getByTestId('pdf-scroll-container').boundingBox())!;
  const y = viewport.y + viewport.height / 2;
  const width = await page.evaluate(() => innerWidth);
  const leftToggle = page.locator('.window-titlebar [data-workspace-sidebar-toggle="left"]');
  const rightToggle = page.locator('.window-titlebar [data-workspace-sidebar-toggle="right"]');
  await expect(leftToggle).toBeVisible();
  await expect(rightToggle).toBeHidden();
  const left = page.locator('.workspace-floating-sidebar-left');
  await page.mouse.move(width * 0.06, y);
  await expect(left).toBeVisible();
  const splitter = left.getByRole('separator', { name: /resize folder|调整文件夹列表宽度/i });
  await expect.poll(() => splitter.evaluate(element => {
    const style = getComputedStyle(element, '::before');
    return style.content !== 'none' && Number(style.opacity) > 0 && style.backgroundColor !== 'rgba(0, 0, 0, 0)';
  })).toBe(true);
  await expectFooterSeam(page, left, 'left');
  const leftWidth = (await left.boundingBox())!.width;
  const folder = page.locator('.workspace-bottom-region-grid [data-workspace-surface-column="folder"]');
  const folderWidth = (await folder.boundingBox())!.width;
  expect(folderWidth).toBeGreaterThan(0);
  await expectReviewFooterSidebarWidths(page, [folderWidth, leftWidth - folderWidth, 0]);
  expect(await footer.boundingBox()).toEqual(position);
  expect(await center()).toBeCloseTo(initialTitle, 0);
  await page.keyboard.press('Escape');
  await expectReviewFooterSidebarWidths(page, [0, 0, 0]);
  await expectFooterSeam(page);
  await page.mouse.move(width * 0.94, y);
  const right = page.locator('.workspace-floating-sidebar-right');
  await expect(right).toBeVisible();
  await expectFooterSeam(page, right, 'right');
  await expectReviewFooterSidebarWidths(page, [0, 0, (await right.boundingBox())!.width]);
  expect(await footer.boundingBox()).toEqual(position);
  expect(await center()).toBeCloseTo(initialTitle, 0);

}

export async function expectNarrowRightReviewFooter(page: Page) {
  const right = page.locator('.workspace-floating-sidebar-right');
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.mouse.move(600, 400);
  await page.keyboard.press('Escape');
  await expect(right).toBeHidden();
  await page.mouse.move(1160, 400);
  await expect(right).toBeVisible();
  const rightFooter = page.locator('.workspace-bottom-region-grid [data-workspace-surface-column="sidebar"]');
  await expect.poll(async () => Math.round((await rightFooter.boundingBox())!.width)).toBe(Math.round((await right.boundingBox())!.width));
  await expectFooterSeam(page, right, 'right');
}

export async function expectCombinedPdfAutoHide(page: Page) {
  const left = page.locator('.workspace-floating-sidebar-left');
  const right = page.locator('.workspace-floating-sidebar-right');
  const titlebar = page.locator('.window-titlebar');
  const leftTools = titlebar.locator('[data-workspace-sidebar-toggle="left"]');
  const rightTools = titlebar.locator('.window-titlebar-right-anchor-shell');
  const autoHide = page.getByRole('button', { name: /Auto-hide top bars|自动隐藏顶部栏/ });

  await page.setViewportSize({ width: 1050, height: 900 });
  await page.mouse.move(525, 400);
  await expect(right).toBeHidden();
  await autoHide.click();
  await page.mouse.move(525, 400);
  await expect(page.getByTestId('pdf-window-top-bar')).toHaveAttribute('data-floating', 'true');
  await expect(rightTools).toBeHidden();
  await expect(leftTools).toBeVisible();
  await expect(left).toBeHidden();
  await expect(page.getByTestId('pdf-window-top-bar')).toHaveAttribute('data-visible', 'true');
  await expect.poll(() => titlebar.evaluate(element => getComputedStyle(element, '::after').clipPath)).toBe('none');

  await page.mouse.move(1020, 400);
  await expect(right).toBeVisible();
  await expect(rightTools).toBeVisible();
  await expect(leftTools).toBeVisible();
  await page.mouse.move(525, 400);
  await expect(rightTools).toBeHidden();
  await page.mouse.move(60, 400);
  await expect(left).toBeVisible();
  await expect(leftTools).toBeVisible();
  await expect(rightTools).toBeHidden();
}
