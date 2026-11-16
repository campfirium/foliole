import { DEFAULT_APPEARANCE_COLORS, hexColorToRgbChannels } from '../../src/shared/config/defaultAppearanceColors';

import { expect, test } from './harness/fixtures';
import { clozeIds, dragImageCloze, openSource, OWNER_ID, readDocument, seedImageSource } from './harness/imageClozeSource';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

async function expectActionsBesideRange(controls: import('@playwright/test').Locator, range: import('@playwright/test').Locator) {
  await expect(controls).toBeVisible();
  const bounds = (await controls.boundingBox())!;
  const frame = (await range.boundingBox())!;
  expect(bounds.x).toBeGreaterThan(frame.x + frame.width);
  expect(Math.abs(bounds.y + bounds.height / 2 - frame.y - frame.height / 2)).toBeLessThan(bounds.height);
}

async function adjustFromLeftAndCancel(page: import('@playwright/test').Page, surface: import('@playwright/test').Locator) {
  const range = surface.locator('.cm-md-image-cloze-region');
  const before = (await range.boundingBox())!;
  const pointerY = before.y + before.height / 4;
  await page.mouse.click(before.x, pointerY);
  const controls = page.getByRole('group', { name: 'Adjust image cloze' });
  await expect(controls).toBeVisible();
  const toolbar = (await controls.boundingBox())!;
  expect(toolbar.x + toolbar.width).toBeLessThan(before.x);
  const labels = await controls.getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')));
  expect(labels).toEqual(['Apply', 'Cancel adjustment', 'Delete image cloze']);
  expect(Math.abs(toolbar.y + toolbar.height / 2 - pointerY)).toBeLessThan(toolbar.height / 2);
  await surface.getByRole('button', { name: 'Left edge' }).press('ArrowLeft');
  expect((await range.boundingBox())!.x).toBeLessThan(before.x);
  await controls.getByRole('button', { name: 'Cancel adjustment' }).click();
  await expect(controls).toBeHidden();
  expect((await range.boundingBox())!.x).toBeCloseTo(before.x);
  await expect(range).toHaveAttribute('data-region-state', 'outlined');
  await expect(surface.getByRole('button', { name: 'Delete image cloze' })).toHaveCount(0);
  await expect(surface.locator('.cm-md-image-crop-frame')).toHaveCount(0);
}

async function removeFocusFromSource(page: import('@playwright/test').Page, surface: import('@playwright/test').Locator) {
  const outline = surface.locator('.cm-md-image-focus-outline');
  await expect(outline).toBeVisible();
  const bounds = (await outline.boundingBox())!;
  await page.mouse.click(bounds.x, bounds.y + bounds.height / 2);
  const controls = page.getByRole('group', { name: 'Adjust focus' });
  await controls.getByRole('button', { name: 'Remove focus' }).click();
  await expect(outline).toHaveCount(0);
  await expect.poll(async () => (await readDocument(page, OWNER_ID)).content).not.toContain(';focus=');
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
  await expectActionsBesideRange(clozeControls, surface.locator('.cm-md-image-crop-frame'));
  await expectTransparentOutline(surface);
  await dragRightEdge(page, surface.getByRole('button', { name: 'Right edge' }));
  await expectActionsBesideRange(clozeControls, surface.locator('.cm-md-image-crop-frame'));
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
  await adjustFromLeftAndCancel(page, surface);
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
  expect(await readDocument(page, OWNER_ID)).toEqual(saved);
  await removeFocusFromSource(page, surface);
  expect((await readDocument(page, id!)).imageRegions![0]!.regions[0]).toEqual(adjusted);
});

test('uses appearance colors for focus boundaries and image controls in light and dark mode', async ({ desktopWindow: page }, info) => {
  await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await seedImageSource(page);
  await dragImageCloze(page, true);
  await page.getByRole('button', { name: 'Focus image region' }).click();
  await expect.poll(async () => (await readDocument(page, OWNER_ID)).content).toContain(';focus=');

  const outline = page.locator('.cm-md-image-focus-outline');
  const controls = page.getByRole('group', { name: 'Adjust focus' });
  const handle = page.getByRole('button', { name: 'Left edge' });
  const backgrounds = new Set<string>();
  for (const mode of ['light', 'dark'] as const) {
    const settings = await openSettingsCategory(page, 'Appearance');
    await settings.getByRole('radio', { name: mode === 'light' ? 'Light' : 'Dark', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(settings).toBeHidden();
    await expect(page.locator('html')).toHaveAttribute('data-resolved-base-color', mode);

    const rgb = (hex: string) => `rgb(${hexColorToRgbChannels(hex).split(' ').join(', ')})`;
    await expect(outline).toHaveCSS('border-top-color', rgb(DEFAULT_APPEARANCE_COLORS[mode].accent));
    const bounds = (await outline.boundingBox())!;
    await page.mouse.click(bounds.x, bounds.y + bounds.height / 2);
    await expect(handle).toHaveCSS('color', rgb(DEFAULT_APPEARANCE_COLORS[mode].font));
    const apply = controls.getByRole('button', { name: 'Apply' });
    await expect(apply).toHaveCSS('color', rgb(DEFAULT_APPEARANCE_COLORS[mode].font));
    backgrounds.add(await apply.evaluate(button => getComputedStyle(button).backgroundColor));
    await page.screenshot({ path: info.outputPath(`image-focus-${mode}.png`) });
    await controls.getByRole('button', { name: 'Cancel adjustment' }).click();
  }
  expect(backgrounds.size).toBe(2);
});
