import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './harness/fixtures';
import { openSettingsCategory, openSettingsDialog } from './harness/settings';

test('moves the settings panel and keeps its controls usable', async ({ desktopWindow: page }) => {
  const dialog = await openSettingsDialog(page);
  const search = dialog.getByRole('textbox', { name: /^(Search settings|搜索设置)$/ });
  const before = (await dialog.boundingBox())!;
  const searchBox = (await search.boundingBox())!;
  const handleX = searchBox.x - 80;
  const handleY = searchBox.y + searchBox.height / 2;
  const viewport = page.viewportSize()!;

  await page.mouse.move(handleX, handleY);
  await page.mouse.down();
  await page.mouse.move(viewport.width - 1, viewport.height - 1, { steps: 8 });
  await page.mouse.up();
  const moved = (await dialog.boundingBox())!;
  expect(moved.x).toBeGreaterThan(before.x);
  expect(moved.y).toBeGreaterThan(before.y);
  expect(moved.x + moved.width).toBeLessThanOrEqual(viewport.width);
  expect(moved.y + moved.height).toBeLessThanOrEqual(viewport.height);

  await search.click();
  await search.pressSequentially('font');
  await expect(search).toHaveValue('font');
  await search.press('Escape');
  await expect(search).toHaveValue('');
  await openSettingsCategory(page, 'Typography');
  const scroller = dialog.locator('.scroll-pt-20');
  await scroller.hover();
  await page.mouse.wheel(0, 400);
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await dialog.boundingBox()).toEqual(moved);

  const evidence = path.resolve('.tmp/artifacts/T760');
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: path.join(evidence, 'settings-panel-moved.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await openSettingsDialog(page);
  expect(await dialog.boundingBox()).toEqual(before);
  await page.mouse.click(5, viewport.height - 5);
  await expect(dialog).toBeHidden();
});
