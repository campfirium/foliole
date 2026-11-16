import { expect, test } from './harness/fixtures';
import { clozeIds, dragImageCloze, openSource, OWNER_ID, readDocument, seedImageSource } from './harness/imageClozeSource';
import { expectWorkspaceShell } from './harness/settings';

async function expectActionsNearPointer(controls: import('@playwright/test').Locator, point: { x: number; y: number }) {
  await expect(controls).toBeVisible();
  const bounds = (await controls.boundingBox())!;
  expect(Math.abs(bounds.x + bounds.width / 2 - point.x)).toBeLessThan(bounds.width);
  expect(Math.abs(bounds.y + bounds.height / 2 - point.y)).toBeLessThan(bounds.height * 2);
}

async function expectTransparentOutline(surface: import('@playwright/test').Locator) {
  const selected = surface.locator('.cm-md-image-cloze-region[data-region-state="selected"]');
  await expect(selected).toHaveCSS('border-top-style', 'dashed');
  await expect(selected).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
}

async function dragRightEdge(page: import('@playwright/test').Page, edgeButton: import('@playwright/test').Locator) {
  await edgeButton.hover();
  const edge = (await edgeButton.boundingBox())!;
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
  await page.mouse.down();
  await page.mouse.move(edge.x - 25, edge.y + edge.height / 2, { steps: 5 });
  await page.mouse.up();
}

test('adjusts saved cloze and focus borders and keeps both after reopening', async ({ desktopWindow: page }, info) => {
  await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await seedImageSource(page);
  await dragImageCloze(page);
  await page.getByRole('button', { name: 'Confirm image cloze' }).click();
  await expect.poll(() => clozeIds(page)).toHaveLength(1);
  const [id] = await clozeIds(page);
  const before = await readDocument(page, id!);
  const region = before.imageRegions![0]!.regions[0]!;
  const surface = page.locator('.cm-md-image-surface-block').first();
  const overlay = surface.locator('.cm-md-image-cloze-overlay');
  await surface.hover();
  const bounds = (await overlay.boundingBox())!;
  const pointer = { x: bounds.x + bounds.width * (region.x + region.width), y: bounds.y + bounds.height * (region.y + region.height / 2) };
  await page.mouse.move(pointer.x, pointer.y);
  await expect(overlay).toHaveCSS('cursor', 'grab');
  await page.mouse.down();
  await page.mouse.up();
  const clozeControls = page.getByRole('group', { name: 'Adjust image cloze' });
  await expectActionsNearPointer(clozeControls, pointer);
  await expectTransparentOutline(surface);
  await dragRightEdge(page, surface.getByRole('button', { name: 'Right edge' }));
  await page.screenshot({ path: info.outputPath('adjust-image-cloze.png') });
  await clozeControls.getByRole('button', { name: 'Apply' }).click();
  await expect(clozeControls).toBeHidden();
  const after = await readDocument(page, id!);
  const adjusted = after.imageRegions![0]!.regions[0]!;
  expect(adjusted).toMatchObject({ id: region.id, x: region.x, y: region.y, height: region.height });
  expect(adjusted.width).toBeLessThan(region.width);
  expect(after.content).toBe(before.content);
  expect(after.reveal).toBe(before.reveal);
  expect(await clozeIds(page)).toEqual([id]);
  expect((await readDocument(page, OWNER_ID)).imageRegions![0]!.regions[0]).toEqual(adjusted);
  await dragImageCloze(page, true);
  await page.getByRole('button', { name: 'Focus image region' }).click();
  await expect.poll(async () => (await readDocument(page, OWNER_ID)).content).toContain(';focus=');
  const focused = (await readDocument(page, OWNER_ID)).content;
  await surface.hover();
  const focusBounds = (await overlay.boundingBox())!;
  await page.mouse.click(focusBounds.x + focusBounds.width * 0.78, focusBounds.y + focusBounds.height * 0.2);
  const focusControls = page.getByRole('group', { name: 'Adjust focus' });
  await surface.getByRole('button', { name: 'Left edge' }).press('ArrowLeft');
  await focusControls.getByRole('button', { name: 'Apply' }).click();
  await expect.poll(async () => (await readDocument(page, OWNER_ID)).content).not.toBe(focused);
  const saved = await readDocument(page, OWNER_ID);
  await page.reload();
  await expectWorkspaceShell(page);
  await openSource(page);
  await expect(surface.locator('.cm-md-image-focus-mask')).toBeVisible();
  expect(await readDocument(page, OWNER_ID)).toEqual(saved);
  expect((await readDocument(page, id!)).imageRegions![0]!.regions[0]).toEqual(adjusted);
});
