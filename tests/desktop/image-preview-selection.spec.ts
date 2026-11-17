import path from 'node:path';

import type { Locator, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { clozeIds, openSource, OWNER_ID, readDocument, seedImageSource } from './harness/imageClozeSource';
import { expectWorkspaceShell } from './harness/settings';

async function openPreview(page: Page) {
  const widget = page.locator('.markdown-editor-host .cm-md-image-widget').nth(1);
  await widget.locator('.cm-md-image-surface').hover();
  await widget.getByRole('button', { name: 'Open image preview' }).click();
  const dialog = page.getByRole('dialog', { name: 'Image preview' });
  await expect(dialog.getByRole('img', { name: 'Original image' })).toBeVisible();
  return dialog;
}

async function dragPreview(page: Page, dialog: Locator) {
  const bounds = (await dialog.getByRole('img', { name: 'Original image' }).boundingBox())!;
  const end = { x: bounds.x + bounds.width * 0.65, y: bounds.y + bounds.height * 0.7 };
  await page.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await expect(dialog.locator('.cm-md-image-cloze-draft')).toBeVisible();
  await page.mouse.up();
  return end;
}

async function clickLeftEdge(page: Page, region: Locator) {
  const rect = (await region.boundingBox())!;
  await page.mouse.click(rect.x + 1, rect.y + rect.height / 2);
}

async function closePreview(dialog: Locator) {
  await dialog.getByRole('button', { name: 'Close image preview' }).click();
  await expect(dialog).toBeHidden();
}

test.beforeEach(async ({ desktopWindow: page }) => {
  await page.evaluate(() => window.localStorage.setItem('foliole-app-language', 'en'));
  await page.reload();
  await expectWorkspaceShell(page);
  await seedImageSource(page, 2);
});

test('keeps the large image open when drawing, saving and adjusting an existing cloze', async ({ desktopWindow: page }, info) => {
  const dialog = await openPreview(page);
  await dragPreview(page, dialog);
  await dialog.getByRole('button', { name: 'Cancel image cloze' }).click();
  await expect(dialog.locator('.cm-md-image-cloze-draft')).toBeHidden();
  expect(await clozeIds(page)).toEqual([]);

  const end = await dragPreview(page, dialog);
  const confirm = dialog.getByRole('button', { name: 'Confirm image cloze' });
  const action = (await confirm.boundingBox())!;
  expect(Math.abs(action.y + action.height / 2 - end.y)).toBeLessThan(32);
  const screenshot = path.resolve('.tmp/artifacts/large-image-editor.png');
  await dialog.screenshot({ path: screenshot });
  await info.attach('large-image-editor', { path: screenshot, contentType: 'image/png' });
  await confirm.click();
  await expect(dialog).toBeVisible();
  await expect.poll(() => clozeIds(page)).toHaveLength(1);

  const region = dialog.locator('.cm-md-image-cloze-region');
  await expect(region).toHaveCount(1);
  const id = (await clozeIds(page))[0]!;
  const before = (await readDocument(page, id)).imageRegions![0]!.regions[0]!;
  await clickLeftEdge(page, region);
  const edit = dialog.getByRole('group', { name: 'Adjust image cloze' });
  await expect(edit).toBeVisible();
  await dialog.getByRole('button', { name: 'Right edge' }).press('ArrowLeft');
  await edit.getByRole('button', { name: 'Apply' }).click();
  await expect(edit).toBeHidden();
  await expect(dialog).toBeVisible();
  const after = (await readDocument(page, id)).imageRegions![0]!.regions[0]!;
  expect(after.width).toBeLessThan(before.width);
  await closePreview(dialog);
  await page.reload();
  await expectWorkspaceShell(page);
  await openSource(page);
  expect((await readDocument(page, id)).imageRegions![0]!.regions[0]).toEqual(after);
  const reopened = await openPreview(page);
  const savedRegion = reopened.locator('.cm-md-image-cloze-region');
  await expect(savedRegion).toHaveCount(1);
  await clickLeftEdge(page, savedRegion);
  await reopened.getByRole('group', { name: 'Adjust image cloze' })
    .getByRole('button', { name: 'Delete image cloze' }).click();
  await expect(savedRegion).toHaveCount(0);
  await expect(reopened).toBeVisible();
});

test('writes an annotation in the large image and keeps its range on the selected occurrence', async ({ desktopWindow: page }) => {
  const dialog = await openPreview(page);
  await dragPreview(page, dialog);
  await dialog.getByRole('button', { name: 'Annotate Selection' }).click();
  await dialog.getByRole('textbox', { name: 'Add an annotation' }).fill('From the large image');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Add an annotation' })).toBeHidden();
  const region = dialog.locator('.cm-md-image-cloze-region');
  await expect(region).toHaveCount(1);
  await clickLeftEdge(page, region);
  await expect(dialog).toBeVisible();
  await closePreview(dialog);
  const excerpt = page.getByRole('treeitem', { name: /Excerpt 1/ });
  const excerptId = (await excerpt.getAttribute('data-node-id'))!;
  await page.reload();
  await expectWorkspaceShell(page);
  await openSource(page);
  expect((await readDocument(page, excerptId)).content).toContain('From the large image');
  const widgets = page.locator('.cm-md-image-widget');
  await expect(widgets.nth(0).locator('.cm-md-image-cloze-region')).toHaveCount(0);
  await expect(widgets.nth(1).locator('.cm-md-image-cloze-region')).toHaveCount(1);
});

test('edits focus and crop inside the large image and restores them when reopened', async ({ desktopWindow: page }) => {
  let dialog = await openPreview(page);
  await dragPreview(page, dialog);
  await dialog.getByRole('button', { name: 'Focus image region' }).click();
  const outline = dialog.locator('.cm-md-image-focus-outline');
  await expect(outline).toBeVisible();
  await clickLeftEdge(page, outline);
  const adjust = dialog.getByRole('group', { name: 'Adjust focus' });
  await expect(adjust).toBeVisible();
  await adjust.getByRole('button', { name: 'Cancel adjustment' }).click();
  await expect(adjust).toBeHidden();
  await expect.poll(async () => (await readDocument(page, OWNER_ID)).content.split(';focus=').length).toBe(2);

  await dragPreview(page, dialog);
  await dialog.getByRole('button', { name: 'Crop image', exact: true }).click();
  const crop = dialog.getByRole('group', { name: 'Edit crop' });
  await expect(crop).toBeVisible();
  await crop.getByRole('button', { name: 'Apply crop' }).click();
  await expect(crop).toBeHidden();
  await expect.poll(async () => (await readDocument(page, OWNER_ID)).content.split(';crop=').length).toBe(2);
  await expect(dialog.locator('.cm-md-image-crop-plane')).toBeVisible();
  await expect(dialog.locator('.cm-md-image-focus-mask')).toBeAttached();
  await closePreview(dialog);
  dialog = await openPreview(page);
  await expect(dialog.locator('.cm-md-image-focus-mask')).toBeAttached();
  await expect(dialog.locator('.cm-md-image-crop-plane')).toBeVisible();
});
